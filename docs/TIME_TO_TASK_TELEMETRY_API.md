# Time-to-Task Telemetry API Contract

Last updated: 2026-03-04

## Purpose

Ingest frontend friction telemetry emitted from the Tasks flow (`/tasks`) so UX changes can be measured objectively over time.

## Endpoint

- Method: `POST`
- Path: `/telemetry/events`
- Auth: `Bearer` token (same session token used by app API calls)
- Content type: `application/json`

## Request Body

```json
{
  "events": [
    {
      "event_id": "time-to-task-start-<session-id>",
      "event_name": "time_to_task.session_started",
      "occurred_at": "2026-03-04T05:38:12.232Z",
      "session_id": "c6f53fe6-1823-4f90-b03f-77e8e20de34d",
      "route": "/tasks",
      "user_id": "uuid",
      "project_id": "uuid",
      "view": "list",
      "outcome": "completed",
      "reason": "leave-tasks-page",
      "duration_ms": 9234,
      "intent_to_complete_ms": 4033,
      "metadata": {
        "source": "tasks-page"
      }
    }
  ]
}
```

Notes:

- `events` is required and may contain 1..20 items.
- Unknown keys should be ignored (forward-compatible ingestion).
- `event_id` should be treated as idempotency key.
- Optional fields may be omitted when not applicable.
- `metadata.intent_qualified` and `metadata.passive_exit` may be sent on finalized events.

## Event Names Emitted by FE

- `time_to_task.session_started`
- `time_to_task.intent_marked`
- `time_to_task.completed`
- `time_to_task.abandoned`

Event semantics note:

- `time_to_task.abandoned` includes both intent-qualified abandon and passive page exits.
- Use metadata flags to segment:
  - `metadata.intent_qualified=true` for intent-stage abandon.
  - `metadata.passive_exit=true` for no-intent exits.

## Recommended Validation

- Required per event: `event_id`, `event_name`, `occurred_at`.
- `event_name` enum should include at least the four values above.
- `occurred_at` should be parseable ISO-8601 UTC.
- Duration fields must be non-negative integers.

## Recommended Response

Success (`202 Accepted` preferred):

```json
{
  "accepted": 12
}
```

Validation error (`400`):

```json
{
  "message": "invalid telemetry payload"
}
```

## Frontend Env Flags

- `VITE_TELEMETRY_ENABLED` (`true|false`, default `false`)
- `VITE_TELEMETRY_ENDPOINT` (default `/api/telemetry/events`)
- `VITE_TELEMETRY_SAMPLE_RATE` (`0..1`, default `1`)
- `VITE_TELEMETRY_FLUSH_MS` (flush interval in ms, default `2000`)
