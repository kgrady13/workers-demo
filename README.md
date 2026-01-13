# Workers Platform PoC

Deploy TypeScript functions → Get immutable URL → Invoke via HTTP.

## Core Concept: Immutable Deployments

```
┌────────────────────────────────────────────────────────────────┐
│              Vercel Project: "worker-deployments"              │
│                                                                │
│   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐      │
│   │ Deployment A │   │ Deployment B │   │ Deployment C │      │
│   │ User 1 code  │   │ User 2 code  │   │ User 1 v2    │      │
│   │              │   │              │   │              │      │
│   │ abc123.vercel│   │ def456.vercel│   │ ghi789.vercel│      │
│   └──────────────┘   └──────────────┘   └──────────────┘      │
│         │                  │                  │               │
│    Immutable          Immutable          Immutable            │
│    (forever)          (forever)          (forever)            │
└────────────────────────────────────────────────────────────────┘
```

**Key insight:** All workers are deployments within ONE Vercel project. Each deployment gets a unique, permanent URL.

## Why Immutable URLs Matter

| Event | What Happens |
|-------|--------------|
| User deploys v1 | Gets `abc123.vercel.app` |
| User deploys v2 | Gets `def456.vercel.app` (v1 still works!) |
| Another user deploys | Gets `ghi789.vercel.app` (isolated) |

- URLs never change or expire
- Old versions keep running
- Users can't affect each other

## How Deployment Works

```
User Code                         Vercel
    │                               │
    │  "export async function       │
    │   hello() { ... }"            │
    │                               │
    ▼                               │
┌─────────────────┐                 │
│ Generate Next.js│                 │
│ project files   │                 │
│ (in memory)     │                 │
└────────┬────────┘                 │
         │                          │
         │  POST /v13/deployments   │
         │  { files: [...] }        │
         ▼                          ▼
                            ┌───────────────┐
                            │ Vercel builds │
                            │ npm install   │
                            │ next build    │
                            └───────┬───────┘
                                    │
                                    ▼
                            Immutable URL returned
                            abc123.vercel.app
```

**No git. No local build.** Files are sent as JSON directly to Vercel's API.

## Invoking Functions

```bash
curl -X POST https://worker-deployments-abc123.vercel.app/api/invoke/hello \
  -d '{"name": "world"}'
```

```json
{
  "success": true,
  "function": "hello",
  "result": { "message": "Hello world" },
  "logs": [
    { "level": "info", "message": "Processing...", "timestamp": 1234567890 }
  ]
}
```

## Architecture Summary

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│  Control Plane  │       │   Vercel API    │       │    Workers      │
│  (this app)     │       │                 │       │  (deployments)  │
│                 │       │                 │       │                 │
│  - Deploy UI    │──────▶│  POST /deploy   │──────▶│  Immutable URLs │
│  - Worker list  │       │                 │       │  that run your  │
│  - Invoke proxy │       │                 │       │  functions      │
└─────────────────┘       └─────────────────┘       └─────────────────┘
        │                                                   ▲
        │                                                   │
        └──────────── OR invoke directly ───────────────────┘
```

The control plane is just for management. Once deployed, call the immutable URL directly.
