import { neon } from '@neondatabase/serverless';
import { Worker } from './schema';

function getDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }
  return neon(databaseUrl);
}

export const db = {
  async createWorker(data: {
    name: string;
    deploymentId: string;
    deploymentUrl: string;
    sourceCode: string;
    functions: string[];
  }): Promise<Worker> {
    const sql = getDb();
    const result = await sql`
      INSERT INTO workers (name, deployment_id, deployment_url, source_code, functions, status)
      VALUES (${data.name}, ${data.deploymentId}, ${data.deploymentUrl}, ${data.sourceCode}, ${data.functions}, 'building')
      RETURNING *
    `;
    return result[0] as Worker;
  },

  async getWorker(id: string): Promise<Worker | null> {
    const sql = getDb();
    const result = await sql`
      SELECT * FROM workers WHERE id = ${id}
    `;
    return (result[0] as Worker) || null;
  },

  async getAllWorkers(): Promise<Worker[]> {
    const sql = getDb();
    const result = await sql`
      SELECT * FROM workers ORDER BY created_at DESC
    `;
    return result as Worker[];
  },

  async updateWorkerReady(id: string, deploymentUrl: string): Promise<Worker | null> {
    const sql = getDb();
    const result = await sql`
      UPDATE workers
      SET deployment_url = ${deploymentUrl}, status = 'ready'
      WHERE id = ${id}
      RETURNING *
    `;
    return (result[0] as Worker) || null;
  },

  async updateWorkerError(id: string, errorMessage: string): Promise<Worker | null> {
    const sql = getDb();
    const result = await sql`
      UPDATE workers
      SET status = 'error', error_message = ${errorMessage}
      WHERE id = ${id}
      RETURNING *
    `;
    return (result[0] as Worker) || null;
  },

  async deleteWorker(id: string): Promise<boolean> {
    const sql = getDb();
    const result = await sql`
      DELETE FROM workers WHERE id = ${id} RETURNING id
    `;
    return result.length > 0;
  },

  async initSchema(): Promise<void> {
    const sql = getDb();

    // Drop old tables from previous implementation
    await sql`DROP TABLE IF EXISTS workers CASCADE`;
    await sql`DROP TABLE IF EXISTS tenants CASCADE`;

    // Create simplified workers table
    await sql`
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
      )
    `;

    await sql`CREATE INDEX idx_workers_deployment_id ON workers(deployment_id)`;
  }
};
