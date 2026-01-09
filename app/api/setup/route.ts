import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';

// POST /api/setup - Initialize database schema
export async function POST() {
  try {
    await db.initSchema();
    return NextResponse.json({
      success: true,
      message: 'Database schema initialized successfully',
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

// GET /api/setup - Check if database is initialized
export async function GET() {
  try {
    // Try to query tenants table to check if schema exists
    await db.getAllTenants();
    return NextResponse.json({
      initialized: true,
      message: 'Database is initialized',
    });
  } catch (error) {
    return NextResponse.json({
      initialized: false,
      message: 'Database not initialized. POST to /api/setup to initialize.',
    });
  }
}
