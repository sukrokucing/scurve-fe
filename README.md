# S-Curve FE

S-Curve FE is a React + TypeScript frontend for project planning and delivery tracking. It includes project CRUD, task planning (list/kanban/gantt), project S-curve dashboards, and RBAC administration (users, roles, policy, audit log).

## What This Project Covers

- Authentication: login/register, protected routes, token-based session bootstrap
- Dashboard: KPI cards and project progress overview
- Projects: create/read/update/delete with project dashboard drilldown
- Tasks: list, board (kanban), gantt, search/filter, task CRUD
- RBAC: users, roles, role-permission management, policy matrix, access flow explorer, audit log
- E2E automation: business-flow YAML -> generated Playwright scenario tests

## Tech Stack

- React 19 + TypeScript + Vite
- TanStack Query + Zustand
- Tailwind + Radix UI + custom UI components
- Playwright for E2E
- OpenAPI type generation + Zod schema generation

## Performance Approach

- Route-level code splitting: pages/layouts are lazy loaded in `src/routes/index.tsx`.
- Query caching defaults: `staleTime` + `gcTime` configured in `src/lib/queryClient.ts`.
- Virtualization for large UI surfaces:
  - task/project tables (`@tanstack/react-virtual`)
  - Gantt timeline/table
  - large combobox option sets
- Search input smoothing for heavy views:
  - debounced + deferred filtering in menu search, tasks, and RBAC policy matrix
  - debounced server-side user search in admin users page
- Mutation retry disabled globally to avoid accidental duplicate write operations on slow/flaky networks.

## Prerequisites

- Node.js 20.19+ (Node 22+ recommended)
- npm
- Running backend API (default expected at `https://localhost:8800`)

## Local Setup

1. Install dependencies:

```bash
npm ci
```

2. Configure environment (`.env` / `.env.development`):

```env
VITE_API_URL=https://localhost:8800
VITE_APP_NAME=S-Curve
VITE_ALLOWED_HOSTS=localhost,fe,127.0.0.1

# Optional for generated Playwright scenarios
PLAYWRIGHT_USERNAME=...
PLAYWRIGHT_PASSWORD=...
# Optional token-first auth for Playwright (preferred for CI stability)
PLAYWRIGHT_AUTH_TOKEN=...
# Optional fallback identity fields if /api/auth/me is unavailable
PLAYWRIGHT_USER_ID=...
PLAYWRIGHT_USER_NAME=...
PLAYWRIGHT_USER_EMAIL=...
# Fallback keys used by test generator/runtime
TEST_EMAIL=...
TEST_PASSWORD=...

# Optional telemetry sink for Time-to-Task events
VITE_TELEMETRY_ENABLED=false
VITE_TELEMETRY_ENDPOINT=/api/telemetry/events
VITE_TELEMETRY_SAMPLE_RATE=1
VITE_TELEMETRY_FLUSH_MS=2000

# Optional API pacing for strict backend rate limits
# (especially useful for local Playwright runs)
VITE_API_CONCURRENCY=2
VITE_API_MIN_INTERVAL_MS=0
```

3. Start dev server:

```bash
npm run dev
```

App default URL: `http://localhost:3001`

## Environment Notes

- In development, frontend API calls use `/api` and are proxied by Vite to `VITE_API_URL`.
- In production build/runtime, the app uses `VITE_API_URL` directly.
- `VITE_ALLOWED_HOSTS` controls allowed dev/preview hosts (plus `fe` always allowed).

## NPM Scripts

### Daily commands

