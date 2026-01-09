import { NextRequest } from 'next/server';
import { db } from '@/lib/db/client';
import { getVercelClient } from '@/lib/vercel/client';

// GET /api/workers/:id/logs - Stream logs via SSE
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const worker = await db.getWorker(id);

    if (!worker) {
      return new Response(
        JSON.stringify({ error: 'Worker not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!worker.vercel_project_id || !worker.vercel_deployment_id) {
      return new Response(
        JSON.stringify({ error: 'Worker deployment not available' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const vercel = getVercelClient();

    // Create SSE stream
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        try {
          // Send initial connection event
          controller.enqueue(
            encoder.encode(`event: connected\ndata: ${JSON.stringify({ workerId: id })}\n\n`)
          );

          // Stream logs from Vercel
          for await (const log of vercel.streamRuntimeLogs(
            worker.vercel_project_id!,
            worker.vercel_deployment_id!
          )) {
            const event = `event: log\ndata: ${JSON.stringify(log)}\n\n`;
            controller.enqueue(encoder.encode(event));
          }

          controller.close();
        } catch (error) {
          const errorEvent = `event: error\ndata: ${JSON.stringify({
            error: error instanceof Error ? error.message : 'Unknown error'
          })}\n\n`;
          controller.enqueue(encoder.encode(errorEvent));
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
  } catch (error) {
    console.error('Error streaming logs:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to stream logs' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
