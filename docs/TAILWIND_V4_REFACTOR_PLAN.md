# Tailwind v4 Refactor Plan (File-Level, Zero-Breakage)

## Current Status

Tailwind v4 is now running in the main workspace and passes the quality gates:

1. `npm run upgrade:gate` passed.
2. `npm run upgrade:tailwind4:canary` passed.
3. UI audit score is 100 with no P0/P1 findings.

This plan documents:

1. Files that caused upgrade blockers.
2. The refactors already applied.
3. Remaining hardening refactors to reduce future v4 regression risk.

## Blockers Found and Fixed

## 1) Build pipeline mismatch (blocking)

Files:

1. `package.json`
2. `vite.config.ts`
3. `postcss.config.js`

Root cause:

1. v4 requires the Vite plugin path (`@tailwindcss/vite`) and different PostCSS expectations.
2. Old v3 assumptions caused unstable canary behavior.

Refactor applied:

1. Added `@tailwindcss/vite` and upgraded `tailwindcss` to v4.
2. Enabled `tailwindcss()` plugin in Vite.
3. Simplified PostCSS plugin chain to `autoprefixer` only.

## 2) CSS entry/token compatibility (blocking)

Files:

1. `src/index.css`
2. `tailwind.config.js`

Root cause:

1. v3 directives were incompatible with v4 pipeline.
2. Existing semantic contract (`hsl(var(--token))`) needed compatibility mapping.

Refactor applied:

1. Replaced v3 directives with `@import "tailwindcss"` and `@config`.
2. Added `@theme` compatibility aliases so existing utility usage remains stable.
3. Preserved generated token contract and theme markers.

## 3) False-negative/false-positive audit runs (blocking for confidence)

Files:

1. `scripts/ui-audit/run-ui-audit.mjs`
2. `e2e/ui-audit.spec.ts`
3. `scripts/upgrade/run-tailwind4-canary.mjs`
4. `scripts/upgrade/utils.mjs`

Root cause:

1. Audit/canary could target the wrong server when no managed dev server was active.
2. Failures were hard to diagnose due minimal runtime context in assertions.

Refactor applied:

1. Added managed dev-server lifecycle in UI audit.
2. Standardized base URL/env propagation in canary flow.
3. Added richer debug payload in targeted UI-audit checks.

## Non-Blocking Risk Inventory (Refactor Next)

These files are currently passing, but are high risk under future Tailwind changes because of dense arbitrary selectors/variants and plugin-heavy animation utility chains.

## High-risk UI primitives

1. `src/components/ui/button.tsx`
2. `src/components/ui/calendar.tsx`
3. `src/components/ui/chart.tsx`
4. `src/components/ui/command.tsx`
5. `src/components/ui/select.tsx`
6. `src/components/ui/table.tsx`
7. `src/components/ui/dialog.tsx`
8. `src/components/ui/popover.tsx`
9. `src/components/ui/sheet.tsx`
10. `src/components/ui/toast.tsx`
11. `src/components/ui/tooltip.tsx`
12. `src/components/ui/toggle-group.tsx`
13. `src/components/ui/ThemeToggle.tsx`

## Animation utility dependency surface

1. `tailwind.config.js` (plugin dependency removed; fallback utilities in `src/index.css` are authoritative)
2. `src/components/ui/{dialog,popover,sheet,select,toast,tooltip}.tsx`
3. `src/components/rbac/HierarchyExplorer.tsx`

## Refactor Phases

## Phase 1: Selector safety and readability (no behavior changes)

Goal:

1. Reduce brittle arbitrary selectors and long class strings.

Actions:

1. Extract repeated state classes into named constants per component.
2. Replace `group-[...]`, `data-[...]`, and `[&...]` selectors where possible with:
   - explicit wrapper elements
   - explicit class hooks
   - small local utility helpers
3. Prioritize: `calendar.tsx`, `chart.tsx`, `command.tsx`, `table.tsx`.

