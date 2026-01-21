import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { getSandboxClient } from '@/lib/sandbox/client';
import { generateWorkerScript } from '@/lib/sandbox/worker-script';

// Helper to calculate days until expiration
function calculateExpiresInDays(expiresAt: Date | null): number | null {
  if (!expiresAt) return null;
  const now = new Date();
  const diff = expiresAt.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

// POST /api/workers - Deploy worker code using sandbox snapshot
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.name || typeof body.name !== 'string') {
      return NextResponse.json(
        { error: 'Worker name is required' },
        { status: 400 }
      );
    }

    if (!body.code || typeof body.code !== 'string') {
      return NextResponse.json(
        { error: 'Worker code is required' },
        { status: 400 }
      );
    }

    // Generate Node.js worker script from user code
    const { script, functions } = generateWorkerScript(body.code);

    // Create sandbox and snapshot (synchronous - no build phase!)
    const sandboxClient = getSandboxClient();
    const { snapshotId, expiresAt } = await sandboxClient.createWorkerSnapshot(
      script,
      functions
    );

    // Store worker with snapshot info - status is 'ready' immediately
    const worker = await db.createWorker({
      name: body.name,
      snapshotId,
      sourceCode: body.code,
      functions,
      snapshotExpiresAt: expiresAt,
    });

    return NextResponse.json({
      id: worker.id,
      name: worker.name,
      snapshotId: worker.snapshot_id,
      functions,
      status: 'ready', // Immediate - no build phase!
      expiresInDays: calculateExpiresInDays(expiresAt),
    }, { status: 201 });

  } catch (error) {
    console.error('Error deploying worker:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to deploy worker' },
      { status: 500 }
    );
  }
}

// GET /api/workers - List all workers
export async function GET() {
  try {
    const workers = await db.getAllWorkers();
    return NextResponse.json(workers.map(w => ({
      id: w.id,
      name: w.name,
      snapshotId: w.snapshot_id,
      functions: w.functions,
      status: w.status,
      errorMessage: w.error_message,
      createdAt: w.created_at,
      snapshotExpiresAt: w.snapshot_expires_at,
      lastInvokedAt: w.last_invoked_at,
      expiresInDays: calculateExpiresInDays(w.snapshot_expires_at ? new Date(w.snapshot_expires_at) : null),
    })));
  } catch (error) {
    console.error('Error listing workers:', error);
    return NextResponse.json(
      { error: 'Failed to list workers' },
      { status: 500 }
    );
  }
}
