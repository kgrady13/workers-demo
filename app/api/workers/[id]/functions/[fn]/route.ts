import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';

// POST /api/workers/:id/functions/:fn - Invoke a worker function
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

    if (worker.status !== 'ready') {
      return NextResponse.json(
        { error: `Worker is not ready. Current status: ${worker.status}` },
        { status: 400 }
      );
    }

    if (!worker.vercel_deployment_url) {
      return NextResponse.json(
        { error: 'Worker deployment URL not available' },
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

    // Invoke the worker function
    const workerUrl = `${worker.vercel_deployment_url}/api/invoke/${fn}`;

    console.log(`Invoking function ${fn} at ${workerUrl}`);

    const response = await fetch(workerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    return NextResponse.json(result, { status: response.status });
  } catch (error) {
    console.error('Error invoking function:', error);
    return NextResponse.json(
      { error: 'Failed to invoke function' },
      { status: 500 }
    );
  }
}
