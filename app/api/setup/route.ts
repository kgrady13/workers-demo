import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';

// POST /api/setup - Initialize database schema
export async function POST() {
  try {
    await db.initSchema();
    return NextResponse.json({
      success: true,
      message: 'Database schema initialized',
    });
  } catch (error) {
    console.error('Error initializing database:', error);
    return NextResponse.json(
      {
        error: 'Failed to initialize database',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// GET /api/setup - Check database status
export async function GET() {
  try {
    await db.getAllWorkers();
    return NextResponse.json({
      initialized: true,
      message: 'Database ready',
    });
  } catch {
    return NextResponse.json({
      initialized: false,
      message: 'Run POST /api/setup to initialize',
    });
  }
}
