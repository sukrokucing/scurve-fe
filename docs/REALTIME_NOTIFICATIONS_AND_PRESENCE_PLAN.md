# Realtime Notifications, Presence, and Data-Change Plan

Last updated: 2026-03-17

## Summary

Use **WebSocket** for realtime signals in this app because the goal is broader than a bell badge:

1. Notification indicator
2. Online indicator for team members
3. Remote data-change signals
4. Refresh/sync highlighting when another user changes project data

For this scope, WebSocket is a good fit.

Important constraints:

- **REST remains the source of truth**
- **WebSocket is the signal layer**
- **Visibility is permission-aware, not membership-only**

That means:

- initial data still loads via normal API queries
- reconnect recovery still uses normal API queries
- read/unread state still persists via normal API writes
- websocket events tell FE what changed and when to refetch or highlight

---

## Product Goal

The system must respect **project-scoped RBAC**:

- A `project owner` who effectively has `project.view` in multiple projects can receive notifications and realtime updates for all visible projects.
- A `backend developer` with `project.view` in one project only receives updates for that one project.
- A user who is only a member, but does **not** effectively have `project.view`, should not receive project-scoped realtime events or durable notifications for that project.
- FE should **not** guess project visibility. Backend must remain authoritative.

---

## Why WebSocket Fits This Codebase

This frontend already has patterns that benefit from realtime signals:

- manual refresh buttons in `Tasks` and `Projects`
- a Gantt sync indicator and retry flow
- online/offline state via Zustand network store
- TanStack Query for refetch and cache invalidation

Relevant code:

- [networkStore.ts](d:/Data/WinNMP/WWW/scurve-fe/src/store/networkStore.ts)
- [TasksPage.tsx](d:/Data/WinNMP/WWW/scurve-fe/src/pages/tasks/TasksPage.tsx)
- [ProjectsPage.tsx](d:/Data/WinNMP/WWW/scurve-fe/src/pages/projects/ProjectsPage.tsx)
- [GanttView.tsx](d:/Data/WinNMP/WWW/scurve-fe/src/components/gantt/GanttView.tsx)

This means FE can consume websocket events in a predictable way:

- update unread badge
- show who is online
- mark `hasRemoteChanges`
- highlight refresh controls
- invalidate affected TanStack Query keys when safe

---

## Core Design Principle

Do **not** mix all realtime concerns into one undifferentiated feed.

Split them into 3 families:

1. **Durable notifications**
2. **Ephemeral presence**
3. **Project data-change signals**

Each has different lifecycle and FE behavior.

---

## 1. Durable Notifications

Purpose:

- bell indicator
- notification list/dropdown
- unread counts
- project-aware actionable alerts

Examples:

- `task.created`
- `task.assigned`
- `task.status_changed`
- `task.progress_changed`
- `task.overdue`
- `task.completed`
- `member.added`
- `member.removed`
- `resource_rate.updated`
- `task_health_rules.updated`

Rules:

- persisted server-side
- unread/read is per-user
- paginated
- can be filtered by project and unread state

### Recommended backend model

Use 2 logical entities:

1. `notification_events`
2. `user_notifications`

This keeps:

- event generation auditable
- user read state isolated
- recipient resolution explicit

### Recommended REST endpoints

- `GET /notifications`
- `GET /notifications/unread-count`
- `POST /notifications/read`
- `POST /notifications/read-all`

Suggested filters for `GET /notifications`:

- `project_id`
- `unread_only`
- `event_type`
- `cursor` or `page/per_page`

### Notification payload

```json
{
  "id": "notif_123",
  "event_id": "evt_987",
  "project_id": "proj_1",
  "project_name": "Demo Team Visibility Project",
  "entity_type": "task",
  "entity_id": "task_1",
  "event_type": "task.created",
  "title": "New task added",
  "message": "Jimmy added \"API contract update\"",
  "actor_user_id": "user_1",
  "actor_name": "Jimmy",
  "created_at": "2026-03-17T08:00:00Z",
  "read_at": null,
  "route": "/tasks?project=proj_1&task=task_1",
  "severity": "info",
  "dedupe_key": "task.created:proj_1:task_1"
}
```

### Recommendation

Do not notify the actor for their own change by default.

Exceptions:

- system-generated alerts
- project-level escalations
- workflow-critical reassignment or approval changes

---

## 2. Presence

Purpose:

- show which team members are online
- show which members are active in a project
- optionally show which route or screen they are in

Examples:

- online dot in task/team avatar group
- “3 teammates online”
- “Jimmy is viewing Tasks”

Rules:

- **ephemeral**
- **not** durable notification data
- TTL-based
- updated by heartbeat

### Recommended backend behavior

Track presence by:

- `user_id`
- `project_id` or current scope
- `route`
- `last_seen_at`
- `status`

Suggested status:

- `online`
- `idle`
- `offline`

### Presence update model

Client sends:

