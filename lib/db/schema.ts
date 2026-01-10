// Simplified schema - single project, many deployments

export const schema = `
-- Drop old tables from previous implementation
DROP TABLE IF EXISTS workers CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;

-- Workers table (each worker = one deployment)
CREATE TABLE workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  deployment_id VARCHAR(255) NOT NULL,
  deployment_url VARCHAR(512) NOT NULL,
  functions TEXT[] DEFAULT '{}',
  status VARCHAR(50) DEFAULT 'building' CHECK (status IN ('building', 'ready', 'error')),
  error_message TEXT,
  source_code TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX idx_workers_deployment_id ON workers(deployment_id);
`;

export interface Worker {
  id: string;
  name: string;
  deployment_id: string;
  deployment_url: string;
  functions: string[];
  status: 'building' | 'ready' | 'error';
  error_message: string | null;
  source_code: string;
  created_at: Date;
}

export interface WorkerResponse {
  id: string;
  name: string;
  deploymentId: string;
  deploymentUrl: string;
  functions: string[];
  status: 'building' | 'ready' | 'error';
  errorMessage: string | null;
  createdAt: string;
}