- `npm run dev`: start local app (`3001`)
- `npm run check`: lint + typecheck + strict perf audit
- `npm run build`: production build
- `npm run seed:demo-personas`: seed example personas + projects + tasks + dashboard consistency report
- `npm run seed:dashboard-demo`: seed one fresh dashboard trial project with plan + task progress history
- `npm run test:e2e`: run all Playwright E2E tests
- `npm run test:e2e:menu`: run menu hierarchy + shell regressions on chromium
- `npm run test:e2e:persona`: run persona workflow ergonomics checks
- `npm run test:e2e:roles-live`: run a live-auth role details dialog smoke on chromium
- `npm run test:e2e:user-access-live`: run a live-auth user access assign/revoke smoke on chromium
- `npm run test:e2e:critical`: smoke + menu shell + runtime perf probes (chromium)
- `npm run qa:be-update:20260311`: run FE QA checklist for BE contract update (March 11, 2026)
- `npm run audit:ui && npm run audit:perf:strict`: full audit gate
- `npm run generate:schemas && npm run generate:theme`: regenerate API+Zod schemas + theme tokens

### Specialized commands

- `npm run dev`, `npm run preview`, `npm run build`, `npm run lint`, `npm run typecheck`
- `npm run seed:demo-personas`, `npm run seed:dashboard-demo`
- `npm run test:e2e`, `npm run test:e2e:menu`, `npm run test:e2e:persona`, `npm run test:e2e:roles-live`, `npm run test:e2e:user-access-live`, `npm run test:e2e:flows`, `npm run test:e2e:smoke`, `npm run test:e2e:perf`
- `npm run generate:e2e:scenario`, `npm run test:e2e:scenario`
- `npm run sync:openapi`, `npm run generate:types`, `npm run generate:types:remote`, `npm run generate:zod`, `npm run generate:schemas`, `npm run generate:schemas:remote`
- `npm run generate:theme`, `npm run check:theme`
- `npm run audit:ui`, `npm run audit:ui:mode -- --mode=visual|a11y|report`
- `npm run audit:perf`, `npm run audit:perf:strict`
- `npm run perf:baseline`, `npm run perf:compare`
- `npm run visual:baseline`, `npm run visual:compare`
- `npm run upgrade:tailwind4:canary`, `npm run upgrade:gate`
- `npm run qa:be-update:20260311`

### OpenAPI + Zod Generation Flow

1. Pull latest backend spec to local snapshots:

```bash
npm run sync:openapi
```

2. Regenerate TypeScript types + Zod schemas from the same `src/openapi.json` source:

```bash
npm run generate:schemas
```

Notes:

- `generate:types` is now local/deterministic (`src/openapi.json`) so CI and local output stay aligned.
- Use `generate:types:remote` only when you need direct URL-based type generation.
- One-shot backend refresh + regen: `npm run generate:schemas:remote`.

## Authenticated E2E Suites

Some higher-signal suites depend on an authenticated browser session:

- `npm run test:e2e:menu`
- `npm run test:e2e:critical`
- `npm run test:e2e:project-settings`
- `npm run test:e2e:projects-mobile`
- `npm run test:e2e:roles-live`
- `npm run test:e2e:user-access-live`
- `npm run test:e2e:tasks-health`

Recommended env setup:

```env
PLAYWRIGHT_AUTH_TOKEN=...
```

Fallback auth setup:

```env
PLAYWRIGHT_USERNAME=...
PLAYWRIGHT_PASSWORD=...
PLAYWRIGHT_USER_ID=...
PLAYWRIGHT_USER_NAME=...
PLAYWRIGHT_USER_EMAIL=...
```

Notes:

- `PLAYWRIGHT_AUTH_TOKEN` is the preferred CI path because it avoids extra login churn.
- `TEST_EMAIL` and `TEST_PASSWORD` are still fallback keys for generated scenarios and helper scripts, not the primary auth path for the runtime app.
- GitHub Actions only runs the authenticated critical suite when the needed secrets are present.
- `test:e2e:menu` and `test:e2e:critical` run with `--workers=1` intentionally because these routes share auth-heavy state and are more stable serially.

### Backend Contract Notes (March 11, 2026)

- Progress endpoints reject unknown fields by contract (`serde(deny_unknown_fields)`), so legacy payload fields are expected to fail with `422 Unprocessable Entity`:
  - `POST /projects/{project_id}/tasks/{task_id}/progress` with `actual_hours`
  - `PUT /projects/{project_id}/tasks/{task_id}/progress/{id}` with `actual_cost`
- FE/BE checklist runner:

```bash
npm run qa:be-update:20260311
```

