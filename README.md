# Workers Platform

A white-label serverless function platform built on Vercel. Deploy TypeScript code bundles ("workers") that export async functions, then invoke those functions via immutable URLs.

## Architecture

### Single Project, Many Deployments

```
┌─────────────────────────────────────────────────────────────────┐
│                        Control Plane                            │
│                                                                 │
│  ┌──────────┐    ┌──────────────┐    ┌───────────────────┐     │
│  │    UI    │───▶│  API Routes  │───▶│  Vercel Deploy    │     │
│  │          │    │              │    │      API          │     │
│  └──────────┘    └──────────────┘    └───────────────────┘     │
│                         │                      │                │
│                         ▼                      ▼                │
│                  ┌────────────┐      ┌─────────────────┐       │
│                  │   Neon     │      │ worker-deploy-  │       │
│                  │  Postgres  │      │ ments project   │       │
│                  └────────────┘      └─────────────────┘       │
└─────────────────────────────────────────────────────────────────┘
                                                │
                    Each worker = one immutable deployment
                                                │
                                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Worker Deployments                           │
│              (Single project, many deployments)                 │
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ Deployment A    │  │ Deployment B    │  │ Deployment C    │ │
│  │ ─────────────── │  │ ─────────────── │  │ ─────────────── │ │
│  │ /api/invoke/    │  │ /api/invoke/    │  │ /api/invoke/    │ │
│  │   countdown     │  │   processData   │  │   sendEmail     │ │
│  │   fetchData     │  │   transform     │  │   notify        │ │
│  │                 │  │                 │  │                 │ │
│  │ Immutable URL   │  │ Immutable URL   │  │ Immutable URL   │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

Each worker is deployed as an **immutable deployment** to a single shared Vercel project:

- **No project sprawl** - All workers live in one Vercel project
- **Immutable URLs** - Each deployment gets a permanent URL that never changes
- **Instant deploys** - ~30 second cold deploys via Vercel's file-based API
- **Automatic retries** - Built on [Vercel Workflows](https://vercel.com/docs/workflow) for durability

## How It Works

### 1. Write Code

Export async functions from TypeScript:

```typescript
export async function processOrder(payload: any) {
  console.log(`Processing order ${payload.orderId}`);
  // Your logic here
  return { success: true, orderId: payload.orderId };
}

export async function sendNotification(payload: any) {
  // Send email, SMS, etc.
  return { sent: true };
}
```

### 2. Deploy

The platform wraps your code in a Next.js project and deploys it via Vercel's API.

### 3. Get Immutable URL

Receive a permanent deployment URL:

```
https://worker-deployments-abc123-team.vercel.app
```

### 4. Invoke Functions

Call your functions directly via HTTP:

```bash
curl -X POST https://your-deployment-url.vercel.app/api/invoke/processOrder \
  -H "Content-Type: application/json" \
  -d '{"orderId": "12345"}'
```

Response:

```json
{
  "success": true,
  "function": "processOrder",
  "result": { "success": true, "orderId": "12345" },
  "duration": 42,
  "durable": true,
  "logs": [
    {
      "timestamp": 1234567890,
      "level": "info",
      "message": "Processing order 12345"
    }
  ]
}
```

## Features

- **TypeScript Support** - Write functions in TypeScript with full type checking
- **Automatic Retries** - Functions use `"use step"` directive for automatic retry on failure
- **Log Capture** - Console output is captured and returned with the response
- **Immutable URLs** - Each deployment is permanent, great for versioning
- **No Cold Starts** - Vercel's infrastructure handles scaling

## Project Structure

```
workers-demo/
├── app/
│   ├── api/
│   │   ├── setup/route.ts           # Database initialization
│   │   └── workers/
│   │       ├── route.ts             # POST: deploy, GET: list
│   │       └── [id]/
│   │           ├── route.ts         # GET: status, DELETE: remove
│   │           └── functions/[fn]/
│   │               └── route.ts     # POST: invoke (optional proxy)
│   └── page.tsx                     # Demo UI
├── components/
│   ├── WorkerList.tsx               # List of deployed workers
│   ├── CodeEditor.tsx               # Code input
│   ├── FunctionInvoker.tsx          # Function execution UI
│   └── LogViewer.tsx                # Log display
├── lib/
│   ├── db/
│   │   ├── schema.ts                # Database schema
│   │   └── client.ts                # CRUD operations
│   ├── vercel/
│   │   ├── client.ts                # Vercel API client
│   │   └── types.ts                 # API types
│   └── worker-template/
│       └── generator.ts             # Code → Next.js project
```

## API Reference

### Deploy a Worker

```http
POST /api/workers
Content-Type: application/json

