# S-Curve FE Capabilities

This document summarizes what the frontend currently supports, based on the source code in this repository.

## 1. Core Product Capabilities

### 1.1 Authentication
- Login, register, and fetch current user (`/auth/login`, `/auth/register`, `/auth/me`).
- Token, user, and permissions persisted to `localStorage`.
- Protected app routes require a valid token.
- Startup bootstrap hydrates auth + permission context before main app rendering.

### 1.2 Dashboard
- Workspace-level overview cards (projects, active tasks, completed tasks).
- Project progress bar chart.
- Recent projects panel with quick visual progress context.

### 1.3 Projects
- List projects.
- Create project.
- Edit project.
- Delete project.
- Virtualized + paginated table for project browsing.
- Deep link from project row to project dashboard page.

### 1.4 Project Dashboard (S-Curve)
- Per-project dashboard view.
- Planned vs actual progress trend chart.
- Variance calculation and status indication (on track / behind).

### 1.5 Tasks
- Project-scoped task management.
- Task creation with schedule modes:
  - `Today`
  - `Duration`
  - `Custom range`
- Task edit/delete flows.
- Search + status filtering.
- Multiple task views:
  - `List`
  - `Board (Kanban)`
  - `Gantt`

### 1.6 Kanban Board
- Drag-and-drop status transitions.
- Virtualized card rendering in columns.
- Double-click task card to open edit flow.

### 1.7 Gantt
- Split view: editable task table + timeline.
- View modes: day/week/month/quarter/year.
- Dependency visualization (arrows between tasks).
- Add/remove predecessors from task table.
- Cycle prevention when selecting predecessors.
- Drag/resize task bars in timeline.
- Granular editing controls (Edit/Move/Resize) and focus-mode auto-centering toggle.
- Batch update support for multi-task scheduling changes.
- Critical path highlighting support (backend endpoint integrated).

### 1.8 Admin / Settings / RBAC
- Users page with search and access-management entry points.
- Roles page:
  - Create role
  - Delete role
  - View role details
  - Assign/revoke role permissions
- User access page:
  - View assigned roles
  - Assign/revoke roles
  - View effective permissions
- Policy page:
  - Permission matrix (role x permission toggles)
  - Audit log dialog (filter + pagination)
- Access flow explorer:
  - Visual relationship browsing (Users -> Roles -> Permissions)

## 2. Platform & UX Capabilities

### 2.1 Network Resilience
- Axios interceptor-based auth header injection.
- Concurrency limiter for API requests to reduce 429 spikes.
- Centralized 429 handling with cooldown state.
- Offline detection and global offline banner.
- Retry/reload affordances when backend connectivity fails.

### 2.2 Data Management
- TanStack Query for caching/invalidation.
- Query retry policy tuned for auth/permission/rate-limit failures.
- Zustand stores for auth, network, and permissions.

### 2.3 Theming & Layout
- Theme toggle across `Glass`, `Dark`, and `Light` modes.
- Responsive shell:
  - Desktop sidebar
  - Mobile bottom navigation
- Settings sub-navigation layout.

### 2.4 Performance Engineering Patterns
- Virtualization in high-row views (projects, tasks list, kanban columns, gantt timeline).
- Lazy-loaded route pages.
- Vite manual chunk splitting for heavy dependency groups.

## 3. API Coverage Snapshot

The bundled OpenAPI spec includes broad backend coverage (auth, projects, tasks, progress, RBAC, users).

### 3.1 Actively Wired in Frontend
- Auth: login/register/me.
- Projects: CRUD + dashboard + critical path.
- Tasks: list/create/update/delete + batch update + dependencies.
- RBAC: roles, role-permissions, user-roles, effective permissions, audit logs, permissions list.
- Users: list.

### 3.2 Present in OpenAPI but Not Fully Wired in UI
- Auth:
  - Forgot password
  - Reset password
  - Backend logout endpoint
- Users:
  - Create user
  - Update user
  - Delete user
- RBAC direct user-permission grant/read endpoints.
- Task progress CRUD endpoints (frontend currently relies on task-level progress + progress query mode rather than direct progress-entry workflows).
- Project plan mutation endpoints (`update project plan`, `clear project plan`) are present in API client but not surfaced in UI.

## 4. Tooling & Delivery Capabilities

- Build: TypeScript + Vite.
- Linting: ESLint.
- UI stack: Tailwind + Radix + custom components.
- Test infra configured for Playwright (`playwright.config.ts`), expecting `./e2e` tests.
- Schema pipeline:
  - Generate TypeScript API types from OpenAPI.
  - Generate Zod schemas from OpenAPI.
  - CI workflow validates generated artifacts are up to date.

## 5. Current Environment Assumptions

From local env files, frontend expects:
- `VITE_API_URL=https://localhost:8800`
- `VITE_APP_NAME=S-Curve`
- `VITE_ALLOWED_HOSTS=localhost,fe,127.0.0.1`

## 6. Known Boundaries

- Frontend route protection is currently token-based (not full route-level permission gating per page/action).
- Some admin capabilities available in OpenAPI are not yet surfaced in UI.
- Playwright configuration exists, but test folder presence should be verified before running E2E.

---

If needed, this can be expanded into an endpoint-by-endpoint matrix (`operationId` -> `frontend status`) for release planning.
