import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';

// GET /api/workers - List all workers (for demo purposes)
export async function GET() {
  try {
    const workers = await db.getAllWorkers();
    return NextResponse.json(workers.map(w => ({
      id: w.id,
      name: w.name,
      tenantId: w.tenant_id,
      vercelProjectId: w.vercel_project_id,
      vercelDeploymentUrl: w.vercel_deployment_url,
      functions: w.functions,
      status: w.status,
      errorMessage: w.error_message,
      createdAt: w.created_at,
      updatedAt: w.updated_at,
    })));
  } catch (error) {
    console.error('Error listing workers:', error);
    return NextResponse.json(
      { error: 'Failed to list workers' },
      { status: 500 }
    );
  }
}
