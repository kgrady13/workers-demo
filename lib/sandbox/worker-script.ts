/**
 * Parse user code to extract exported function names
 * Reused from the original generator with the same patterns
 */
export function extractFunctionNames(code: string): string[] {
  const functionNames: string[] = [];

  // Match: export async function name(...) or export function name(...)
  const asyncFnRegex = /export\s+(?:async\s+)?function\s+(\w+)\s*\(/g;
  let match;
  while ((match = asyncFnRegex.exec(code)) !== null) {
    functionNames.push(match[1]);
  }

  // Match: export const name = async (...) => or export const name = (...) =>
  const arrowFnRegex = /export\s+const\s+(\w+)\s*=\s*(?:async\s*)?\(/g;
  while ((match = arrowFnRegex.exec(code)) !== null) {
    functionNames.push(match[1]);
  }

  // Match: export const name = async function or export const name = function
  const constFnRegex = /export\s+const\s+(\w+)\s*=\s*(?:async\s+)?function/g;
  while ((match = constFnRegex.exec(code)) !== null) {
    functionNames.push(match[1]);
  }

  return [...new Set(functionNames)]; // Remove duplicates
}

/**
 * Strip TypeScript type annotations from code to make it valid JavaScript
 * This is a careful regex-based approach that only targets actual type annotations
 */
function stripTypeScript(code: string): string {
  let result = code;

  // Remove interface declarations (multiline)
  result = result.replace(/^\s*interface\s+\w+\s*\{[\s\S]*?\n\}/gm, '');

  // Remove type declarations
  result = result.replace(/^\s*type\s+\w+\s*=\s*[^;]+;/gm, '');

  // Remove import type statements
  result = result.replace(/import\s+type\s+[^;]+;/g, '');

  // Remove 'type' keyword from imports: import { type Foo, Bar } from
  result = result.replace(/\{\s*type\s+(\w+)/g, '{ $1');
  result = result.replace(/,\s*type\s+(\w+)/g, ', $1');

  // Remove generic type parameters from function declarations: function foo<T>(
  result = result.replace(/(function\s+\w+)\s*<[^>]+>\s*\(/g, '$1(');

  // Remove return type annotations from function declarations: function foo(): Type {
  result = result.replace(/\)\s*:\s*[\w<>[\]|&\s]+\s*\{/g, ') {');

  // Remove return type annotations from arrow functions: ): Type =>
  result = result.replace(/\)\s*:\s*[\w<>[\]|&\s]+\s*=>/g, ') =>');

  // Remove parameter type annotations inside parentheses
  // Match: (param: Type) or (param: Type, param2: Type)
  // Be careful to only match inside function parameter lists
  result = result.replace(/\(([^)]*)\)/g, (match, params) => {
    // Only process if it looks like a parameter list with type annotations
    if (!params.includes(':')) return match;

    // Split by comma, strip types from each param
    const stripped = params.split(',').map((param: string) => {
      const trimmed = param.trim();
      // Match: paramName: Type or paramName?: Type
      const paramMatch = trimmed.match(/^(\w+)\??:\s*.+$/);
      if (paramMatch) {
        return paramMatch[1];
      }
      // Match: ...paramName: Type (rest params)
      const restMatch = trimmed.match(/^(\.\.\.?\w+):\s*.+$/);
      if (restMatch) {
        return restMatch[1];
      }
      return trimmed;
    }).join(', ');

    return `(${stripped})`;
  });

  // Remove variable type annotations: const x: Type = or let x: Type =
  result = result.replace(/(const|let|var)\s+(\w+)\s*:\s*[\w<>[\]|&\s]+\s*=/g, '$1 $2 =');

  // Remove type assertions: value as Type (but not in object keys like 'has')
  result = result.replace(/(\S)\s+as\s+[\w<>[\]|&]+/g, '$1');

  // Remove non-null assertions: variable!
  result = result.replace(/(\w+)!/g, '$1');

  // Clean up excessive blank lines
  result = result.replace(/\n{3,}/g, '\n\n');

  return result;
}

/**
 * Generate a Node.js worker script from user code
 * This is a simple script that:
 * - Strips TypeScript annotations
 * - Injects user code (with exports transformed)
 * - Creates function registry
 * - Reads function name + payload from argv
 * - Executes function, outputs result with __RESULT__ marker
 * - All console output streams in real-time
 */
export function generateWorkerScript(userCode: string): {
  script: string;
  functions: string[];
} {
  const functionNames = extractFunctionNames(userCode);

  if (functionNames.length === 0) {
    throw new Error(
      'No exported functions found in worker code. Functions must be exported (e.g., "export async function myFunc(payload) { ... }")'
    );
  }

  // Transform the user code:
  // 1. Strip TypeScript type annotations
  // 2. Remove 'export' keywords since we're in a script context
  let transformedCode = stripTypeScript(userCode);
  transformedCode = transformedCode
    .replace(/export\s+async\s+function/g, 'async function')
    .replace(/export\s+function/g, 'function')
    .replace(/export\s+const/g, 'const');

  const script = `// Worker script - generated for sandbox execution
// User code (transformed - exports and TypeScript removed)
${transformedCode}

// Function registry
const functions = {
${functionNames.map((fn) => `  '${fn}': ${fn},`).join('\n')}
};

// Main execution
async function main() {
  const functionName = process.argv[2];
  const payloadJson = process.argv[3] || '{}';

  if (!functionName) {
    console.error('Usage: node worker.js <functionName> [payloadJson]');
    process.exit(1);
  }

  const func = functions[functionName];
  if (!func) {
    console.error(\`Function '\${functionName}' not found. Available: \${Object.keys(functions).join(', ')}\`);
    process.exit(1);
  }

  try {
    const payload = JSON.parse(payloadJson);
    const result = await func(payload);

    // Output result with markers so it can be parsed
    console.log('__RESULT__' + JSON.stringify(result) + '__END_RESULT__');
  } catch (error) {
    console.error('Function error:', error.message || error);
    // Output error result
    console.log('__RESULT__' + JSON.stringify({ __error: true, message: error.message || String(error) }) + '__END_RESULT__');
    process.exit(1);
  }
}

main();
`;

  return { script, functions: functionNames };
}
