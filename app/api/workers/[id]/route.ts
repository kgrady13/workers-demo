import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';

// Helper to calculate days until expiration
function calculateExpiresInDays(expiresAt: Date | string | null): number | null {
  if (!expiresAt) return null;
  const expDate = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
  const now = new Date();
  const diff = expDate.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

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

    // Check if snapshot has expired and auto-update status
    const expiresInDays = calculateExpiresInDays(worker.snapshot_expires_at);
    if (worker.status === 'ready' && expiresInDays !== null && expiresInDays <= 0) {
      await db.updateWorkerExpired(id);
      worker.status = 'expired';
    }

    return NextResponse.json({
      id: worker.id,
      name: worker.name,
      snapshotId: worker.snapshot_id,
      functions: worker.functions,
      status: worker.status,
      errorMessage: worker.error_message,
      createdAt: worker.created_at,
      snapshotExpiresAt: worker.snapshot_expires_at,
      lastInvokedAt: worker.last_invoked_at,
      expiresInDays,
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
