# UI Refactor Backlog

## Current Baseline (2026-03-04)
- Source scorecard: `artifacts/ui-audit/scorecard.json`
- Total findings: `0`
- Severity: `P0: 0`, `P1: 0`, `P2: 0`, `P3: 0`
- Scorecard: `100`

## P0 (Blocking)
- None currently identified.

## Completed In This Pass
1. Added audit rules for confirmation consistency and route baseline error-state detection.
2. Replaced native `confirm()` flows with dialog confirmations in:
   - `src/pages/tasks/TasksPage.tsx`
   - `src/pages/admin/RolesPage.tsx`
   - `src/pages/admin/UserAccessPage.tsx`
3. Replaced mobile desktop-only fallback in access flow with responsive stacked panels:
   - `src/components/rbac/HierarchyExplorer.tsx`
4. Removed hardcoded project color defaults from form state:
   - `src/pages/projects/ProjectsPage.tsx`
5. Reduced Tasks default toolbar density with progressive disclosure:
   - advanced assignee/date filters moved to `Advanced filters` popover
   - selected-task bulk controls moved to `Selection actions` popover
   - `src/pages/tasks/TasksPage.tsx`
6. Reduced RBAC matrix default cognitive load:
   - default `Review mode` (`editMode=false`)
   - grant/revoke and bulk column actions shown only in edit mode
   - `src/components/rbac/PermissionMatrix.tsx`
7. Closed spacing consistency findings:
   - `src/components/layout/SettingsLayout.tsx`
   - `src/components/rbac/PermissionMatrix.tsx`
   - `src/components/ui/calendar.tsx`
   - `src/components/ui/scroll-area.tsx`

## P1 (High Impact, Open)
- None in automated scorecard.

## P2 (Manual Follow-up)
1. Replace static dashboard trend claims with backend-backed metrics or neutral placeholders.
   - File: `src/pages/dashboard/DashboardPage.tsx`
2. Continue reducing jargon in admin labels and helper copy.
   - Files: `src/pages/admin/AccessFlowPage.tsx`, `src/pages/admin/PolicyPage.tsx`

## P3 (Polish)
1. Reduce decorative glass intensity on dense enterprise tables.
2. Harmonize metadata text sizing (`text-[10px]`/`text-xs`) where readability suffers.
3. Tighten transition consistency between dialog/sheet/popover surfaces.

## Execution Queue
1. Phase 2: information trust fixes.
   - replace static dashboard trend claims
   - improve plain-language admin copy
2. Phase 3: polish pass.
   - metadata text sizing consistency
   - glass intensity tuning for dense tables

## Quality Gate
- Required before each phase merge:
  - `npm run lint`
  - `npx tsc --noEmit`
  - `npm run audit:ui`
- Accept target:
  - `P0=0`, `P1=0`, and no known audit blindspot for authenticated route error states.

## Tracking
- Canonical findings: `artifacts/ui-audit/findings.json`
- Canonical score: `artifacts/ui-audit/scorecard.json`
- Strategy alignment: `docs/FRICTION_AUDIT.md`
