import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';

// GET /api/workers/:id - Get worker info
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
      deploymentId: worker.deployment_id,
      deploymentUrl: worker.deployment_url,
      functions: worker.functions,
      status: worker.status,
      errorMessage: worker.error_message,
      createdAt: worker.created_at,
    });
  } catch (error) {
    console.error('Error getting worker:', error);
    return NextResponse.json(
      { error: 'Failed to get worker' },
      { status: 500 }
    );
  }
}

// DELETE /api/workers/:id - Delete worker from database
// Note: Deployment stays in Vercel (immutable), just removing our record
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const deleted = await db.deleteWorker(id);

    if (!deleted) {
      return NextResponse.json(
        { error: 'Worker not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting worker:', error);
    return NextResponse.json(
      { error: 'Failed to delete worker' },
      { status: 500 }
    );
  }
}
