'use client';

interface Worker {
  id: string;
  name: string;
  snapshotId: string;
  status: 'creating' | 'ready' | 'error' | 'expired';
  functions: string[];
  errorMessage: string | null;
  expiresInDays?: number | null;
}

interface WorkerListProps {
  workers: Worker[];
  selectedWorker: Worker | null;
  onSelect: (worker: Worker) => void;
  onDelete: (workerId: string) => void;
}

const statusColors = {
  creating: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  ready: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  error: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  expired: 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200',
};

const statusIcons = {
  creating: (
    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  ),
  ready: (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  error: (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  expired: (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

export default function WorkerList({
  workers,
  selectedWorker,
  onSelect,
  onDelete,
}: WorkerListProps) {
  return (
    <div className="bg-white dark:bg-zinc-950 rounded-lg border border-zinc-200 dark:border-zinc-800">
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Workers ({workers.length})
        </h2>
      </div>

      <div className="divide-y divide-zinc-200 dark:divide-zinc-800 max-h-[600px] overflow-y-auto">
        {workers.length === 0 ? (
          <div className="px-4 py-8 text-center text-zinc-500 dark:text-zinc-400">
            No workers deployed yet
          </div>
        ) : (
          workers.map((worker) => (
            <div
              key={worker.id}
              onClick={() => onSelect(worker)}
              className={`px-4 py-3 cursor-pointer transition-colors ${
                selectedWorker?.id === worker.id
                  ? 'bg-blue-50 dark:bg-blue-950'
                  : 'hover:bg-zinc-50 dark:hover:bg-zinc-900'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-zinc-900 dark:text-zinc-100 truncate">
                    {worker.name}
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 font-mono">
                    {worker.id.slice(0, 8)}...
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-2">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${
                      statusColors[worker.status]
                    }`}
                  >
                    {statusIcons[worker.status]}
                    {worker.status}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm('Are you sure you want to delete this worker?')) {
                        onDelete(worker.id);
                      }
                    }}
                    className="text-zinc-400 hover:text-red-500 transition-colors p-1"
                    title="Delete worker"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
              {worker.functions && worker.functions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {worker.functions.map((fn) => (
                    <span
                      key={fn}
                      className="px-1.5 py-0.5 text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 rounded font-mono"
                    >
                      {fn}()
                    </span>
                  ))}
                </div>
              )}
              {worker.status === 'error' && worker.errorMessage && (
                <p className="mt-2 text-xs text-red-600 dark:text-red-400 truncate">
                  {worker.errorMessage}
                </p>
              )}
              {worker.status === 'ready' && worker.expiresInDays !== null && worker.expiresInDays !== undefined && worker.expiresInDays <= 2 && (
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                  Expires in {worker.expiresInDays} day{worker.expiresInDays !== 1 ? 's' : ''}
                </p>
              )}
              {worker.status === 'expired' && (
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                  Snapshot expired - redeploy to use
                </p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
