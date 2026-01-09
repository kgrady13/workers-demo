import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { getVercelClient } from '@/lib/vercel/client';
import { generateWorkerFiles } from '@/lib/worker-template/generator';
import { VercelFile } from '@/lib/vercel/types';

// POST /api/tenants/:id/workers - Deploy a new worker
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tenantId } = await params;

  try {
    const body = await request.json();

    // Validate request
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

    // Verify tenant exists
    const tenant = await db.getTenant(tenantId);
    if (!tenant) {
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404 }
      );
    }

    // Generate worker files
    let workerFiles: { files: VercelFile[]; functions: string[] };
    try {
      workerFiles = generateWorkerFiles(body.name, body.code);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Invalid worker code' },
        { status: 400 }
      );
    }

    // Create worker record in database
    const worker = await db.createWorker({
      tenantId,
      name: body.name,
      sourceCode: body.code,
    });

    // Generate unique project name
    const projectName = `worker-${worker.id.slice(0, 8)}-${body.name}`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 52); // Vercel project name limit

    // Deploy to Vercel (async - don't await full deployment)
    deployWorkerAsync(worker.id, projectName, workerFiles);

    return NextResponse.json({
      id: worker.id,
      name: worker.name,
      tenantId: worker.tenant_id,
      status: 'building',
      functions: workerFiles.functions,
      message: 'Deployment started',
    }, { status: 202 });

  } catch (error) {
    console.error('Error deploying worker:', error);
    return NextResponse.json(
      { error: 'Failed to deploy worker' },
      { status: 500 }
    );
  }
}

// Async deployment function - runs in background
async function deployWorkerAsync(
  workerId: string,
  projectName: string,
  workerFiles: { files: VercelFile[]; functions: string[] }
) {
  const vercel = getVercelClient();

  try {
    // Create Vercel project
    console.log(`Creating Vercel project: ${projectName}`);
    const project = await vercel.createProject(projectName);

    // Disable SSO protection on the project so functions can be invoked
    console.log(`Disabling SSO protection for project: ${project.id}`);
    await vercel.updateProject(project.id, {
      ssoProtection: null,
    });

    // Update worker with project ID
    await db.updateWorker(workerId, {
      vercel_project_id: project.id,
    });

    // Create deployment
    console.log(`Creating deployment for project: ${project.id}`);
    const deployment = await vercel.createDeployment(project.id, workerFiles.files);

    // Update worker with deployment info
    await db.updateWorker(workerId, {
      vercel_deployment_id: deployment.id,
    });

    // Wait for deployment to be ready
    console.log(`Waiting for deployment: ${deployment.id}`);
    const readyDeployment = await vercel.waitForDeployment(deployment.id);

    // Update worker as ready
    console.log(`Deployment ready: https://${readyDeployment.url}`);
    await db.updateWorker(workerId, {
      vercel_deployment_url: `https://${readyDeployment.url}`,
      functions: workerFiles.functions,
      status: 'ready',
    });

  } catch (error) {
    console.error('Deployment error:', error);

    // Update worker with error status
    await db.updateWorker(workerId, {
      status: 'error',
      error_message: error instanceof Error ? error.message : 'Deployment failed',
    });
  }
}

// GET /api/tenants/:id/workers - List workers for a tenant
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tenantId } = await params;

  try {
    const workers = await db.getWorkersByTenant(tenantId);
    return NextResponse.json(workers.map(w => ({
      id: w.id,
      name: w.name,
      tenantId: w.tenant_id,
      vercelProjectId: w.vercel_project_id,
      vercelDeploymentUrl: w.vercel_deployment_url,
      functions: w.functions,
      status: w.status,
      errorMessage: w.error_message,
      createdAt: w.created_at,
      updatedAt: w.updated_at,
    })));
  } catch (error) {
    console.error('Error listing workers:', error);
    return NextResponse.json(
      { error: 'Failed to list workers' },
      { status: 500 }
    );
  }
}
