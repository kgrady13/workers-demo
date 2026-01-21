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
    snapshotId: string;
    sourceCode: string;
    functions: string[];
    snapshotExpiresAt: Date;
  }): Promise<Worker> {
    const sql = getDb();
    const result = await sql`
      INSERT INTO workers (name, snapshot_id, source_code, functions, status, snapshot_expires_at)
      VALUES (${data.name}, ${data.snapshotId}, ${data.sourceCode}, ${data.functions}, 'ready', ${data.snapshotExpiresAt.toISOString()})
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

  async updateWorkerExpired(id: string): Promise<Worker | null> {
    const sql = getDb();
    const result = await sql`
      UPDATE workers
      SET status = 'expired'
      WHERE id = ${id}
      RETURNING *
    `;
    return (result[0] as Worker) || null;
  },

  async updateLastInvoked(id: string): Promise<Worker | null> {
    const sql = getDb();
    const result = await sql`
      UPDATE workers
      SET last_invoked_at = NOW()
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

    // Create simplified workers table with sandbox fields
    await sql`
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
      )
    `;

    await sql`CREATE INDEX idx_workers_snapshot_id ON workers(snapshot_id)`;
  }
};
