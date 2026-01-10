# Workers Platform - Claude Context

## What This Project Is

A white-label serverless function platform built on Vercel. Users deploy TypeScript code bundles ("workers") that export async functions, then invoke those functions via immutable URLs.

## Architecture

```
Single Vercel Project (worker-deployments) → Many Immutable Deployments
```

- **Control Plane**: This Next.js app (`workers-demo`)
- **Worker Deployments**: Each worker = one immutable deployment in `worker-deployments` project
- **Database**: Neon Postgres for tracking workers

Key insight: We do NOT create a new Vercel project per worker. All workers are deployments within a single shared project (`VERCEL_WORKER_PROJECT_ID`).

## Environment Variables

```
VERCEL_API_TOKEN     - API token with deploy permissions
VERCEL_TEAM_ID       - team_qt72u6Ug7jZRH1AY3zX9AkUU
VERCEL_WORKER_PROJECT_ID - prj_8LsmlnMqeBA5VqM2eReieevZfR2H (worker-deployments project)
DATABASE_URL         - Neon Postgres connection string
```

## Key Files

| File | Purpose |
|------|---------|
| `lib/vercel/client.ts` | Vercel API client - createDeployment, getDeployment, streamLogs |
| `lib/worker-template/generator.ts` | Converts user code → Next.js project files |
| `lib/db/client.ts` | Database CRUD (uses snake_case: `deployment_id`, not `deploymentId`) |
| `app/api/workers/route.ts` | POST: deploy worker, GET: list workers |
| `app/api/workers/[id]/route.ts` | GET: status, DELETE: remove |
| `app/api/workers/[id]/logs/route.ts` | SSE streaming endpoint (has issues) |
| `app/api/workers/[id]/logs/poll/route.ts` | Polling endpoint (also has issues) |

## What Works

1. **Deploying workers** - Code → Vercel deployment in ~30 seconds
2. **Invoking functions** - Direct HTTP calls to immutable deployment URLs
3. **Batch logs** - 100% reliable, captured in worker response after function completes
4. **Automatic retries** - Uses `"use step"` directive for Vercel Workflows

## What Doesn't Work Well

### Real-time Log Streaming

The Vercel Runtime Logs API (`/v1/projects/{projectId}/deployments/{deploymentId}/runtime-logs`) is designed as a **streaming endpoint** that holds connections open. This causes problems:

1. **SSE from serverless** - The connection times out or drops
2. **Polling** - The endpoint doesn't return historical logs well; it waits for new logs

**Attempted solutions:**
- SSE endpoint (`/api/workers/[id]/logs`) - disconnects quickly
- Polling endpoint (`/api/workers/[id]/logs/poll`) - times out waiting for streaming response

**Why batch logs work:** The worker template captures `console.log/warn/error` and includes them in the HTTP response. This is synchronous and reliable.

## Worker Template Details

When user submits code like:
```typescript
export async function myFunc(payload: any) {
  console.log("Hello");
  return { done: true };
}
```

We generate a Next.js project with:
- `app/api/invoke/[fn]/route.ts` - Dynamic handler
- Functions wrapped with `"use step"` for durability
- Console methods intercepted to capture logs
- Logs returned in response JSON

**TypeScript fix:** Functions are cast to `any` before calling to avoid type errors:
```typescript
return await (myFunc as any)(payload);
```

## Database Schema

```sql
CREATE TABLE workers (
  id UUID PRIMARY KEY,
  name VARCHAR(255),
  deployment_id VARCHAR(255),    -- snake_case!
  deployment_url VARCHAR(512),   -- snake_case!
  functions TEXT[],
  status VARCHAR(50),            -- 'building' | 'ready' | 'error'
  error_message TEXT,
  source_code TEXT,
  created_at TIMESTAMP
);
```

**Important:** The DB uses snake_case (`deployment_id`), but the API responses use camelCase (`deploymentId`). The `lib/db/schema.ts` Worker type uses snake_case.

## Common Issues & Fixes

1. **"Project names cannot contain '---'"** - Use proper name in deployment API, not generated one
2. **TypeScript function argument errors** - Cast function to `any`: `(fn as any)(payload)`
3. **Log streaming not working** - Fall back to batch logs (in response)
4. **SSO/Deployment Protection** - Must be disabled on worker-deployments project

## UI State Management

- `isStreaming` state is lifted to page level
- When streaming ON: batch logs from FunctionInvoker are ignored
- When streaming OFF: batch logs are shown after function completes
- Deduplication uses `timestamp-message` key in Set

## Future Improvements

If real-time streaming is needed:
1. **Log Drains** - Vercel pushes logs to webhook (complex setup)
2. **WebSocket from control plane** - Proxy logs while function runs
3. **Accept batch-only** - Simpler, 100% reliable
