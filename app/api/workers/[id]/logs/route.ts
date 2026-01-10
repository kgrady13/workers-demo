import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { getVercelClient } from "@/lib/vercel/client";

/**
 * GET /api/workers/:id/logs
 * Stream runtime logs via SSE
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const worker = await db.getWorker(id);
  if (!worker) {
    return new Response(JSON.stringify({ error: "Worker not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (worker.status !== "ready") {
    return new Response(JSON.stringify({ error: "Worker is not ready" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const vercelClient = getVercelClient();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Send initial connection message
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "connected",
              deploymentId: worker.deployment_id,
            })}\n\n`
          )
        );

        // Stream logs from Vercel
        for await (const log of vercelClient.streamLogs(worker.deployment_id)) {
          const data = JSON.stringify({
            type: "log",
            timestamp: log.timestamp,
            level: log.level,
            message: log.message,
            source: log.source,
          });
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "error",
              message: errorMessage,
            })}\n\n`
          )
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