```json
{ "type": "presence.set_context", "project_id": "proj_1", "route": "/tasks" }
```

and heartbeat:

```json
{ "type": "presence.heartbeat" }
```

Server emits:

```json
{
  "type": "presence.project_snapshot",
  "project_id": "proj_1",
  "users": [
    {
      "user_id": "user_1",
      "name": "Jimmy",
      "status": "online",
      "route": "/tasks",
      "last_seen_at": "2026-03-17T08:00:05Z"
    }
  ]
}
```

### Recommendation

Presence should be **project-scoped**, not global by default.

That matches this app better because:

- Tasks is project-bound
- Gantt is project-bound
- most collaboration signals only matter in current project context

---

## 3. Project Data-Change Signals

Purpose:

- tell FE another user changed project data
- trigger refresh highlighting
- optionally invalidate safe queries

Examples:

- another teammate creates a task
- task progress changed
- dependency changed
- work log changed
- project settings changed

Rules:

- lightweight
- not durable by default
- can be mapped to notifications when important

### Recommended event

```json
{
  "type": "project.data_changed",
  "event_id": "evt_456",
  "project_id": "proj_1",
  "entity_type": "task",
  "entity_id": "task_1",
  "change_type": "created",
  "actor_user_id": "user_2",
  "actor_name": "Demo Backend Developer",
  "occurred_at": "2026-03-17T08:01:10Z",
  "invalidate": ["tasks:list", "dashboard:project"],
  "notification_id": "notif_123"
}
```

### Recommendation

Do not force-refresh aggressively while the user is editing.

Instead:

- if user is in passive list/dashboard state:
  - invalidate/refetch quietly
- if user is editing:
  - set `hasRemoteChanges = true`
  - highlight refresh/sync button
  - show a lightweight message such as `New changes available`

This is especially important for:

- Tasks create/edit dialogs
- Gantt drag/progress editing
- Project Settings forms

---

## WebSocket Contract

## Connection

Suggested endpoint:

- `GET /ws`

Auth:

- bearer token or secure session

Recommendation:

- one socket per authenticated user
- backend resolves all allowed project scopes
- FE should **not** manually subscribe to arbitrary projects without server-side authorization

### Why

This keeps scope correct for:

- multi-project project owners
- single-project contributors
- future permission changes without FE logic drift

---

## Client -> Server Messages

Keep this small.

### Presence context

```json
{
  "type": "presence.set_context",
  "project_id": "proj_1",
  "route": "/tasks"
}
```

### Heartbeat

```json
{
  "type": "presence.heartbeat"
}
```

### Optional: mark notifications seen from socket

REST is still preferable for this, but if BE wants parity:

```json
{
  "type": "notifications.mark_seen",
  "ids": ["notif_123"]
}
```

---

## Server -> Client Events

### New notification

```json
{
  "type": "notification.created",
  "notification": {
    "id": "notif_123",
    "project_id": "proj_1",
    "project_name": "Demo Project",
    "entity_type": "task",
    "entity_id": "task_1",
    "event_type": "task.created",
    "title": "New task added",
    "message": "Jimmy added \"API contract update\"",
    "actor_user_id": "user_1",
    "actor_name": "Jimmy",
    "created_at": "2026-03-17T08:00:00Z",
    "read_at": null,
    "route": "/tasks?project=proj_1&task=task_1",
    "severity": "info"
  },
  "unread_count": 6
}
```

### Unread count changed

```json
{
  "type": "notification.count_changed",
  "unread_count": 7
}
```

### Presence snapshot

```json
{
  "type": "presence.project_snapshot",
  "project_id": "proj_1",
  "users": [
    {
      "user_id": "user_1",
      "name": "Jimmy",
      "status": "online",
      "route": "/tasks",
      "last_seen_at": "2026-03-17T08:00:05Z"
    }
  ]
}
```

### Project data changed

```json
{
  "type": "project.data_changed",
  "project_id": "proj_1",
  "entity_type": "task",
  "entity_id": "task_1",
  "change_type": "created",
  "actor_user_id": "user_1",
  "actor_name": "Jimmy",
  "occurred_at": "2026-03-17T08:00:00Z",
  "invalidate": ["tasks:list", "dashboard:project"]
}
```

---

## RBAC and Scope Rules

Backend should remain authoritative.

### Required rule

Realtime project visibility must match the same backend authority model used by:

- `GET /projects`
- `GET /users/me/projects`
- project settings mutations
- dashboard/project access checks

More specifically:

- project-scoped realtime and durable notifications require effective backend `project.view`
- membership alone is not sufficient
- FE should treat denied subscriptions or empty notification/project feeds as valid RBAC outcomes, not as transport errors

### FE expectation

If user loses membership or permission:

- websocket feed should stop including project events
- unread counts should recalculate accordingly
- presence snapshots should no longer include that project scope
- subscription denial for a project should be handled gracefully by FE

### Important warning

The current app already observed cases where:

