# S-Curve Business Flows (Playwright-First)

This file is the business-flow source for generating Playwright E2E scripts.
It is derived from:
- [CAPABILITIES.md](/d:/Data/WinNMP/WWW/scurve-fe/CAPABILITIES.md)
- Live UI exploration using Playwright MCP `browser_snapshot`

## 1. Test Goal

Prioritize end-to-end business flows over generic smoke checks.
Each flow below maps:
- capability -> user intent
- stable route(s)
- stable role-based selectors
- expected outcomes

## 2. Preconditions

- User is authenticated (token in `localStorage`).
- Backend contains at least one project, one role, and one user for deep flows.
- Base URL: `http://localhost:3001`.

## 3. Priority Flow Catalog

| ID | Priority | Capability | Route Entry | Outcome |
|---|---|---|---|---|
| BF-01 | P0 | Dashboard overview | `/` | KPI cards and progress widgets visible |
| BF-02 | P0 | Projects management | `/projects` | Create/Edit dialogs accessible, dashboard drill-down works |
| BF-03 | P0 | Tasks planning workflow | `/tasks` | Create dialog supports duration modes, view switcher works |
| BF-04 | P0 | Access flow explorer -> user access | `/settings/flow` | User->Role->Permission chain visible, manage-access drill-down works |
| BF-05 | P0 | Roles management | `/settings/roles` | Create Role dialog, role detail/permission panel accessible |
| BF-06 | P0 | Access policy + auditability | `/settings/policy` | RBAC matrix visible, audit log dialog and pagination available |
| BF-07 | P1 | Users management | `/settings/users` | User table and manage-access links functional |
| BF-08 | P1 | Auth entry points | `/login`, `/register` | Login/register forms and navigation links available |

## 4. Flow Definitions

### BF-01 Dashboard Overview

- Entry: `/`
- Key selectors:
  - `getByRole("heading", { name: "Dashboard" })`
  - `getByText("Total Projects")`
  - `getByText("Project Progress")`
- Success:
  - Dashboard heading and summary widgets are rendered.

### BF-02 Projects Management

- Entry: `/projects`
- Steps:
  - Open `New project` dialog.
  - Open first `Edit` dialog (if any row exists).
  - Follow first `Dashboard` link (if any row exists).
- Key selectors:
  - `getByRole("button", { name: "New project" })`
  - `getByRole("dialog", { name: "Create project" })`
  - `getByRole("button", { name: "Edit" }).first()`
  - `getByRole("dialog", { name: "Edit project" })`
  - `getByRole("link", { name: "Dashboard" }).first()`
- Success:
  - Dialogs open/close correctly.
  - Project dashboard route is reachable.

### BF-03 Tasks Planning Workflow

- Entry: `/tasks`
- Steps:
  - Open `New task`.
  - Verify duration controls: `Today`, `Duration`, `Custom`.
  - Switch view tabs: `List`, `Board`, `Gantt`.
- Key selectors:
  - `getByRole("button", { name: "New task" })`
  - `getByRole("dialog", { name: "Create task" })`
  - `getByRole("radio", { name: "Today" })`
  - `getByRole("radio", { name: "Duration" })`
  - `getByRole("radio", { name: "Custom" })`
  - `getByRole("button", { name: "List" | "Board" | "Gantt" })`
- Success:
  - Planning UI renders.
  - View switcher state changes without navigation failure.

### BF-04 Access Flow Explorer -> User Access

- Entry: `/settings/flow`
- Steps:
  - Select first user in explorer.
  - Select role `super_admin` (if present).
  - Click `Manage Access`.
- Key selectors:
  - `locator('div[role="button"][aria-pressed]').first()`
  - `getByRole("button", { name: /super_admin/i })`
  - `getByRole("button", { name: "Manage Access" })`
  - `getByRole("heading", { name: "User Access Management" })`
- Success:
  - Role and permission panes populate.
  - Route transitions to `/settings/users/:id`.

### BF-05 Roles Management

- Entry: `/settings/roles`
- Steps:
  - Open `Create Role` dialog.
  - Open role detail dialog from `super_admin` (or first role name button).
- Key selectors:
  - `getByRole("button", { name: "Create Role" })`
  - `getByRole("dialog", { name: "Create New Role" })`
  - `getByRole("button", { name: "super_admin" })`
  - `getByRole("dialog", { name: "super_admin" })`
- Success:
  - Role creation and role-permission management entry points are accessible.

### BF-06 Access Policy + Auditability

- Entry: `/settings/policy`
- Steps:
  - Verify policy matrix visible.
  - Open `Audit Log` dialog.
  - Verify pagination controls (`Previous`, `Next`).
- Key selectors:
  - `getByRole("heading", { name: "Access Policy" })`
  - `getByRole("button", { name: "Audit Log" })`
  - `getByRole("dialog", { name: "System Audit Log" })`
  - `getByRole("button", { name: "Next" })`
- Success:
  - Policy matrix and audit trail are both reachable in one flow.

### BF-07 Users Management

- Entry: `/settings/users`
- Key selectors:
  - `getByRole("heading", { name: "User Management" })`
  - `getByRole("textbox", { name: "Search by name or email..." })`
  - `getByRole("link", { name: "Manage Access" }).first()`
- Success:
  - User list and drill-down links are available.

### BF-08 Auth Entry Points

- Entry: `/login`, `/register`
- Key selectors:
  - Login: `Email`, `Password`, `Sign in`
  - Register: `Name`, `Email`, `Password`, `Confirm password`, `Create account`
- Success:
  - Both auth forms render and cross-link correctly.

## 5. Generation Rules (for Playwright Script Authoring)

- Prefer role-based selectors (`getByRole`) over CSS selectors.
- Keep destructive operations optional (create/update/delete guarded by data checks).
- Split by business flow (`BF-xx`) and keep one flow per test for traceability.
- Add `test.step()` blocks matching flow steps for readable reports.
- Use URL regex assertions for route transitions:
  - `/projects/:id/dashboard`
  - `/settings/users/:id`

## 6. Suggested Execution Order

1. BF-08 (auth entry)
2. BF-01 (dashboard)
3. BF-02 + BF-03 (core PM workflows)
4. BF-04 + BF-05 + BF-06 + BF-07 (RBAC/settings workflows)

