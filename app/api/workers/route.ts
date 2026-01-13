import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { db } from '@/lib/db/client';
import { getVercelClient } from '@/lib/vercel/client';
import { generateWorkerFiles } from '@/lib/worker-template/generator';

// POST /api/workers - Deploy worker code, return immutable URL
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

    // Generate Next.js project files from user code
    const { files, functions } = generateWorkerFiles(body.name, body.code);

    // Create deployment in the shared project
    const vercel = getVercelClient();
    const deployment = await vercel.createDeployment(files);

    // Store worker with deployment info
    const worker = await db.createWorker({
      name: body.name,
      deploymentId: deployment.id,
      deploymentUrl: `https://${deployment.url}`,
      sourceCode: body.code,
      functions,
    });

    // Wait for deployment in background (after response is sent)
    after(async () => {
      await waitForDeployment(worker.id, deployment.id);
    });

    return NextResponse.json({
      id: worker.id,
      name: worker.name,
      deploymentId: deployment.id,
      deploymentUrl: `https://${deployment.url}`,
      functions,
      status: 'building',
    }, { status: 202 });

  } catch (error) {
    console.error('Error deploying worker:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to deploy worker' },
      { status: 500 }
    );
  }
}

// Background task to wait for deployment
async function waitForDeployment(workerId: string, deploymentId: string) {
  const vercel = getVercelClient();

  try {
    const deployment = await vercel.waitForDeployment(deploymentId);
    await db.updateWorkerReady(workerId, `https://${deployment.url}`);
    console.log(`Worker ${workerId} ready at https://${deployment.url}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Deployment failed';
    await db.updateWorkerError(workerId, message);
    console.error(`Worker ${workerId} failed: ${message}`);
  }
}

// GET /api/workers - List all workers
export async function GET() {
  try {
    const workers = await db.getAllWorkers();
    return NextResponse.json(workers.map(w => ({
      id: w.id,
      name: w.name,
      deploymentId: w.deployment_id,
      deploymentUrl: w.deployment_url,
      functions: w.functions,
      status: w.status,
      errorMessage: w.error_message,
      createdAt: w.created_at,
    })));
  } catch (error) {
    console.error('Error listing workers:', error);
    return NextResponse.json(
      { error: 'Failed to list workers' },
      { status: 500 }
    );
  }
}
