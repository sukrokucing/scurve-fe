# Demo Persona Workflow

This document describes the example dataset and workflow checks for:

1. Role/persona setup (`project_owner`, `system_analyst`, `backend_developer`, `frontend_developer`, `fullstack_developer`, `data_analyst`)
2. Multi-project membership
3. Dummy task seeding (with descriptions)
4. Dashboard consistency checks
5. Low-learning-curve workflow validation (quick-create + mode switching)

## Seed Command

```bash
npm run seed:demo-personas
```

The seed is idempotent. It will reuse existing records by unique identity (role name, email, project name, task title).

Output report:

- `artifacts/demo-persona-seed.json`

## Persona Login Defaults

- Password source:
  - `DEMO_PERSONA_PASSWORD` (preferred)
  - fallback: `TEST_PASSWORD`
- Admin credential source for seeding:
  - `DEMO_ADMIN_EMAIL` / `DEMO_ADMIN_PASSWORD` (preferred)
  - fallback: `TEST_EMAIL` / `TEST_PASSWORD`

Optional:

- `DEMO_PERSONA_SUFFIX` to isolate a separate demo dataset variant.

## Workflow Validation Command

```bash
npm run test:e2e:persona
```

This Playwright suite validates each persona can:

1. Sign in
2. Open Tasks
3. Quick-create a task in one step
4. Switch list -> board -> gantt -> list
5. Open dashboard and see governance cards

## Why This Covers the Request

1. Users + roles: seeded and assigned globally + project membership.
2. Projects: multiple demo projects created.
3. Tasks: each persona receives role-representative dummy tasks with descriptions.
4. Dashboard consistency: seed script checks `/projects/{id}/dashboard`, `/projects/{id}/s-curve/health`, and `/portfolio/s-curve/summary`.
5. Low learning curve: Playwright verifies quick-create and mode-switching path remains direct and fast.
