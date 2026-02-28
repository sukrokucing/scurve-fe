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

## Prerequisites

- Node.js 20+ (Node 22+ recommended)
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
# Fallback keys used by test generator/runtime
TEST_EMAIL=...
TEST_PASSWORD=...
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

- `npm run dev`: start Vite dev server (`3001`)
- `npm run build`: type-check + production build
- `npm run preview`: preview production build
- `npm run lint`: run ESLint
- `npm run test:e2e`: run all Playwright tests under `e2e/`
- `npm run test:e2e:flows`: run business flow tests (`e2e/business-flows.spec.ts`)
- `npm run test:e2e:smoke`: run smoke tests (`e2e/console-smoke.spec.ts`)
- `npm run generate:e2e:scenario`: generate scenario spec from `business_flow.yaml`
- `npm run test:e2e:scenario`: run generated scenario spec
- `npm run generate:types`: generate API types from backend OpenAPI
- `npm run generate:types:local`: generate API types from local `src/openapi.json`
- `npm run generate:zod`: generate Zod schemas
- `npm run generate:schemas`: run types + zod generation
- `npm run generate:theme`: generate harmony-based theme tokens into `src/index.css`
- `npm run check:theme`: validate generated token integrity + contrast thresholds

## Key Routes

- `/login`, `/register`
- `/` (dashboard)
- `/projects`, `/projects/:id/dashboard`
- `/tasks`
- `/settings/users`, `/settings/users/:userId`
- `/settings/roles`
- `/settings/policy`
- `/settings/flow`

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
- `CONTRIBUTING.md`: contribution and performance rules

## Troubleshooting

- Login failures in generated scenarios:
  - Verify credential env keys are set and valid.
- Intermittent backend/rate-limit issues:
  - Ensure backend is healthy and reachable at `VITE_API_URL`.
  - Retry flows if backend responds with temporary errors.
- Playwright browser binaries missing:

```bash
npx playwright install chromium firefox
```
