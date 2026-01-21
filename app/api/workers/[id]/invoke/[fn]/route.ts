import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { getSandboxClient, LogEntry } from '@/lib/sandbox/client';

// POST /api/workers/:id/invoke/:fn - Invoke a worker function
// Supports both SSE streaming (Accept: text/event-stream) and batch JSON response
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

    // Check if client wants SSE streaming
    const acceptHeader = request.headers.get('accept') || '';
    const wantsSSE = acceptHeader.includes('text/event-stream');

    if (wantsSSE) {
      return handleSSEInvocation(worker.snapshot_id, fn, payload);
    }

    // Otherwise, return batch JSON response
    return handleBatchInvocation(worker.snapshot_id, fn, payload);
  } catch (error) {
    console.error('Error invoking function:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to invoke function' },
      { status: 500 }
    );
  }
}

// Handle SSE streaming invocation
function handleSSEInvocation(
  snapshotId: string,
  functionName: string,
  payload: unknown
): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sandboxClient = getSandboxClient();

      try {
        const result = await sandboxClient.invokeFunction(
          snapshotId,
          functionName,
          payload,
          (log: LogEntry) => {
            // Send log event
            const event = formatSSEEvent('log', {
              stream: log.stream,
              message: log.data,
              timestamp: log.timestamp,
            });
            controller.enqueue(encoder.encode(event));
          }
        );

        // Check if result contains error
        if (result.result && typeof result.result === 'object' && '__error' in (result.result as object)) {
          const errorResult = result.result as { __error: boolean; message: string };
          const event = formatSSEEvent('error', {
            error: errorResult.message,
          });
          controller.enqueue(encoder.encode(event));
        } else {
          // Send result event
          const event = formatSSEEvent('result', {
            success: true,
            result: result.result,
            duration: result.duration,
          });
          controller.enqueue(encoder.encode(event));
        }
      } catch (error) {
        // Send error event
        const event = formatSSEEvent('error', {
          error: error instanceof Error ? error.message : 'Function execution failed',
        });
        controller.enqueue(encoder.encode(event));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

// Handle batch JSON invocation (backwards compatible)
async function handleBatchInvocation(
  snapshotId: string,
  functionName: string,
  payload: unknown
): Promise<NextResponse> {
  const sandboxClient = getSandboxClient();
  const logs: Array<{ level: string; message: string; timestamp: number }> = [];

  try {
    const result = await sandboxClient.invokeFunction(
      snapshotId,
      functionName,
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
        function: functionName,
        error: errorResult.message,
        logs,
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      function: functionName,
      result: result.result,
      duration: result.duration,
      logs,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      function: functionName,
      error: error instanceof Error ? error.message : 'Function execution failed',
      logs,
    }, { status: 500 });
  }
}

// Format SSE event
function formatSSEEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
