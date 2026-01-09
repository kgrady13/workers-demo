"use client";

import { useState, useEffect, useCallback } from "react";
import WorkerList from "@/components/WorkerList";
import CodeEditor from "@/components/CodeEditor";
import FunctionInvoker from "@/components/FunctionInvoker";
import LogViewer from "@/components/LogViewer";

interface Worker {
  id: string;
  name: string;
  tenantId: string;
  status: "building" | "ready" | "error";
  functions: string[];
  vercelDeploymentUrl: string | null;
  errorMessage: string | null;
}

interface Tenant {
  id: string;
  name: string;
}

const DEFAULT_CODE = `export async function countdown(payload: any) {
  const start = payload.from || 5;
  console.log(\`Starting countdown from \${start}...\`);

  for (let i = start; i > 0; i--) {
    console.log(\`  \${i}...\`);
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('Liftoff! 🚀');
  return {
    counted: start,
    message: 'Countdown complete!',
    timestamp: new Date().toISOString()
  };
}

export async function fetchData(payload: any) {
  const url = payload.url || 'https://jsonplaceholder.typicode.com/posts/1';
  console.log(\`Fetching data from: \${url}\`);

  const start = Date.now();
  const response = await fetch(url);
  const data = await response.json();
  const duration = Date.now() - start;

  console.log(\`Fetched in \${duration}ms - Status: \${response.status}\`);
  return {
    status: response.status,
    duration,
    data
  };
}

export async function transform(payload: any) {
  console.log('Input:', JSON.stringify(payload));

  const result = {
    ...payload,
    processed: true,
    uppercase: payload.text?.toUpperCase(),
    reversed: payload.text?.split('').reverse().join(''),
    timestamp: new Date().toISOString()
  };

  console.log('Output:', JSON.stringify(result));
  return result;
}
`;

