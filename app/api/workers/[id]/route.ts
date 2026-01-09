import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { getVercelClient } from '@/lib/vercel/client';

// GET /api/workers/:id - Get worker status and details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const worker = await db.getWorker(id);

    if (!worker) {
      return NextResponse.json(
        { error: 'Worker not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: worker.id,
      name: worker.name,
      tenantId: worker.tenant_id,
      vercelProjectId: worker.vercel_project_id,
      vercelDeploymentUrl: worker.vercel_deployment_url,
      functions: worker.functions,
      status: worker.status,
      errorMessage: worker.error_message,
      createdAt: worker.created_at,
      updatedAt: worker.updated_at,
    });
  } catch (error) {
    console.error('Error getting worker:', error);
    return NextResponse.json(
      { error: 'Failed to get worker' },
      { status: 500 }
    );
  }
}

// DELETE /api/workers/:id - Delete worker and its Vercel project
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const worker = await db.getWorker(id);

    if (!worker) {
      return NextResponse.json(
        { error: 'Worker not found' },
        { status: 404 }
      );
    }

    // Delete Vercel project if it exists
    if (worker.vercel_project_id) {
      try {
        const vercel = getVercelClient();
        await vercel.deleteProject(worker.vercel_project_id);
        console.log(`Deleted Vercel project: ${worker.vercel_project_id}`);
      } catch (error) {
        console.error('Error deleting Vercel project:', error);
        // Continue with database deletion even if Vercel deletion fails
      }
    }

    // Delete from database
    await db.deleteWorker(id);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Error deleting worker:', error);
    return NextResponse.json(
      { error: 'Failed to delete worker' },
      { status: 500 }
    );
  }
}
