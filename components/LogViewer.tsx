'use client';

import { useEffect, useRef } from 'react';

interface Worker {
  id: string;
  status: 'creating' | 'ready' | 'error' | 'expired';
}

interface LogEntry {
  timestamp: number;
  level: string;
  message: string;
}

interface LogViewerProps {
  worker: Worker;
  logs: LogEntry[];
  onClear: () => void;
  isStreaming?: boolean;
}

const levelColors: Record<string, string> = {
  error: 'text-red-400',
  warn: 'text-yellow-400',
  warning: 'text-yellow-400',
  info: 'text-blue-400',
};

export default function LogViewer({ worker, logs, onClear, isStreaming }: LogViewerProps) {
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length]);

  function formatTimestamp(ms: number): string {
    return new Date(ms).toISOString().slice(11, 23);
  }

  return (
    <div className="bg-white dark:bg-zinc-950 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Logs
          </h2>
          {isStreaming && (
            <span className="flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded-full">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              Streaming
            </span>
          )}
        </div>
        <button
          onClick={onClear}
          className="px-3 py-1 text-sm bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-md transition-colors"
        >
          Clear
        </button>
      </div>

      <div className="h-64 overflow-y-auto bg-zinc-900 rounded-md p-3 font-mono text-xs">
        {logs.length === 0 ? (
          <div className="text-zinc-500 h-full flex items-center justify-center">
            {worker.status === 'ready' ? 'Invoke a function to see logs' : 'Worker must be ready'}
          </div>
        ) : (
          logs.map((log, i) => (
            <div key={`${log.timestamp}-${i}`} className="py-0.5">
              <span className="text-zinc-500">{formatTimestamp(log.timestamp)}</span>
              <span className={`ml-2 ${levelColors[log.level] || 'text-zinc-400'}`}>
                [{log.level.toUpperCase()}]
              </span>
              <span className="ml-2 text-zinc-300">{log.message}</span>
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>

      <div className="mt-2 text-xs text-zinc-500">
        {logs.length} log entries
      </div>
    </div>
  );
}