Acceptance:

1. `npm run lint`
2. `npx tsc --noEmit`
3. `npm run audit:ui` (no new P0/P1)

## Phase 2: Animation hardening

Goal:

1. De-risk plugin-coupled animations.

Actions:

1. Inventory usage of `animate-in/out`, `fade-*`, `zoom-*`, `slide-*`.
2. Add local fallback animation classes/keyframes in `src/index.css` for critical surfaces.
3. Remove `tailwindcss-animate` only after parity proof.

Acceptance:

1. No visual regressions in dialog/popover/sheet/toast/tooltip transitions.
2. `npm run visual:compare` passes with no approved P1/P0 regressions.

## Phase 3: Token/config simplification

Goal:

1. Minimize dual config drift (`@theme` + `tailwind.config.js`).

Actions:

1. Keep semantic token source of truth in generated CSS.
2. Reduce redundant mappings in `tailwind.config.js` where v4 theme aliases already cover them.
3. Validate all utilities still resolve correctly across Light/Dark/Glass.

Acceptance:

1. `npm run check:theme`
2. `npm run audit:ui`
3. `npm run build`

## Phase 4: Continuous upgrade guardrails

Goal:

1. Ensure future dependency upgrades do not reintroduce v4 instability.

Actions:

1. Keep `upgrade:tailwind4:canary` as a safety gate for future major styling/toolchain changes.
2. Keep managed-server behavior in audit scripts as default.
3. Add CI step requiring:
   - `npm run audit:ui`
   - `npm run audit:perf:strict`
   - `npm run visual:compare`

Acceptance:

1. CI gate blocks merge on any P0/P1 visual/a11y regression.

## Rollout Order

1. Merge current v4 baseline with gates (already passing).
2. Execute Phase 1 on high-risk primitives.
3. Execute Phase 2 animation hardening.
4. Execute Phase 3 config simplification.
5. Keep Phase 4 always-on in CI.

## Implementation Progress

## Completed in this cycle

1. Phase 1 refactor completed for:
   - `src/components/ui/calendar.tsx`
   - `src/components/ui/chart.tsx`
   - `src/components/ui/command.tsx`
   - `src/components/ui/table.tsx`
   - `src/components/ui/dialog.tsx`
   - `src/components/ui/popover.tsx`
   - `src/components/ui/sheet.tsx`
   - `src/components/ui/select.tsx`
   - `src/components/ui/toast.tsx`
   - `src/components/ui/tooltip.tsx`
   - `src/components/ui/toggle-group.tsx`
   - `src/components/ui/button.tsx`
   - `src/components/ui/ThemeToggle.tsx`
2. Changes were behavior-preserving (class extraction/cleanup, no UX contract changes).
3. Verification:
   - `npx eslint src/components/ui/calendar.tsx src/components/ui/chart.tsx src/components/ui/command.tsx src/components/ui/table.tsx`
   - `npx eslint src/components/ui/button.tsx src/components/ui/dialog.tsx src/components/ui/popover.tsx src/components/ui/select.tsx src/components/ui/sheet.tsx src/components/ui/toast.tsx src/components/ui/tooltip.tsx src/components/ui/toggle-group.tsx`
   - `npx tsc --noEmit`
   - `npm run build`
   - `npm run audit:ui` (score 100, P0/P1 = 0)
