import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';

// POST /api/tenants - Create a new tenant
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.name || typeof body.name !== 'string') {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }

    const tenant = await db.createTenant(body.name.trim());

    return NextResponse.json({
      id: tenant.id,
      name: tenant.name,
      createdAt: tenant.created_at,
      updatedAt: tenant.updated_at,
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating tenant:', error);
    return NextResponse.json(
      { error: 'Failed to create tenant' },
      { status: 500 }
    );
  }
}

// GET /api/tenants - List all tenants (for demo purposes)
export async function GET() {
  try {
    const tenants = await db.getAllTenants();
    return NextResponse.json(tenants.map(t => ({
      id: t.id,
      name: t.name,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    })));
  } catch (error) {
    console.error('Error listing tenants:', error);
    return NextResponse.json(
      { error: 'Failed to list tenants' },
      { status: 500 }
    );
  }
}