- `GET /projects` includes a project
- `GET /users/me/projects` does not
- portfolio summary does not include it

That inconsistency must be resolved before or alongside realtime rollout.

---

## FE Implementation Plan

## Phase 1: Connection and shared store

Add a realtime client layer:

- `src/lib/realtime.ts`
- optional Zustand store: `src/store/realtimeStore.ts`

State to track:

- `connectionStatus`
- `unreadCount`
- `notifications`
- `projectPresenceById`
- `projectRemoteChangesById`
- `lastEventId`

### FE behavior

- connect after auth bootstrap
- reconnect with backoff
- recover via REST on reconnect
- send heartbeat on interval
- derive eligible project subscriptions from backend-visible scopes, not local member lists
- only subscribe to projects where effective `project.view` is present

### FE scope source

Use backend scope metadata as the source of truth when available:

- `GET /users/me/projects`

Recommended FE rule:

- subscribe only when project scope exists **and** effective permissions include `project.view`
- do not infer websocket eligibility from project membership alone

---

## Phase 2: Notification indicator

Add UI:

- bell button in app shell
- unread badge
- dropdown or sheet for recent notifications

Suggested behavior:

- optimistic badge update from websocket
- dropdown loads durable list via `GET /notifications`
- mark-read via REST
- clicking notification navigates via `route`

---

## Phase 3: Presence in Tasks

Tasks already has a team avatar group.

Good next step:

- add online dot/ring on each visible avatar
- add `X online` summary beside member count
- tooltip can show:
  - name
  - route
  - last active

This should bind to:

- current selected project
- project presence snapshot for that project

---

## Phase 4: Data-change signals

Add project-scoped remote-change state.

Suggested behavior in `Tasks`:

- if remote change arrives for selected project:
  - set `hasRemoteChanges = true`
  - highlight refresh button
  - optional toast: `New task added by Demo Backend Developer`

Suggested behavior in `Projects`:

- highlight refresh button when project summary changed

Suggested behavior in `Gantt`:

- if user is not actively editing:
  - safe refetch/invalidate
- if user is editing:
  - keep current optimistic interaction
  - show remote-change warning and let user refresh intentionally

---

## Phase 5: Query invalidation mapping

Map websocket event families to TanStack Query invalidation.

Examples:

- `task.created`
  - invalidate task list
  - invalidate dashboard
- `work_log.created`
  - invalidate dashboard hours/cost
  - invalidate task work logs
- `member.added`
  - invalidate project members
  - invalidate task assignee options
- `task_health_rules.updated`
  - invalidate task-health rules
  - invalidate tasks list if health labels depend on them

Recommendation:

- keep this mapping explicit in one file
- do not scatter websocket reaction logic across pages

---

## Backend Recommendations

## Minimum required

1. websocket endpoint
2. durable notification REST endpoints
3. project-scoped presence snapshots
4. data-change invalidation events
5. consistent project visibility rules

## Strongly recommended

1. `event_id` / cursor support
2. replay or catch-up API after reconnect
3. actor info on every event
4. dedupe key for noisy updates
5. actor self-notification suppression

## Optional but valuable

1. event batching
2. presence route detail (`/tasks`, `/projects`, `/settings`)
3. grouped notifications (`5 tasks changed`)
4. per-project unread counts

---

## Suggested OpenAPI / Contract Follow-Up

If BE wants to formalize this in OpenAPI plus websocket notes:

- REST endpoints go into OpenAPI normally
- websocket event schemas can be documented in a companion markdown or AsyncAPI document

Best split:

- OpenAPI:
  - `/notifications`
  - `/notifications/unread-count`
  - `/notifications/read`
  - `/notifications/read-all`
- AsyncAPI or markdown:
  - `notification.created`
  - `notification.count_changed`
  - `presence.project_snapshot`
  - `project.data_changed`

---

## Recommendation to Send BE

You can send this summary:

> We want realtime support not only for the notification bell, but also for:
> - project-scoped online presence
> - remote data-change signals
> - refresh/sync highlighting when another user changes project data
>
> Please implement a user-authenticated websocket feed where backend remains authoritative for project scope using the same project membership/permission rules as the rest of the API.
> Project-scoped websocket events and durable notifications should require effective `project.view`; raw membership alone should not qualify a user for project visibility.
>
> We need 3 event families:
> 1. durable notifications
> 2. ephemeral presence
> 3. project data-changed invalidation signals
>
> Keep REST as source of truth. WebSocket should signal updates, not replace CRUD reads.
>
> Please also add notification REST endpoints:
> - `GET /notifications`
> - `GET /notifications/unread-count`
> - `POST /notifications/read`
> - `POST /notifications/read-all`
>
> Each websocket event should include:
> - `project_id`
> - `event_id`
> - actor info
> - entity type/id
> - event/change type
> - occurred timestamp
> - unread count when relevant
>
> Please ensure project visibility is consistent across `/projects`, `/users/me/projects`, summaries, and realtime delivery.
