// Sandbox-based schema - each worker = one snapshot

export const schema = `
-- Drop old tables from previous implementation
DROP TABLE IF EXISTS workers CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;

-- Workers table (each worker = one snapshot)
CREATE TABLE workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  snapshot_id VARCHAR(255) NOT NULL,
  functions TEXT[] DEFAULT '{}',
  status VARCHAR(50) DEFAULT 'creating' CHECK (status IN ('creating', 'ready', 'error', 'expired')),
  error_message TEXT,
  source_code TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  snapshot_expires_at TIMESTAMP WITH TIME ZONE,
  last_invoked_at TIMESTAMP WITH TIME ZONE
);

-- Index for quick lookups
CREATE INDEX idx_workers_snapshot_id ON workers(snapshot_id);
`;

export interface Worker {
  id: string;
  name: string;
  snapshot_id: string;
  functions: string[];
  status: 'creating' | 'ready' | 'error' | 'expired';
  error_message: string | null;
  source_code: string;
  created_at: Date;
  snapshot_expires_at: Date | null;
  last_invoked_at: Date | null;
}

export interface WorkerResponse {
  id: string;
  name: string;
  snapshotId: string;
  functions: string[];
  status: 'creating' | 'ready' | 'error' | 'expired';
  errorMessage: string | null;
  createdAt: string;
  snapshotExpiresAt: string | null;
  lastInvokedAt: string | null;
  expiresInDays: number | null;
}