export default function Home() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [code, setCode] = useState(DEFAULT_CODE);
  const [workerName, setWorkerName] = useState("my-worker");
  const [tenantId, setTenantId] = useState("");
  const [newTenantName, setNewTenantName] = useState("");
  const [isDeploying, setIsDeploying] = useState(false);
  const [isCreatingTenant, setIsCreatingTenant] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNewTenant, setShowNewTenant] = useState(false);

  // Fetch workers and tenants on mount
  useEffect(() => {
    fetchWorkers();
    fetchTenants();
  }, []);

  // Poll for worker status updates
  useEffect(() => {
    const buildingWorkers = workers.filter((w) => w.status === "building");
    if (buildingWorkers.length === 0) return;

    const interval = setInterval(() => {
      buildingWorkers.forEach((worker) => {
        refreshWorkerStatus(worker.id);
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [workers]);

  async function fetchTenants() {
    try {
      const res = await fetch("/api/tenants");
      if (res.ok) {
        const data = await res.json();
        setTenants(data);
        if (data.length > 0 && !tenantId) {
          setTenantId(data[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to fetch tenants:", err);
    }
  }

  async function fetchWorkers() {
    try {
      const res = await fetch("/api/workers");
      if (res.ok) {
        const data = await res.json();
        setWorkers(data);
      }
    } catch (err) {
      console.error("Failed to fetch workers:", err);
    }
  }

  const refreshWorkerStatus = useCallback(async (workerId: string) => {
    try {
      const res = await fetch(`/api/workers/${workerId}`);
      if (res.ok) {
        const updated = await res.json();
        setWorkers((prev) =>
          prev.map((w) => (w.id === workerId ? updated : w))
        );
        setSelectedWorker((prev) => (prev?.id === workerId ? updated : prev));
      }
    } catch (err) {
      console.error("Failed to refresh worker status:", err);
    }
  }, []);

  async function handleCreateTenant() {
    if (!newTenantName.trim()) {
      setError("Please enter a tenant name");
      return;
    }

    setIsCreatingTenant(true);
    setError(null);

    try {
      const res = await fetch("/api/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTenantName.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create tenant");
      }

      setTenants((prev) => [data, ...prev]);
      setTenantId(data.id);
      setNewTenantName("");
      setShowNewTenant(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create tenant");
    } finally {
      setIsCreatingTenant(false);
    }
  }

  async function handleDeploy() {
    if (!tenantId) {
      setError("Please select or create a tenant");
      return;
    }

    if (!workerName.trim()) {
      setError("Please enter a worker name");
      return;
    }

    setIsDeploying(true);
    setError(null);

    try {
      const res = await fetch(`/api/tenants/${tenantId}/workers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: workerName.trim(), code }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Deployment failed");
      }

      // Add new worker to list
      const newWorker: Worker = {
        id: data.id,
        name: data.name,
        tenantId,
        status: "building",
        functions: data.functions,
        vercelDeploymentUrl: null,
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

  async function handleDelete(workerId: string) {
    try {
      const res = await fetch(`/api/workers/${workerId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setWorkers((prev) => prev.filter((w) => w.id !== workerId));
        if (selectedWorker?.id === workerId) {
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
            Deploy and invoke TypeScript worker functions
          </p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column: Worker list */}
          <div className="lg:col-span-1">
            <WorkerList
              workers={workers}
              selectedWorker={selectedWorker}
              onSelect={setSelectedWorker}
              onDelete={handleDelete}
            />
          </div>

          {/* Middle column: Code editor */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-zinc-950 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
              <h2 className="text-lg font-semibold mb-4 text-zinc-900 dark:text-zinc-100">
                Deploy Worker
              </h2>

              <div className="space-y-4">
                {/* Tenant selector */}
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Tenant
                  </label>
                  {showNewTenant ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newTenantName}
                        onChange={(e) => setNewTenantName(e.target.value)}
                        placeholder="Tenant name"
                        className="flex-1 px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        onClick={handleCreateTenant}
                        disabled={isCreatingTenant}
                        className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-md transition-colors"
                      >
                        {isCreatingTenant ? "..." : "Create"}
                      </button>
                      <button
                        onClick={() => setShowNewTenant(false)}
                        className="px-3 py-2 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-md transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <select
                        value={tenantId}
                        onChange={(e) => setTenantId(e.target.value)}
                        className="flex-1 px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Select a tenant...</option>
                        {tenants.map((tenant) => (
                          <option key={tenant.id} value={tenant.id}>
                            {tenant.name}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => setShowNewTenant(true)}
                        className="px-3 py-2 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-md transition-colors"
                        title="Create new tenant"
                      >
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 4v16m8-8H4"
                          />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Worker Name
                  </label>
                  <input
                    type="text"
                    value={workerName}
                    onChange={(e) => setWorkerName(e.target.value)}
                    placeholder="my-worker"
                    className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <CodeEditor code={code} onChange={setCode} />

                {error && (
                  <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md">
                    <p className="text-red-600 dark:text-red-400 text-sm">
                      {error}
                    </p>
                  </div>
                )}

                <button
                  onClick={handleDeploy}
                  disabled={isDeploying || !tenantId}
                  className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white font-medium rounded-md transition-colors flex items-center justify-center gap-2"
                >
                  {isDeploying ? (
                    <>
                      <svg
                        className="w-4 h-4 animate-spin"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Deploying...
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                        />
                      </svg>
                      Deploy Worker
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Right column: Function invoker + Logs */}
          <div className="lg:col-span-1 space-y-6">
            {selectedWorker ? (
              <>
                <FunctionInvoker worker={selectedWorker} />
                <LogViewer worker={selectedWorker} />
              </>
            ) : (
              <div className="bg-white dark:bg-zinc-950 rounded-lg border border-zinc-200 dark:border-zinc-800 p-8 text-center">
                <svg
                  className="w-12 h-12 mx-auto text-zinc-300 dark:text-zinc-700 mb-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                <p className="text-zinc-500 dark:text-zinc-400">
                  Select a worker to invoke functions and view logs
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-6 py-4 mt-8">
        <div className="max-w-7xl mx-auto text-center text-sm text-zinc-500 dark:text-zinc-400">
          Workers Platform PoC - Powered by Vercel
        </div>
      </footer>
    </div>
  );
}
