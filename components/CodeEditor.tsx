'use client';

interface CodeEditorProps {
  code: string;
  onChange: (code: string) => void;
}

export default function CodeEditor({ code, onChange }: CodeEditorProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
        Worker Code
      </label>
      <div className="relative">
        <textarea
          value={code}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-72 px-3 py-2 font-mono text-sm border border-zinc-300 dark:border-zinc-700 rounded-md bg-zinc-900 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          spellCheck={false}
          placeholder={`export async function myFunction(payload: any) {
  // Your code here
  console.log('Processing:', payload);
  return { result: 'success' };
}`}
        />
        <div className="absolute top-2 right-2 text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded">
          TypeScript
        </div>
      </div>
      <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
        Export async functions that accept a payload and return a result.
        Each exported function will be callable via the API.
      </p>
    </div>
  );
}
