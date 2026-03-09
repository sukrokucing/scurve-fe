# Friction Audit (Telemetry + Playwright)

Audit date: March 4, 2026  
Scope: runtime friction validation on Tasks, Settings Policy (RBAC mobile), and global menu search surfaces.

## 1) What Was Re-validated

1. Tasks progressive disclosure:
   - Primary strip stays focused (`Search + Status + Advanced`).
   - Secondary controls stay in Advanced panel.
2. RBAC mobile disclosure:
   - `Mobile basic mode` appears by default.
   - Full matrix requires explicit `Open full matrix`.
3. Search modal:
   - Mobile sheet opens full-screen and remains readable.
4. Telemetry display:
   - Intent-qualified labels remain visible (`Intent completion`, `Passive exits`).

## 2) Runtime Evidence

1. `npm run audit:ui` (March 4, 2026) now passes gate:
   - `P0: 0`, `P1: 0`, `P2: 0`, `P3: 0`
   - Score: `100`
2. Playwright MCP `browser_snapshot` checks confirm:
   - `/tasks` shows simplified toolbar and Advanced panel flow.
   - `/settings/policy` mobile opens in basic mode; matrix opens only on demand.
3. Local Time-to-Task storage snapshot (browser eval):
   - `total=12`, `completed=1`, `abandoned=11`
   - `intentSampleCount=1`, `passiveExitCount=11`
   - `intentCompletionRate=1.0`, `passiveExitRate=0.9167`
   - `p50=24896ms`, `p90=24896ms`

## 3) Fixes Completed in This Cycle

1. Tasks toolbar instrumentation for audit:
   - Added `data-testid="tasks-primary-toolbar"`
   - Added `data-testid="tasks-toolbar-summary-badges"`
2. RBAC instrumentation for audit:
   - Added `data-testid="rbac-controls-bar"`
   - Added `data-testid="rbac-matrix-scroll"`
3. UI audit rulebook upgrades:
   - Added `friction.control-density`
   - Added `friction.telemetry-signal-quality`
4. Runtime audit heuristics (`e2e/ui-audit.spec.ts`):
   - Detects Tasks toolbar over-density regressions.
   - Detects missing telemetry intent/passive labels.
   - Detects RBAC mobile regression if basic mode is not default.
   - Detects visible mobile matrix horizontal overflow regression.
5. Accessibility hardening discovered by new gate:
   - Fixed sidebar active-link contrast in dark/glass themes.
   - Increased Time-to-Task reset button tap target from `h-8` to `h-10`.

## 4) Current Status

1. Previous P1 issues are resolved in current build:
   - Tasks control-density issue: resolved.
   - RBAC mobile matrix default complexity: resolved.
2. Audit automation now includes friction-specific checks, not only generic a11y/layout checks.
3. Remaining telemetry caveat:
   - Historical local records can still show high passive-exit ratio.
   - This is now explicitly visible and separated from intent-qualified completion metrics.

## 5) Next Recommended Step

1. Add a backend dashboard aggregation for intent-qualified Time-to-Task by date range and role, so product decisions stop relying on local-browser history only.
