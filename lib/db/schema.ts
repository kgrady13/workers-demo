// Database schema for Workers Platform
// Using Neon Postgres

export const schema = `
-- Tenants table
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Workers table
CREATE TABLE IF NOT EXISTS workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  vercel_project_id VARCHAR(255),
  vercel_deployment_id VARCHAR(255),
  vercel_deployment_url VARCHAR(512),
  functions TEXT[] DEFAULT '{}',
  status VARCHAR(50) DEFAULT 'building' CHECK (status IN ('building', 'ready', 'error')),
  error_message TEXT,
  source_code TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(tenant_id, name)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_workers_tenant_id ON workers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_workers_status ON workers(status);
CREATE INDEX IF NOT EXISTS idx_workers_vercel_project_id ON workers(vercel_project_id);
`;

// TypeScript interfaces matching the schema
export interface Tenant {
  id: string;
  name: string;
  created_at: Date;
  updated_at: Date;
}

export interface Worker {
  id: string;
  tenant_id: string;
  name: string;
  vercel_project_id: string | null;
  vercel_deployment_id: string | null;
  vercel_deployment_url: string | null;
  functions: string[];
  status: "building" | "ready" | "error";
  error_message: string | null;
  source_code: string;
  created_at: Date;
  updated_at: Date;
}

// API response types
export interface TenantResponse {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkerResponse {
  id: string;
  name: string;
  tenantId: string;
  vercelProjectId: string | null;
  vercelDeploymentUrl: string | null;
  functions: string[];
  status: "building" | "ready" | "error";
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}
