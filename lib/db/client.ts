import { neon } from '@neondatabase/serverless';
import { Tenant, Worker } from './schema';

function getDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }
  return neon(databaseUrl);
}

export const db = {
  // Tenant operations
  async createTenant(name: string): Promise<Tenant> {
    const sql = getDb();
    const result = await sql`
      INSERT INTO tenants (name)
      VALUES (${name})
      RETURNING *
    `;
    return result[0] as Tenant;
  },

  async getTenant(id: string): Promise<Tenant | null> {
    const sql = getDb();
    const result = await sql`
      SELECT * FROM tenants WHERE id = ${id}
    `;
    return (result[0] as Tenant) || null;
  },

  async getAllTenants(): Promise<Tenant[]> {
    const sql = getDb();
    const result = await sql`
      SELECT * FROM tenants ORDER BY created_at DESC
    `;
    return result as Tenant[];
  },

  // Worker operations
  async createWorker(data: {
    tenantId: string;
    name: string;
    sourceCode: string;
  }): Promise<Worker> {
    const sql = getDb();
    const result = await sql`
      INSERT INTO workers (tenant_id, name, source_code, status)
      VALUES (${data.tenantId}, ${data.name}, ${data.sourceCode}, 'building')
      RETURNING *
    `;
    return result[0] as Worker;
  },

  async updateWorker(
    id: string,
    data: Partial<{
      vercel_project_id: string;
      vercel_deployment_id: string;
      vercel_deployment_url: string;
      functions: string[];
      status: 'building' | 'ready' | 'error';
      error_message: string;
    }>
  ): Promise<Worker | null> {
    const sql = getDb();

    // Build dynamic update query
    const updates: string[] = [];
    const values: Record<string, unknown> = { id };

    if (data.vercel_project_id !== undefined) {
      updates.push('vercel_project_id = ${vercel_project_id}');
      values.vercel_project_id = data.vercel_project_id;
    }
    if (data.vercel_deployment_id !== undefined) {
      updates.push('vercel_deployment_id = ${vercel_deployment_id}');
      values.vercel_deployment_id = data.vercel_deployment_id;
    }
    if (data.vercel_deployment_url !== undefined) {
      updates.push('vercel_deployment_url = ${vercel_deployment_url}');
      values.vercel_deployment_url = data.vercel_deployment_url;
    }
    if (data.functions !== undefined) {
      updates.push('functions = ${functions}');
      values.functions = data.functions;
    }
    if (data.status !== undefined) {
      updates.push('status = ${status}');
      values.status = data.status;
    }
    if (data.error_message !== undefined) {
      updates.push('error_message = ${error_message}');
      values.error_message = data.error_message;
    }

    if (updates.length === 0) {
      return this.getWorker(id);
    }

    // Since neon doesn't support dynamic queries easily, we'll use specific update patterns
    if (data.status === 'ready' && data.vercel_deployment_url && data.functions) {
      const result = await sql`
        UPDATE workers
        SET vercel_deployment_url = ${data.vercel_deployment_url},
            functions = ${data.functions},
            status = ${data.status},
            updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;
      return (result[0] as Worker) || null;
    }

    if (data.status === 'error' && data.error_message) {
      const result = await sql`
        UPDATE workers
        SET status = ${data.status},
            error_message = ${data.error_message},
            updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;
      return (result[0] as Worker) || null;
    }

    if (data.vercel_project_id) {
      const result = await sql`
        UPDATE workers
        SET vercel_project_id = ${data.vercel_project_id},
            updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;
      return (result[0] as Worker) || null;
    }

    if (data.vercel_deployment_id) {
      const result = await sql`
        UPDATE workers
        SET vercel_deployment_id = ${data.vercel_deployment_id},
            updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;
      return (result[0] as Worker) || null;
    }

    return this.getWorker(id);
  },

  async getWorker(id: string): Promise<Worker | null> {
    const sql = getDb();
    const result = await sql`
      SELECT * FROM workers WHERE id = ${id}
    `;
    return (result[0] as Worker) || null;
  },

  async getWorkersByTenant(tenantId: string): Promise<Worker[]> {
    const sql = getDb();
    const result = await sql`
      SELECT * FROM workers WHERE tenant_id = ${tenantId}
      ORDER BY created_at DESC
    `;
    return result as Worker[];
  },

  async deleteWorker(id: string): Promise<boolean> {
    const sql = getDb();
    const result = await sql`
      DELETE FROM workers WHERE id = ${id}
    `;
    return (result as { rowCount?: number }).rowCount !== undefined &&
           (result as { rowCount?: number }).rowCount! > 0;
  },

  async getAllWorkers(): Promise<Worker[]> {
    const sql = getDb();
    const result = await sql`
      SELECT * FROM workers
      ORDER BY created_at DESC
    `;
    return result as Worker[];
  },

  // Initialize database schema
  async initSchema(): Promise<void> {
    const sql = getDb();

    // Create tenants table
    await sql`
      CREATE TABLE IF NOT EXISTS tenants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;

    // Create workers table
    await sql`
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
      )
    `;

    // Create indexes
    await sql`CREATE INDEX IF NOT EXISTS idx_workers_tenant_id ON workers(tenant_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_workers_status ON workers(status)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_workers_vercel_project_id ON workers(vercel_project_id)`;
  }
};