{
  "name": "my-worker",
  "code": "export async function hello(payload: any) { return { message: 'Hello!' }; }"
}
```

Response (202 Accepted):

```json
{
  "id": "uuid",
  "name": "my-worker",
  "deploymentId": "dpl_xxx",
  "deploymentUrl": "https://worker-deployments-xxx.vercel.app",
  "functions": ["hello"],
  "status": "building"
}
```

### List Workers

```http
GET /api/workers
```

### Get Worker Status

```http
GET /api/workers/:id
```

### Delete Worker

```http
DELETE /api/workers/:id
```

### Invoke Function (via proxy)

```http
POST /api/workers/:id/functions/:functionName
Content-Type: application/json

{ "your": "payload" }
```

### Invoke Function (direct - recommended)

```http
POST https://{deploymentUrl}/api/invoke/{functionName}
Content-Type: application/json

{ "your": "payload" }
```

## Environment Variables

```bash
# Vercel API (create at https://vercel.com/account/tokens)
VERCEL_API_TOKEN=your_token

# Team ID (from team settings)
VERCEL_TEAM_ID=team_xxx

# Project ID for worker deployments (create a dedicated project)
VERCEL_WORKER_PROJECT_ID=prj_xxx

# Neon Postgres connection string
DATABASE_URL=postgresql://...
```

## Setup

### 1. Clone and install

```bash
git clone <repo>
cd workers-demo
bun install
```

### 2. Create a Vercel project for worker deployments

Create a dedicated project that will host all worker deployments. This can be done via the Vercel dashboard or API.

**Important**: Disable SSO/Deployment Protection on this project so workers can be invoked without authentication.

### 3. Configure environment variables

```bash
cp .env.example .env.local
# Fill in VERCEL_API_TOKEN, VERCEL_TEAM_ID, VERCEL_WORKER_PROJECT_ID, DATABASE_URL
```

### 4. Initialize database

```bash
bun run dev
curl -X POST http://localhost:3000/api/setup
```

### 5. Deploy the control plane

```bash
vercel deploy --prod
```

## How Workers Are Generated

When you deploy code like:

```typescript
export async function myFunction(payload: any) {
  console.log("Processing...");
  return { done: true };
}
```

The platform generates a complete Next.js project with:

- `package.json` - Dependencies (Next.js 16, React 19, Workflow)
- `next.config.ts` - Workflow plugin for automatic retries
- `app/api/invoke/[fn]/route.ts` - Dynamic handler that:
  - Routes requests to your exported functions
  - Wraps functions with `"use step"` for durability
  - Captures console.log/warn/error output
  - Returns structured JSON responses with logs

## Production Usage

For production, store the immutable deployment URL and call it directly:

```bash
# Direct invocation (recommended)
curl -X POST https://worker-deployments-abc123.vercel.app/api/invoke/myFunction \
  -H "Content-Type: application/json" \
  -d '{"key": "value"}'
```

The control plane is optional after deployment - you only need the immutable URL.

## Database Schema

```sql
CREATE TABLE workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  deployment_id VARCHAR(255) NOT NULL,
  deployment_url VARCHAR(512) NOT NULL,
  functions TEXT[] DEFAULT '{}',
  status VARCHAR(50) DEFAULT 'building',
  error_message TEXT,
  source_code TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Limitations

- **~30 second deploy time** - Cold deploys take approximately 30 seconds
- **Function timeout** - Subject to Vercel's function timeout limits
- **Stateless** - Workers are stateless; use external storage for persistent data
- **TypeScript only** - Currently only supports TypeScript code
