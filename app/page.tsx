"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import WorkerList from "@/components/WorkerList";
import CodeEditor from "@/components/CodeEditor";
import FunctionInvoker from "@/components/FunctionInvoker";
import LogViewer from "@/components/LogViewer";

interface Worker {
  id: string;
  name: string;
  deploymentId: string;
  deploymentUrl: string;
  status: "building" | "ready" | "error";
  functions: string[];
  errorMessage: string | null;
}

interface LogEntry {
  timestamp: number;
  level: string;
  message: string;
  source?: string;
}

const DEFAULT_CODE = `export async function countdown(payload: any) {
  const start = payload.from || 5;
  console.log(\`Starting countdown from \${start}...\`);

  for (let i = start; i > 0; i--) {
    console.log(\`  \${i}...\`);
    await new Promise(r => setTimeout(r, 200));
  }

  console.log('Liftoff!');
  return {
    counted: start,
    message: 'Countdown complete!',
    timestamp: new Date().toISOString()
  };
}

export async function fetchData(payload: any) {
  const url = payload.url || 'https://jsonplaceholder.typicode.com/posts/1';
  console.log(\`Fetching: \${url}\`);

  const response = await fetch(url);
  const data = await response.json();

  return { status: response.status, data };
}
`;

export default function Home() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [code, setCode] = useState(DEFAULT_CODE);
  const [workerName, setWorkerName] = useState("my-worker");
  const [isDeploying, setIsDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);

  useEffect(() => {
    fetchWorkers();
  }, []);

  // Poll for building workers
  useEffect(() => {
    const building = workers.filter((w) => w.status === "building");
    if (building.length === 0) return;

    const interval = setInterval(() => {
      building.forEach((w) => refreshWorker(w.id));
    }, 3000);

    return () => clearInterval(interval);
  }, [workers]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  // Stop streaming when worker changes
  useEffect(() => {
    stopStreaming();
  }, [selectedWorker?.id]);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const seenLogsRef = useRef<Set<string>>(new Set());

  const startStreaming = useCallback(() => {
    if (!selectedWorker) return;

    // Clear previous polling
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }

    setStreamError(null);
    setIsStreaming(true);
    setLogs([]);
    seenLogsRef.current = new Set();

    // Poll for logs every 1 second
    const poll = async () => {
      try {
        const res = await fetch(`/api/workers/${selectedWorker.id}/logs/poll`);
        if (!res.ok) {
          const data = await res.json();
          setStreamError(data.error || 'Failed to fetch logs');
          return;
        }
        const data = await res.json();
        if (data.logs && Array.isArray(data.logs)) {
          const newLogs: LogEntry[] = [];
          for (const log of data.logs) {
            // Create unique key for deduplication
            const key = `${log.timestamp}-${log.message}`;
            if (!seenLogsRef.current.has(key)) {
              seenLogsRef.current.add(key);
              newLogs.push(log);
            }
          }
          if (newLogs.length > 0) {
            setLogs((prev) => [...prev, ...newLogs]);
          }
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    };

    // Initial poll
    poll();
    // Then poll every second
    pollingRef.current = setInterval(poll, 1000);
  }, [selectedWorker]);

  const stopStreaming = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  async function fetchWorkers() {
    try {
      const res = await fetch("/api/workers");
      if (res.ok) {
        setWorkers(await res.json());
      }
    } catch (err) {
      console.error("Failed to fetch workers:", err);
    }
  }

  const refreshWorker = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/workers/${id}`);
      if (res.ok) {
        const updated = await res.json();
        setWorkers((prev) => prev.map((w) => (w.id === id ? updated : w)));
        setSelectedWorker((prev) => (prev?.id === id ? updated : prev));
      }
    } catch (err) {
      console.error("Failed to refresh worker:", err);
    }
  }, []);

  async function handleDeploy() {
    if (!workerName.trim()) {
      setError("Please enter a worker name");
      return;
    }

    setIsDeploying(true);
    setError(null);

    try {
      const res = await fetch("/api/workers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: workerName.trim(), code }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Deployment failed");
      }

      const newWorker: Worker = {
        id: data.id,
        name: data.name,
        deploymentId: data.deploymentId,
        deploymentUrl: data.deploymentUrl,
        status: "building",
        functions: data.functions,
        errorMessage: null,
      };

      setWorkers((prev) => [newWorker, ...prev]);
      setSelectedWorker(newWorker);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deployment failed");
    } finally {
      setIsDeploying(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/workers/${id}`, { method: "DELETE" });
      if (res.ok) {
        setWorkers((prev) => prev.filter((w) => w.id !== id));
        if (selectedWorker?.id === id) {
          setSelectedWorker(null);
        }
      }
    } catch (err) {
      console.error("Failed to delete worker:", err);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Workers Platform
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400 mt-1">
            Deploy code → Get immutable URL → Invoke functions
          </p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Worker list */}
          <div className="lg:col-span-1">
            <WorkerList
              workers={workers}
              selectedWorker={selectedWorker}
              onSelect={(w) => {
                setSelectedWorker(w);
                setLogs([]);
              }}
              onDelete={handleDelete}
            />
          </div>

          {/* Middle: Deploy */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-zinc-950 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
              <h2 className="text-lg font-semibold mb-4 text-zinc-900 dark:text-zinc-100">
                Deploy Worker
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Worker Name
                  </label>
                  <input
                    type="text"
                    value={workerName}
                    onChange={(e) => setWorkerName(e.target.value)}
                    placeholder="my-worker"
                    className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                  />
                </div>

                <CodeEditor code={code} onChange={setCode} />

                {error && (
                  <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md">
                    <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
                  </div>
                )}

                <button
                  onClick={handleDeploy}
                  disabled={isDeploying}
                  className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-md flex items-center justify-center gap-2"
                >
                  {isDeploying ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Deploying...
                    </>
                  ) : (
                    "Deploy Worker"
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Right: Invoke + Logs */}
          <div className="lg:col-span-1 space-y-6">
            {selectedWorker ? (
              <>
                {/* Show deployment URL prominently */}
                {selectedWorker.status === "ready" && (
                  <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4">
                    <p className="text-sm font-medium text-green-800 dark:text-green-200 mb-1">
                      Immutable Deployment URL
                    </p>
                    <code className="text-xs text-green-700 dark:text-green-300 break-all">
                      {selectedWorker.deploymentUrl}
                    </code>
                  </div>
                )}

                <FunctionInvoker
                  worker={selectedWorker}
                  onLogs={(newLogs) => {
                    // Only use batch logs if not streaming
                    if (!isStreaming) {
                      setLogs(newLogs);
                    }
                  }}
                />
                <LogViewer
                  worker={selectedWorker}
                  logs={logs}
                  onClear={() => setLogs([])}
                  isStreaming={isStreaming}
                  streamError={streamError}
                  onStartStream={startStreaming}
                  onStopStream={stopStreaming}
                />
              </>
            ) : (
              <div className="bg-white dark:bg-zinc-950 rounded-lg border border-zinc-200 dark:border-zinc-800 p-8 text-center">
                <p className="text-zinc-500 dark:text-zinc-400">
                  Select a worker or deploy a new one
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
