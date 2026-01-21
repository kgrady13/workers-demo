"use client";

import { useState, useEffect } from "react";
import WorkerList from "@/components/WorkerList";
import CodeEditor from "@/components/CodeEditor";
import FunctionInvoker from "@/components/FunctionInvoker";
import LogViewer from "@/components/LogViewer";

interface Worker {
  id: string;
  name: string;
  snapshotId: string;
  status: "creating" | "ready" | "error" | "expired";
  functions: string[];
  errorMessage: string | null;
  expiresInDays?: number | null;
}

interface LogEntry {
  timestamp: number;
  level: string;
  message: string;
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

  useEffect(() => {
    fetchWorkers();
  }, []);

  async function fetchWorkers() {
    try {
      const res = await fetch("/api/workers");
      if (res.ok) setWorkers(await res.json());
    } catch (err) {
      console.error("Failed to fetch workers:", err);
    }
  }

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
      if (!res.ok) throw new Error(data.error || "Deployment failed");

      // With sandboxes, workers are ready immediately (no build phase)
      const newWorker: Worker = {
        id: data.id,
        name: data.name,
        snapshotId: data.snapshotId,
        status: data.status, // Should be 'ready' immediately
        functions: data.functions,
        errorMessage: null,
        expiresInDays: data.expiresInDays,
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
        if (selectedWorker?.id === id) setSelectedWorker(null);
      }
    } catch (err) {
      console.error("Failed to delete worker:", err);
    }
  }

  // Handle individual log entries (real-time streaming)
  function handleLog(log: LogEntry) {
    setLogs((prev) => [...prev, log]);
  }

  // Handle streaming state changes
  function handleStreamingChange(streaming: boolean) {
    setIsStreaming(streaming);
    if (streaming) {
      // Clear logs when starting a new invocation
      setLogs([]);
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
            Deploy code → Get snapshot → Invoke functions with real-time logs
          </p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
                      Creating Snapshot...
                    </>
                  ) : (
                    "Deploy Worker"
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-1 space-y-6">
            {selectedWorker ? (
              <>
                <FunctionInvoker
                  worker={selectedWorker}
                  onLog={handleLog}
                  onStreamingChange={handleStreamingChange}
                />
                <LogViewer
                  worker={selectedWorker}
                  logs={logs}
                  onClear={() => setLogs([])}
                  isStreaming={isStreaming}
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
