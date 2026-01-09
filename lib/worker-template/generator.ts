import { VercelFile } from '../vercel/types';

/**
 * Parse user code to extract exported function names
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
 * Generate the package.json for a worker project
 */
function generatePackageJson(workerName: string): string {
  return JSON.stringify({
    name: workerName,
    version: '1.0.0',
    private: true,
    scripts: {
      dev: 'next dev',
      build: 'next build',
      start: 'next start',
    },
    dependencies: {
      next: '16.1.1',
      react: '19.0.0',
      'react-dom': '19.0.0',
    },
    devDependencies: {
      '@types/node': '^22',
      '@types/react': '^19',
      typescript: '^5',
    },
  }, null, 2);
}

/**
 * Generate next.config.js
 */
function generateNextConfig(): string {
  return `/** @type {import('next').NextConfig} */
const nextConfig = {};

module.exports = nextConfig;
`;
}

/**
 * Generate tsconfig.json
 */
function generateTsConfig(): string {
  return JSON.stringify({
    compilerOptions: {
      target: 'ES2017',
      lib: ['dom', 'dom.iterable', 'esnext'],
      allowJs: true,
      skipLibCheck: true,
      strict: true,
      noEmit: true,
      esModuleInterop: true,
      module: 'esnext',
      moduleResolution: 'bundler',
      resolveJsonModule: true,
      isolatedModules: true,
      jsx: 'preserve',
      incremental: true,
      plugins: [{ name: 'next' }],
      paths: { '@/*': ['./*'] },
    },
    include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
    exclude: ['node_modules'],
  }, null, 2);
}

/**
 * Generate the dynamic API route handler
 * This wraps user code and exposes functions via /api/invoke/[fn]
 */
function generateApiRoute(userCode: string, functionNames: string[]): string {
  return `import { NextRequest, NextResponse } from 'next/server';

// User code
${userCode}

// Function registry
const functions: Record<string, (payload: any) => Promise<any>> = {
${functionNames.map(fn => `  '${fn}': ${fn},`).join('\n')}
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ fn: string }> }
) {
  const { fn } = await params;

  const func = functions[fn];
  if (!func) {
    return NextResponse.json(
      { error: \`Function '\${fn}' not found. Available: \${Object.keys(functions).join(', ')}\` },
      { status: 404 }
    );
  }

  try {
    const payload = await request.json().catch(() => ({}));

    console.log(\`[INVOKE] Function: \${fn}, Payload: \${JSON.stringify(payload)}\`);

    const startTime = Date.now();
    const result = await func(payload);
    const duration = Date.now() - startTime;

    console.log(\`[RESULT] Function: \${fn}, Duration: \${duration}ms, Result: \${JSON.stringify(result)}\`);

    return NextResponse.json({
      success: true,
      function: fn,
      result,
      duration,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(\`[ERROR] Function: \${fn}, Error: \${message}\`);

    return NextResponse.json(
      {
        success: false,
        function: fn,
        error: message,
      },
      { status: 500 }
    );
  }
}

// Health check endpoint
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fn: string }> }
) {
  const { fn } = await params;

  return NextResponse.json({
    status: 'healthy',
    function: fn,
    available: fn in functions,
    allFunctions: Object.keys(functions),
    timestamp: new Date().toISOString(),
  });
}
`;
}

/**
 * Generate a minimal layout for the worker
 */
function generateLayout(): string {
  return `export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`;
}

/**
 * Generate a minimal page (required by Next.js)
 */
function generatePage(functionNames: string[]): string {
  return `export default function Home() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>Worker Functions</h1>
      <p>Available functions:</p>
      <ul>
${functionNames.map(fn => `        <li><code>POST /api/invoke/${fn}</code></li>`).join('\n')}
      </ul>
      <p>Health check: <code>GET /api/invoke/[fn]</code></p>
    </div>
  );
}
`;
}

/**
 * Generate all files for a worker project deployment
 */
export function generateWorkerFiles(
  workerName: string,
  userCode: string
): { files: VercelFile[]; functions: string[] } {
  const functionNames = extractFunctionNames(userCode);

  if (functionNames.length === 0) {
    throw new Error('No exported functions found in worker code. Functions must be exported (e.g., "export async function myFunc(payload) { ... }")');
  }

  const files: VercelFile[] = [
    {
      file: 'package.json',
      data: generatePackageJson(workerName),
    },
    {
      file: 'next.config.js',
      data: generateNextConfig(),
    },
    {
      file: 'tsconfig.json',
      data: generateTsConfig(),
    },
    {
      file: 'app/layout.tsx',
      data: generateLayout(),
    },
    {
      file: 'app/page.tsx',
      data: generatePage(functionNames),
    },
    {
      file: 'app/api/invoke/[fn]/route.ts',
      data: generateApiRoute(userCode, functionNames),
    },
  ];

  return { files, functions: functionNames };
}
