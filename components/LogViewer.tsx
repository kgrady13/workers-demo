'use client';

import { useState, useEffect, useRef } from 'react';

interface Worker {
  id: string;
  name: string;
  tenantId: string;
  status: 'building' | 'ready' | 'error';
  functions: string[];
  vercelDeploymentUrl: string | null;
  errorMessage: string | null;
}

interface LogEntry {
  level: 'error' | 'warning' | 'info';
  message: string;
  timestampInMs: number;
  requestPath?: string;
  source?: string;
}

interface LogViewerProps {
  worker: Worker;
}

const levelColors = {
  error: 'text-red-400',
  warning: 'text-yellow-400',
  info: 'text-blue-400',
};

const levelBg = {
  error: 'bg-red-500/10',
  warning: 'bg-yellow-500/10',
  info: 'bg-transparent',
};

export default function LogViewer({ worker }: LogViewerProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Cleanup on unmount or worker change
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, [worker.id]);

  // Stop streaming when worker changes
  useEffect(() => {
    stopStreaming();
    setLogs([]);
    setError(null);
  }, [worker.id]);

  function startStreaming() {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setIsStreaming(true);
    setError(null);

    const eventSource = new EventSource(`/api/workers/${worker.id}/logs`);
    eventSourceRef.current = eventSource;

    eventSource.addEventListener('connected', () => {
      console.log('Log stream connected');
    });

    eventSource.addEventListener('log', (event) => {
      const log = JSON.parse(event.data) as LogEntry;
      setLogs((prev) => [...prev.slice(-199), log]); // Keep last 200 logs
    });

    eventSource.addEventListener('error', (event) => {
      console.error('Log stream error:', event);
      setError('Connection lost. Click "Start Streaming" to reconnect.');
      setIsStreaming(false);
    });

    eventSource.onerror = () => {
      eventSource.close();
      setIsStreaming(false);
    };
  }

  function stopStreaming() {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setIsStreaming(false);
  }

  async function loadHistory() {
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch(`/api/workers/${worker.id}/logs/history?limit=50`);
      const data = await res.json();

      if (res.ok) {
        setLogs(data.logs || []);
      } else {
        setError(data.error || 'Failed to load logs');
      }
    } catch (err) {
      setError('Failed to load log history');
    } finally {
      setIsLoading(false);
    }
  }

  function clearLogs() {
    setLogs([]);
    setError(null);
  }

  function formatTimestamp(ms: number): string {
    return new Date(ms).toISOString().slice(11, 23);
  }

  return (
    <div className="bg-white dark:bg-zinc-950 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Logs
        </h2>
        <div className="flex gap-2">
          <button
            onClick={clearLogs}
            className="px-3 py-1 text-sm bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-md transition-colors"
          >
            Clear
          </button>
          <button
            onClick={loadHistory}
            disabled={isLoading || worker.status !== 'ready'}
            className="px-3 py-1 text-sm bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Loading...' : 'Load History'}
          </button>
          <button
            onClick={isStreaming ? stopStreaming : startStreaming}
            disabled={worker.status !== 'ready'}
            className={`px-3 py-1 text-sm rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              isStreaming
                ? 'bg-red-100 hover:bg-red-200 dark:bg-red-900 dark:hover:bg-red-800 text-red-700 dark:text-red-300'
                : 'bg-green-100 hover:bg-green-200 dark:bg-green-900 dark:hover:bg-green-800 text-green-700 dark:text-green-300'
            }`}
          >
            {isStreaming ? 'Stop' : 'Start'} Stream
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="h-64 overflow-y-auto bg-zinc-900 rounded-md p-3 font-mono text-xs">
        {logs.length === 0 ? (
          <div className="text-zinc-500 h-full flex items-center justify-center">
            {worker.status === 'ready' ? (
              <span>No logs yet. Invoke a function or click &quot;Start Stream&quot;</span>
            ) : (
              <span>Worker must be ready to view logs</span>
            )}
          </div>
        ) : (
          logs.map((log, index) => (
            <div
              key={`${log.timestampInMs}-${index}`}
              className={`py-0.5 px-1 rounded ${levelBg[log.level]}`}
            >
              <span className="text-zinc-500">
                {formatTimestamp(log.timestampInMs)}
              </span>
              <span className={`ml-2 font-medium ${levelColors[log.level]}`}>
                [{log.level.toUpperCase().padEnd(5)}]
              </span>
              {log.requestPath && (
                <span className="ml-2 text-zinc-400">
                  {log.requestPath}
                </span>
              )}
              <span className="ml-2 text-zinc-300 break-all">{log.message}</span>
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>

      {isStreaming && (
        <div className="mt-2 flex items-center gap-2 text-xs text-green-600 dark:text-green-400">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          Streaming logs...
        </div>
      )}
    </div>
  );
}
