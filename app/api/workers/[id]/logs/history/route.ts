import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { getVercelClient } from '@/lib/vercel/client';

// GET /api/workers/:id/logs/history - Get historic logs
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const searchParams = request.nextUrl.searchParams;

  try {
    const worker = await db.getWorker(id);

    if (!worker) {
      return NextResponse.json(
        { error: 'Worker not found' },
        { status: 404 }
      );
    }

    if (!worker.vercel_project_id || !worker.vercel_deployment_id) {
      return NextResponse.json(
        { error: 'Worker deployment not available' },
        { status: 400 }
      );
    }

    const vercel = getVercelClient();

    const logs = await vercel.getHistoricLogs(
      worker.vercel_project_id,
      worker.vercel_deployment_id,
      {
        since: searchParams.get('since') ? parseInt(searchParams.get('since')!) : undefined,
        until: searchParams.get('until') ? parseInt(searchParams.get('until')!) : undefined,
        limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 100,
      }
    );

    return NextResponse.json({
      workerId: id,
      logs,
      count: logs.length,
    });
  } catch (error) {
    console.error('Error getting historic logs:', error);
    return NextResponse.json(
      { error: 'Failed to get historic logs' },
      { status: 500 }
    );
  }
}
