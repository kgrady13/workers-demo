# Workers Platform - Claude Context

## What This Project Is

A white-label serverless function platform built on Vercel Sandboxes. Users deploy TypeScript code bundles ("workers") that export async functions, then invoke those functions with real-time log streaming.

## Architecture

```
User Code → Sandbox Snapshot → Invoke from Snapshot
```

- **Control Plane**: This Next.js app (`workers-demo`)
- **Worker Execution**: Each worker = one Vercel Sandbox snapshot
- **Database**: Neon Postgres for tracking workers
- **Real-time Logs**: SSE streaming via Sandbox command logs

Key insight: We use Vercel Sandboxes (ephemeral microVMs) instead of deployments. Snapshots allow instant function startup without a build phase.

## Environment Variables

```
DATABASE_URL         - Neon Postgres connection string
VERCEL_OIDC_TOKEN   - Vercel OIDC token (auto-provided in Vercel deployments)
```

For local development, run `vercel env pull` to get the OIDC token.

## Key Files

| File | Purpose |
|------|---------|
| `lib/sandbox/client.ts` | Vercel Sandbox SDK wrapper - createWorkerSnapshot, invokeFunction |
| `lib/sandbox/worker-script.ts` | Converts user code → Node.js worker script |
| `lib/db/client.ts` | Database CRUD (uses snake_case: `snapshot_id`, not `snapshotId`) |
| `app/api/workers/route.ts` | POST: deploy worker, GET: list workers |
| `app/api/workers/[id]/route.ts` | GET: status, DELETE: remove |
| `app/api/workers/[id]/invoke/[fn]/route.ts` | SSE streaming invocation endpoint |
| `app/api/workers/[id]/functions/[fn]/route.ts` | Backwards-compatible batch invocation |

## What Works

1. **Deploying workers** - Code → Sandbox snapshot in seconds (no build phase!)
2. **Invoking functions** - Real-time log streaming via SSE
3. **Real-time logs** - Streamed from Sandbox command execution
4. **Snapshot expiration** - 7-day expiration tracking with warnings

## How It Works

### Deploy Flow
1. User submits TypeScript code with exported functions
2. `worker-script.ts` transforms code into a Node.js script
3. A Sandbox is created, script is written, snapshot is captured
4. Snapshot ID stored in database - status is 'ready' immediately

### Invoke Flow
1. Client requests `/api/workers/:id/invoke/:fn` with `Accept: text/event-stream`
2. Sandbox created from snapshot
3. Worker script executed with function name and payload
4. Logs stream in real-time via SSE events
5. Result returned as final SSE event

## Worker Script Details

When user submits code like:
```typescript
export async function myFunc(payload: any) {
  console.log("Hello");
  return { done: true };
}
```

We generate a Node.js script that:
- Transforms exports into local function declarations
- Creates a function registry
- Reads function name and payload from process.argv
- Executes the function and outputs result with markers
- All console output streams in real-time

Result format: `__RESULT__<json>__END_RESULT__`

## Database Schema

```sql
CREATE TABLE workers (
  id UUID PRIMARY KEY,
  name VARCHAR(255),
  snapshot_id VARCHAR(255) NOT NULL,
  functions TEXT[],
  status VARCHAR(50),            -- 'creating' | 'ready' | 'error' | 'expired'
  error_message TEXT,
  source_code TEXT,
  created_at TIMESTAMP,
  snapshot_expires_at TIMESTAMP, -- 7-day expiration
  last_invoked_at TIMESTAMP      -- Usage tracking
);
```

**Important:** The DB uses snake_case (`snapshot_id`), but the API responses use camelCase (`snapshotId`).

## API Contracts

### Deploy Worker
```
POST /api/workers
Request: { name, code }
Response: {
  id, name, snapshotId, functions,
  status: 'ready',  // Immediate - no build phase!
  expiresInDays: 7
}
```

### Get Worker
```
GET /api/workers/:id
Response: {
  id, name, snapshotId, functions,
  status: 'creating' | 'ready' | 'error' | 'expired',
  snapshotExpiresAt, lastInvokedAt, expiresInDays
}
```

### Invoke Function (SSE)
```
POST /api/workers/:id/invoke/:fn
Headers: Accept: text/event-stream
Response: SSE stream
  event: log → { stream, message, timestamp }
  event: result → { success, result, duration }
  event: error → { error }
```

### Invoke Function (Batch - backwards compatible)
```
POST /api/workers/:id/functions/:fn
Response: { success, result, duration, logs }
```

## UI State Management

- `isStreaming` state tracks when logs are being streamed
- Logs are appended individually in real-time (not batched)
- "Streaming" indicator with pulsing dot shown in LogViewer
- Expiration warnings shown in WorkerList when `expiresInDays <= 2`
- Expired workers show gray badge and cannot be invoked

## Verification Steps

1. **Reset database:**
   ```bash
   curl -X POST http://localhost:3000/api/setup
   ```

2. **Deploy a test worker:**
   - Enter code with console.log statements
   - Verify status shows 'ready' immediately (no 'building')

3. **Invoke function:**
   - Click Invoke
   - Verify logs stream in real-time (not batched)
   - Verify "Streaming" indicator appears
   - Verify result arrives after logs

4. **Test expiration display:**
   - Manually set `snapshot_expires_at` to tomorrow in DB
   - Verify warning appears in WorkerList

5. **Test expired worker:**
   - Manually set status to 'expired' in DB
   - Verify invoke returns 410 error