- Output artifacts:
  - `artifacts/qa/fe-qa-checklist-2026-03-11.json`
  - `artifacts/qa/fe-qa-checklist-2026-03-11.md`

## Demo Persona Workflow

For an end-to-end example that matches role/persona workflows and validates low-friction task operations:

1. Seed example users, roles, projects, and tasks:

```bash
npm run seed:demo-personas
```

2. Run persona quick-create + mode-switching checks:

```bash
npm run test:e2e:persona
```

See [docs/DEMO_PERSONA_WORKFLOW.md](./docs/DEMO_PERSONA_WORKFLOW.md) for details.

## Zero-Breakage Upgrade Workflow

For toolchain and styling upgrades, use the two-track process:

1. Capture baseline:

```bash
npm run perf:baseline
npm run visual:baseline
```

2. Verify current branch does not regress:

```bash
npm run perf:compare
npm run visual:compare
```

3. Run full local gate:

```bash
npm run upgrade:gate
```

4. Tailwind v4 canary (isolated temp workspace, non-default):

```bash
npm run upgrade:tailwind4:canary
```

Notes:

- `upgrade:tailwind4:canary` does not mutate your main working tree.
- If canary fails, keep Tailwind v3 and ship Vite/performance upgrades first.
- `audit:ui` now starts a managed local dev server automatically; set `UI_AUDIT_MANAGED_SERVER=0` to use an already-running app server.

## Key Routes

- `/login`, `/register`
- `/` (dashboard)
- `/projects`, `/projects/:id/dashboard`
- `/projects/:id/settings`
- `/tasks`
- `/settings/users`, `/settings/users/:userId`
- `/settings/roles`
- `/settings/policy`
- `/settings/flow`

## Global Menu Search (Desktop + Mobile)

Menu navigation is centralized in `src/navigation/menuCatalog.ts` and powers:

- Desktop sidebar links
- Mobile bottom nav links
- Settings sub-navigation
- Global menu search results

### Behavior

- Desktop global command palette opens with `Ctrl+K` / `Cmd+K` or sidebar `Search menu` trigger.
- Mobile: bottom nav includes a `Search` trigger that opens a full-screen sheet.
- Press `Enter` in search input to navigate to the first ranked result.
- Result click/tap uses the same navigation flow.

### Adding New Menu Entries

1. Add a `MenuEntry` in `src/navigation/menuCatalog.ts` with:
- `label`, `to`, `section`, `keywords`, `priority`, `surfaces`, `icon`
2. Include `search` in `surfaces` if the entry should be searchable.
3. Add relevant `keywords` for better matching.

### Ranking Rules

Implemented in `src/navigation/menuSearch.ts`:

- exact label match
- label starts-with
- label word-start match
- label contains
- keyword contains
- tie-break: lower `priority`, then alphabetical `label`

## Gantt Feature Matrix

The custom Gantt implementation in `src/components/gantt` currently supports:

- View modes: `day`, `week`, `month`, `quarter`, `year`
- Split layout: editable table + virtualized timeline
- Dependency model: finish-to-start with `source_task_id` (dependent) and `target_task_id` (predecessor)
- Dependency UX:
  - Add/remove predecessors from table
  - Cycle prevention in predecessor picker
  - Arrow rendering from predecessor end to dependent start
- Edit controls:
  - `Edit` master toggle
  - `Move` toggle (task drag)
  - `Resize` toggle (left/right handles)
  - `Focus` toggle (auto-center today on mode switch)
- Predecessor cell resilience:
  - Stable row height (`50px`)
  - Horizontal overflow scroll for many chips
  - Truncated labels with native tooltip via `title`

## Out of Scope (Phase 1)

Not included in the current modernization phase:

- `hour` / `minute` timeline modes
- Gantt export (PNG/JPEG/PDF) features
- Dependency type picker UI (`FS/SS/FF/SF`)
- Auto-scheduling engine (dependency-driven date propagation/conflict resolution)

## Business Flow -> Generated Playwright Scenarios

This repo supports executable business flows as the main E2E source.

