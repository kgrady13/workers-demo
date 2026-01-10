import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";

const VERCEL_API_BASE = "https://api.vercel.com";

/**
 * GET /api/workers/:id/logs/poll
 * Poll for runtime logs (returns JSON array)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const worker = await db.getWorker(id);
  if (!worker) {
    return NextResponse.json({ error: "Worker not found" }, { status: 404 });
  }

  if (worker.status !== "ready") {
    return NextResponse.json({ error: "Worker is not ready" }, { status: 400 });
  }

  const token = process.env.VERCEL_API_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;
  const projectId = process.env.VERCEL_WORKER_PROJECT_ID;

  if (!token || !teamId || !projectId) {
    return NextResponse.json(
      { error: "Missing Vercel configuration" },
      { status: 500 }
    );
  }

  try {
    // Fetch runtime logs from Vercel
    const url = new URL(
      `${VERCEL_API_BASE}/v1/projects/${projectId}/deployments/${worker.deployment_id}/runtime-logs`
    );
    url.searchParams.set("teamId", teamId);

    // Get logs from the last 60 seconds
    const since = Date.now() - 60000;
    url.searchParams.set("since", since.toString());

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const error = await response.text();
      console.error("Vercel logs API error:", response.status, error);
      return NextResponse.json({
        error: `Vercel API error: ${response.status}`,
        logs: [],
      });
    }

    // The runtime logs API returns newline-delimited JSON
    const text = await response.text();
    const logs: Array<{ timestamp: number; level: string; message: string }> =
      [];

    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        logs.push({
          timestamp: event.timestamp || Date.now(),
          level: event.level || "info",
          message: event.message || "",
        });
      } catch {
        // Skip non-JSON lines
      }
    }

    return NextResponse.json({ logs });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      // Timeout is expected for streaming endpoint with no data
      return NextResponse.json({ logs: [] });
    }
    console.error("Error fetching logs:", err);
    return NextResponse.json({
      error: err instanceof Error ? err.message : "Unknown error",
      logs: [],
    });
  }
}
