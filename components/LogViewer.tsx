'use client';

import { useEffect, useRef } from 'react';

interface Worker {
  id: string;
  name: string;
  deploymentId: string;
  deploymentUrl: string;
  status: 'building' | 'ready' | 'error';
  functions: string[];
  errorMessage: string | null;
}

interface LogEntry {
  timestamp: number;
  level: string;
  message: string;
  source?: string;
}

interface LogViewerProps {
  worker: Worker;
  logs: LogEntry[];
  onClear: () => void;
  isStreaming: boolean;
  streamError: string | null;
  onStartStream: () => void;
  onStopStream: () => void;
}

const levelColors: Record<string, string> = {
  error: 'text-red-400',
  warn: 'text-yellow-400',
  warning: 'text-yellow-400',
  info: 'text-blue-400',
};

const levelBg: Record<string, string> = {
  error: 'bg-red-500/10',
  warn: 'bg-yellow-500/10',
  warning: 'bg-yellow-500/10',
  info: 'bg-transparent',
};

export default function LogViewer({
  worker,
  logs,
  onClear,
  isStreaming,
  streamError,
  onStartStream,
  onStopStream,
}: LogViewerProps) {
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length]);

  function formatTimestamp(ms: number): string {
    return new Date(ms).toISOString().slice(11, 23);
  }

  return (
    <div className="bg-white dark:bg-zinc-950 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Logs
          {isStreaming && (
            <span className="ml-2 inline-flex items-center">
              <span className="animate-pulse h-2 w-2 bg-green-500 rounded-full mr-1"></span>
              <span className="text-xs text-green-500 font-normal">Live</span>
            </span>
          )}
        </h2>
        <div className="flex gap-2">
          {worker.status === 'ready' && (
            <button
              onClick={isStreaming ? onStopStream : onStartStream}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                isStreaming
                  ? 'bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300'
                  : 'bg-green-100 hover:bg-green-200 dark:bg-green-900/30 dark:hover:bg-green-900/50 text-green-700 dark:text-green-300'
              }`}
            >
              {isStreaming ? 'Stop' : 'Stream'}
            </button>
          )}
          <button
            onClick={onClear}
            className="px-3 py-1 text-sm bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-md transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {streamError && (
        <div className="mb-3 px-3 py-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm rounded-md">
          {streamError}
        </div>
      )}

      <div className="h-64 overflow-y-auto bg-zinc-900 rounded-md p-3 font-mono text-xs">
        {logs.length === 0 ? (
          <div className="text-zinc-500 h-full flex items-center justify-center text-center">
            {worker.status === 'ready' ? (
              <span>Invoke a function to see logs</span>
            ) : (
              <span>Worker must be ready to view logs</span>
            )}
          </div>
        ) : (
          logs.map((log, index) => (
            <div
              key={`${log.timestamp}-${index}`}
              className={`py-0.5 px-1 rounded ${levelBg[log.level] || 'bg-transparent'}`}
            >
              <span className="text-zinc-500">
                {formatTimestamp(log.timestamp)}
              </span>
              <span className={`ml-2 font-medium ${levelColors[log.level] || 'text-zinc-400'}`}>
                [{log.level.toUpperCase().padEnd(5)}]
              </span>
              <span className="ml-2 text-zinc-300 break-all">{log.message}</span>
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
