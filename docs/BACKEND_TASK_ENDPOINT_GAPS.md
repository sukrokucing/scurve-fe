# Backend Task Endpoint Gaps (Frontend Handoff)

Last verified: 2026-03-04 (live probe against `https://localhost:8800`, test user from `.env`).

## Newly Confirmed as Supported

1. `DELETE /projects/{project_id}/tasks/batch`
   - OpenAPI: present.
   - Runtime: works (`200`) with non-empty `ids`.
   - Note: returns `400` for empty `ids` (`ids must not be empty`) which is expected validation.

2. `GET /projects/{project_id}/assignees`
   - OpenAPI: present.
   - Runtime: works (`200`).

3. `GET /projects/{project_id}/tasks/{id}/activity`
   - OpenAPI: present.
   - Runtime: works (`200`).

## Newly Confirmed as Resolved

1. Task progress history endpoints no longer return `500`.
   - `GET /projects/{project_id}/tasks/{task_id}/progress` -> `200`
   - `GET /tasks/{task_id}/progress` -> `200`
2. End-to-end progress history CRUD works in live probe:
   - `POST /projects/{project_id}/tasks/{task_id}/progress` -> `201`
   - Follow-up list from both routes returned the inserted row.
   - `DELETE /projects/{project_id}/tasks/{task_id}/progress/{id}` -> `204`

## Newly Confirmed Query Support

1. `GET /projects/{project_id}/tasks` now supports server-side filtering/sorting/pagination.
   - Confirmed query params in OpenAPI:
     - `q`, `status`, `assignee_id`, `start_from`, `start_to`, `due_from`, `due_to`
     - `sort_by`, `sort_dir`, `page`, `per_page`
   - Live probe:
     - Request with all params returned `200`.
   - Frontend integration status:
     - List view now consumes backend query params (`q`, `status`, `assignee_id`, `start_from`, `start_to`, `due_from`, `due_to`, `page`, `per_page`, `sort_by`, `sort_dir`) for server-side filtering/pagination.

## Newly Confirmed Telemetry Support

1. `POST /telemetry/events`
   - Runtime: works (`202`) with authenticated batched payload (`{ "events": [...] }`).
   - Verification date: 2026-03-04.
   - Frontend note:
     - Current FE default endpoint (`/api/telemetry/events`) is valid in dev because Vite proxy rewrites `/api/*` to backend root.
     - Direct backend route remains `/telemetry/events`.

## Suggested Next Priorities

1. Optional: add explicit sort controls in task-list UI (currently defaulting to `updated_at desc`).
