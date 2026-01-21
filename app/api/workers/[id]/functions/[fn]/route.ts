import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { getSandboxClient, LogEntry } from '@/lib/sandbox/client';

// POST /api/workers/:id/functions/:fn - Invoke a worker function
// This endpoint is kept for backwards compatibility
// Internally uses the sandbox to invoke functions
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; fn: string }> }
) {
  const { id, fn } = await params;

  try {
    const worker = await db.getWorker(id);

    if (!worker) {
      return NextResponse.json(
        { error: 'Worker not found' },
        { status: 404 }
      );
    }

    // Check if worker has expired
    if (worker.status === 'expired') {
      return NextResponse.json(
        { error: 'Worker snapshot has expired. Please redeploy.' },
        { status: 410 }
      );
    }

    if (worker.status !== 'ready') {
      return NextResponse.json(
        { error: `Worker is not ready. Current status: ${worker.status}` },
        { status: 400 }
      );
    }

    if (!worker.functions.includes(fn)) {
      return NextResponse.json(
        { error: `Function '${fn}' not found. Available: ${worker.functions.join(', ')}` },
        { status: 404 }
      );
    }

    // Get request payload
    const payload = await request.json().catch(() => ({}));

    // Update last invoked timestamp
    db.updateLastInvoked(id).catch(console.error);

    // Invoke using sandbox
    const sandboxClient = getSandboxClient();
    const logs: Array<{ level: string; message: string; timestamp: number }> = [];

    const result = await sandboxClient.invokeFunction(
      worker.snapshot_id,
      fn,
      payload,
      (log: LogEntry) => {
        logs.push({
          level: log.stream === 'stderr' ? 'error' : 'info',
          message: log.data,
          timestamp: log.timestamp,
        });
      }
    );

    // Check if result contains error
    if (result.result && typeof result.result === 'object' && '__error' in (result.result as object)) {
      const errorResult = result.result as { __error: boolean; message: string };
      return NextResponse.json({
        success: false,
        function: fn,
        error: errorResult.message,
        logs,
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      function: fn,
      result: result.result,
      duration: result.duration,
      logs,
    });
  } catch (error) {
    console.error('Error invoking function:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to invoke function' },
      { status: 500 }
    );
  }
}
