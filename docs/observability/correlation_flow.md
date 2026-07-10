# Correlation Flow

One id follows a logical operation end-to-end:

```
httpOrderPort (client)
  newCorrelationId() per logical call          c-<ts>-<seq>
  → header x-correlation-id on EVERY attempt   (retries REUSE the same id)
      ▼
Fastify genReqId (server)
  req.id = incoming x-correlation-id (≤128 chars) | generated r-<ts>-<rand>
      ▼
onRequest: reply header x-correlation-id = req.id   (client can display/report it)
      ▼
logs: request_completed / request_error / sse_connected  { correlationId: req.id, tenantId, ... }
      ▼
errors: AppError.withContext(req.id, tenantId) → response body { requestId }
```

Properties:
- **Retry grouping** — all attempts of one gateway call share one id → grep shows
  the full retry story.
- **Client report** — the canonical error body carries `requestId`; a user
  screenshot is enough to find the exact server logs.
- **Tenant in logs, never in responses** — tenantId is logged for filtering but
  `toResponse()` omits it.
- SSE: the stream request itself carries an id (`sse_connected` log). Frames are
  snapshots — no per-frame correlation needed.

Verified: `observability.test.ts` — header present on every attempt, stable across
retries of one call; server wiring inspected (genReqId + hooks in `server/src/index.ts`).