### Source Files

- `business_flow.yaml`: executable flow definition
- `scripts/generate-scenario-tests.mjs`: YAML -> Playwright generator
- `e2e/generated/business-flow.generated.spec.ts`: generated spec (do not hand-edit)

### Run Flow

1. Generate:

```bash
npm run generate:e2e:scenario
```

2. Execute:

```bash
npm run test:e2e:scenario
```

### Credentials Resolution (Generated Scenarios)

- Username: `PLAYWRIGHT_USERNAME` -> `TEST_EMAIL`
- Password: `PLAYWRIGHT_PASSWORD` -> `TEST_PASSWORD`
- Token-first mode (optional): `PLAYWRIGHT_AUTH_TOKEN`
  - If token is set, generated specs and critical suites try `/api/auth/me` + permissions lookup first.
  - `PLAYWRIGHT_USER_*` is only fallback metadata, no longer mandatory.
- Browser scope for generated flow:
  - `PLAYWRIGHT_SCENARIO_BROWSERS` (comma-separated), default: `chromium`
  - Example: `PLAYWRIGHT_SCENARIO_BROWSERS=chromium,firefox`
- Browser scope for auth-heavy suites (`console-smoke`, `persona-workflows`):
  - `PLAYWRIGHT_AUTH_E2E_BROWSERS` (comma-separated), default: `chromium`
  - Example: `PLAYWRIGHT_AUTH_E2E_BROWSERS=chromium,firefox`
- Playwright-managed dev server applies safer defaults for strict backends:
  - `VITE_API_CONCURRENCY=1`
  - `VITE_API_MIN_INTERVAL_MS=250`
  - Override either value from your shell if your backend can handle higher throughput.

### YAML Variable Syntax (Supported)

Top-level reusable variables:

```yaml
variables:
  RUN_SUFFIX: "${RUN_ID}"
  PROJECT_NAME: "Flow Project CRUD ${RUN_SUFFIX}"
```

Supported interpolation targets:

- `value_template` in `fill` steps
- `value` in `fill`, `select_option`, `expect_text`
- `url`, `url_regex`
- locator fields (`name`, `text`, `selector`, `testid`, etc.)

Supported `fill` value source priority:

- `value_template`
- `value_from_variable`
- `value_from_credential`
- `value_from_env`
- `value`

Built-in runtime variables:

- `RUN_ID`, `RUN_DATE`, `RUN_TIME`, `RUN_TS`
- `PW_PROJECT`, `PW_WORKER`, `PW_RETRY`

Rules:

- Variables can reference other variables.
- Circular references are invalid.
- Unknown variables are resolved at runtime if available.

## Theme Harmony Pipeline

Theme tokens are generated at build-time from a seed config using deterministic harmony mapping.

### Files

- `scripts/theme/harmony.config.json`: seed values and per-theme tuning
- `scripts/generate-theme-tokens.mjs`: generates semantic tokens for `:root`, `.dark`, `.theme-glass`
- `scripts/check-theme-tokens.mjs`: validates required tokens + contrast checks
- `src/index.css`: generated section between:
  - `/* THEME TOKENS: START (generated) */`
  - `/* THEME TOKENS: END (generated) */`

### Usage

```bash
npm run generate:theme
npm run check:theme
```

### Seed Config Notes

- Keep `primary` hue aligned to brand direction.
- Neutrals are defined per theme via `background`, `surface`, `muted`, `border`, and `foreground`.
- Derived harmony mapping:
  - `accent`: analogous (`+30deg`)
  - `success`: analogous (`-30deg`)
  - `info`: triad (`+120deg`)
  - `warning`: split-complement (`+150deg`)
  - `destructive` / `error`: complement (`+180deg`)
  - `chart-1..5`: wheel steps (`72deg` increments)

### Contributor Rules

- Do not hand-edit tokens inside the generated marker block.
- Update `harmony.config.json`, then rerun `npm run generate:theme`.
- Run `npm run check:theme` before commit to ensure format + contrast thresholds remain valid.

## UI Audit Pipeline