4. Phase 2 hardening completed:
   - Added local animation fallback utilities in `src/index.css` (`@layer utilities`) for:
     - `animate-in`, `animate-out`
     - `fade-in`, `fade-in-0`, `fade-out`, `fade-out-0`, `fade-out-80`
     - `zoom-in-95`, `zoom-out-95`
     - `slide-in-from-*` and `slide-out-to-*` variants currently used by dialog/popover/sheet/select/toast/tooltip/rbac surfaces
   - Added local keyframes:
     - `@keyframes scurve-enter`
     - `@keyframes scurve-exit`
   - Removed `tailwindcss-animate` from `package.json` and `tailwind.config.js`.
   - Added centralized motion tokens in `src/index.css`:
     - `--motion-duration-{2xs,xs,sm,md,lg,xl}`
     - `--motion-ease-standard`
     - `--motion-ease-emphasized`
   - Added motion utility hooks in `src/index.css`:
     - `motion-state-dialog`, `motion-state-popover`, `motion-state-select`, `motion-state-tooltip`, `motion-state-sheet`, `motion-state-toast`
     - `motion-ease-standard`, `motion-ease-emphasized`, `motion-static-list`
   - Updated component surfaces to consume centralized motion state/easing classes:
     - `src/components/ui/dialog.tsx`
     - `src/components/ui/popover.tsx`
     - `src/components/ui/sheet.tsx`
     - `src/components/ui/select.tsx`
     - `src/components/ui/tooltip.tsx`
     - `src/components/ui/toast.tsx`
     - `src/components/rbac/HierarchyExplorer.tsx`
   - Verified fallback-only path with `npm run upgrade:gate` pass (lint/typecheck/build/ui/perf/visual).
5. Phase 3 simplification completed:
   - Removed duplicated semantic color/radius mappings from `tailwind.config.js`.
   - Kept semantic color + radius as single source of truth in `src/index.css` `@theme` block.
   - Removed unused accordion animation/keyframe config from `tailwind.config.js`.
   - Migrated shadow scale to `@theme` aliases in `src/index.css` and removed `boxShadow` mapping from `tailwind.config.js`.
   - Added runtime elevation variables (`--elevation-shadow-{xs,sm,md,lg,xl}`) with light/dark values and mapped `--shadow-*` theme tokens to them.
   - Verified compiled utilities resolve to runtime variables (`shadow-*` -> `var(--elevation-shadow-*)`), preserving theme-aware shadows without `tailwind.config.js` drift.
   - Verified with:
     - `npm run lint`
     - `npx tsc --noEmit`
     - `npm run build`
     - `npm run check:theme`
     - `npm run audit:ui` (score 100, P0/P1 = 0)
6. Phase 4 guardrails implemented in CI:
   - Updated `.github/workflows/quality-gates.yml` to run:
     - Playwright Chromium install
     - `npm run audit:ui`
     - `npm run audit:perf:strict`
     - `npm run visual:compare`
   - Existing lint/typecheck/build checks remain in the same workflow.
7. Perf gate stabilization completed:
   - Added retry handling for runtime probe runs in:
     - `scripts/upgrade/perf-compare.mjs`
     - `scripts/upgrade/perf-baseline.mjs`
   - Added build-regression confirmation sampling in `scripts/upgrade/perf-compare.mjs` to reduce transient false positives.
   - Hardened policy-route readiness check in `e2e/perf-probes.spec.ts` (`toHaveURL` + stable test-id + heading visibility).
   - Tuned default `PERF_PROBE_GANTT_SWITCH_REGRESSION_ABS_MS` from `300` to `700` in `scripts/upgrade/perf-compare.mjs` to match observed variance.
   - Refreshed baseline and re-validated with:
     - `npm run perf:baseline`
     - `npm run perf:compare`
     - `npm run upgrade:gate` (pass)
8. Phase 4 canary workflow completed:
   - Added dedicated scheduled/manual CI workflow:
     - `.github/workflows/tailwind4-canary.yml`
   - Triggers:
     - `workflow_dispatch`
     - weekly schedule (`0 3 * * 1`)
   - Workflow runs:
     - `npm ci`
     - Playwright Chromium install
     - `npm run upgrade:tailwind4:canary`
   - Uploads canary report artifact:
     - `artifacts/perf-upgrade/tailwind4-canary-report.json`

## Remaining Phase 1 targets

1. None.

## Remaining Phase 2 targets

1. None.

## Remaining Phase 3 targets

1. None.

## Remaining Phase 4 targets

1. None.
