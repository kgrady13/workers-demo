'use client';

import { useState, useEffect } from 'react';

interface Worker {
  id: string;
  name: string;
  snapshotId: string;
  status: 'creating' | 'ready' | 'error' | 'expired';
  functions: string[];
  errorMessage: string | null;
}

interface LogEntry {
  timestamp: number;
  level: string;
  message: string;
}

interface FunctionInvokerProps {
  worker: Worker;
  onLog?: (log: LogEntry) => void;
  onStreamingChange?: (isStreaming: boolean) => void;
}

export default function FunctionInvoker({ worker, onLog, onStreamingChange }: FunctionInvokerProps) {
  const [selectedFunction, setSelectedFunction] = useState('');
  const [payload, setPayload] = useState('{}');
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [isInvoking, setIsInvoking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);

  // Update selected function when worker changes
  useEffect(() => {
    if (worker.functions && worker.functions.length > 0) {
      setSelectedFunction(worker.functions[0]);
    } else {
      setSelectedFunction('');
    }
    setResult(null);
    setError(null);
  }, [worker.id, worker.functions]);

  async function handleInvoke() {
    if (!selectedFunction) return;

    setIsInvoking(true);
    setError(null);
    setResult(null);
    setDuration(null);
    onStreamingChange?.(true);

    const startTime = Date.now();

    try {
      let parsedPayload;
      try {
        parsedPayload = JSON.parse(payload);
      } catch {
        throw new Error('Invalid JSON payload');
      }

      // Use SSE streaming for real-time logs
      const res = await fetch(`/api/workers/${worker.id}/invoke/${selectedFunction}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify(parsedPayload),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Invocation failed');
      }

      // Read SSE stream
      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let eventType = '';
        let eventData = '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7);
          } else if (line.startsWith('data: ')) {
            eventData = line.slice(6);
          } else if (line === '' && eventType && eventData) {
            // Process complete event
            try {
              const data = JSON.parse(eventData);

              if (eventType === 'log' && onLog) {
                onLog({
                  timestamp: data.timestamp,
                  level: data.stream === 'stderr' ? 'error' : 'info',
                  message: data.message,
                });
              } else if (eventType === 'result') {
                setDuration(data.duration || (Date.now() - startTime));
                setResult(data);
              } else if (eventType === 'error') {
                throw new Error(data.error);
              }
            } catch (e) {
              if (e instanceof SyntaxError) {
                console.error('Failed to parse SSE data:', eventData);
              } else {
                throw e;
              }
            }

            eventType = '';
            eventData = '';
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invocation failed');
      setDuration(Date.now() - startTime);
    } finally {
      setIsInvoking(false);
      onStreamingChange?.(false);
    }
  }

  if (worker.status === 'expired') {
    return (
      <div className="bg-white dark:bg-zinc-950 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
          Invoke Function
        </h2>
        <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
          <span className="text-amber-500">Worker snapshot has expired. Please redeploy.</span>
        </div>
      </div>
    );
  }

  if (worker.status !== 'ready') {
    return (
      <div className="bg-white dark:bg-zinc-950 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
          Invoke Function
        </h2>
        <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
          {worker.status === 'creating' && (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Worker is being created...</span>
            </>
          )}
          {worker.status === 'error' && (
            <span className="text-red-500">Worker deployment failed</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-zinc-950 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
        Invoke Function
      </h2>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
            Function
          </label>
          <select
            value={selectedFunction}
            onChange={(e) => setSelectedFunction(e.target.value)}
            className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {worker.functions.map((fn) => (
              <option key={fn} value={fn}>
                {fn}()
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
            Payload (JSON)
          </label>
          <textarea
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            className="w-full h-24 px-3 py-2 font-mono text-sm border border-zinc-300 dark:border-zinc-700 rounded-md bg-zinc-900 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            spellCheck={false}
          />
        </div>

        <button
          onClick={handleInvoke}
          disabled={isInvoking || !selectedFunction}
          className="w-full py-2 px-4 bg-green-600 hover:bg-green-700 disabled:bg-green-400 disabled:cursor-not-allowed text-white font-medium rounded-md transition-colors flex items-center justify-center gap-2"
        >
          {isInvoking ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Invoking...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Invoke
            </>
          )}
        </button>

        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md">
            <p className="text-red-600 dark:text-red-400 text-sm font-medium">Error</p>
            <p className="text-red-600 dark:text-red-400 text-sm mt-1">{error}</p>
            {duration !== null && (
              <p className="text-red-500 dark:text-red-500 text-xs mt-2">
                Duration: {duration}ms
              </p>
            )}
          </div>
        )}

        {result && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Result
              </label>
              {duration !== null && (
                <span className="text-xs text-zinc-500">
                  {duration}ms
                </span>
              )}
            </div>
            <pre className="p-3 bg-zinc-900 border border-zinc-700 rounded-md overflow-x-auto text-sm text-zinc-100 font-mono max-h-64 overflow-y-auto">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