This repository includes a Good-UI driven audit system for full-route UI quality checks and phased refactor tracking.

### Matrix

- Routes: `/`, `/projects`, `/tasks`, `/settings/users`, `/settings/roles`, `/settings/policy`, `/settings/flow`, `/login`, `/register`
- Themes: `light`, `dark`, `glass`
- Viewports: `390x844`, `768x1024`, `1440x900`

### Commands

```bash
npm run audit:ui
npm run audit:ui:mode -- --mode=visual
npm run audit:ui:mode -- --mode=a11y
npm run audit:ui:mode -- --mode=report
```

### Outputs

- `artifacts/ui-audit/findings.static.json`
- `artifacts/ui-audit/findings.runtime.json`
- `artifacts/ui-audit/findings.json`
- `artifacts/ui-audit/scorecard.json`
- `artifacts/ui-audit/screenshots/*`

### Rulebook and Decisions

- Method: `docs/UI_AUDIT.md`
- Backlog: `docs/UI_REFACTOR_BACKLOG.md`
- Decisions: `docs/UI_REFACTOR_DECISIONS.md`

## Time to Task Telemetry

The Tasks page now includes built-in friction telemetry for the core flow:

- Session start: when user enters `/tasks`
- Intent: when user opens `New task`
- Completion: when task creation succeeds
- Abandon: when user leaves `/tasks` before create success

Implementation files:

- `src/lib/timeToTask.ts`
- `src/pages/tasks/TasksPage.tsx`

What is shown in UI (`/tasks` header):

- `Time to Task p50`
- `Last`
- `Intent completion %`
- `Intent samples`
- `Passive exits`

Notes:

- Metrics are stored locally in browser `localStorage` (per user/browser).
- Use `Reset Time to Task` in the Tasks header to clear local samples.
- Raw records key: `scurve.time_to_task.records.v1`.
- Outbound telemetry is optional and disabled by default.
- When `VITE_TELEMETRY_ENABLED=true`, events are batched and posted to `VITE_TELEMETRY_ENDPOINT` with payload shape `{ "events": [...] }`.
- Event transport uses `fetch` during runtime and `navigator.sendBeacon` on page hide/unload fallback.
- For local backend (`https://localhost:8800`), keep `VITE_TELEMETRY_ENDPOINT=/api/telemetry/events` in FE env (dev proxy rewrites to `/telemetry/events`).
- Completion KPI is intent-qualified (sessions that reached create intent); passive route exits are tracked separately.

## Project Structure (High-Level)

- `src/pages`: route pages (dashboard/projects/tasks/admin)
- `src/components`: reusable UI and feature components
- `src/api`: API client and query hooks
- `src/store`: Zustand stores (auth/network/permissions)
- `src/routes`: route configuration
- `e2e`: Playwright tests
- `scripts`: code/test generation scripts

## Related Documentation

- `CAPABILITIES.md`: source-code capability inventory
- `BUSINESS_FLOWS.md`: business flow catalog and testing priorities
- `BUSINESS_FLOW_GENERATION.md`: rationale and generation workflow
- `docs/TIME_TO_TASK_TELEMETRY_API.md`: backend contract for friction telemetry ingestion
- `docs/PERFORMANCE_AUDIT.md`: static performance audit rules and workflow
- `docs/RUNTIME_PERFORMANCE_PROBES.md`: runtime route probe workflow and budgets
- `docs/TAILWIND_V4_REFACTOR_PLAN.md`: file-level migration blockers, applied fixes, and hardening phases
- `CONTRIBUTING.md`: contribution and performance rules

## Troubleshooting

- Login failures in generated scenarios:
  - Verify `PLAYWRIGHT_AUTH_TOKEN` (preferred) or credential env keys are set and valid.
- Intermittent backend/rate-limit issues:
  - Ensure backend is healthy and reachable at `VITE_API_URL`.
  - Reuse token-first auth in CI to reduce repeated `/api/auth/login` pressure.
  - Retry flows if backend responds with temporary errors.
- Playwright browser binaries missing:

```bash
npx playwright install chromium firefox
```
