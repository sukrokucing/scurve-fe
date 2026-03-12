# Shadcn Replacement Audit (Safe Core + Table Completion)

## Replaced Patterns
1. Projects row compact actions moved from custom `Popover` menu to shadcn `DropdownMenu`.
   - File: `src/pages/projects/ProjectsPage.tsx`
   - Preserved test IDs:
     - `projects-row-actions-toggle`
     - `projects-row-compact-edit-button`
     - `projects-row-compact-delete-button`

2. Project settings tab switcher moved from mapped button group to shadcn `Tabs`.
   - File: `src/pages/projects/ProjectSettingsPage.tsx`
   - Preserved URL query-driven tab state and test IDs:
     - `project-settings-tab-members`
     - `project-settings-tab-resource-rates`
     - `project-settings-tab-general`

3. Tasks selection control moved from custom role-checkbox button to shadcn `Checkbox`.
   - File: `src/pages/tasks/TasksPage.tsx`
   - Preserved `tasks-row-select-checkbox` usage and row-click stop propagation behavior.

4. Destructive confirmation dialogs moved to shadcn `AlertDialog`.
   - Files:
     - `src/pages/projects/ProjectsPage.tsx`
     - `src/pages/tasks/TasksPage.tsx`
     - `src/components/gantt/TaskTable.tsx`
   - Existing mutation handlers and cleanup state behavior remain unchanged.

5. Added missing shadcn primitive wrappers in `src/components/ui`:
   - `checkbox.tsx`
   - `tabs.tsx`
   - `dropdown-menu.tsx`
   - `alert-dialog.tsx`

6. Completed full table modernization with TanStack row model + shadcn table primitives.
   - Shared renderer added: `src/components/ui/app-data-table.tsx`.
   - Raw `<table>` usage removed from app surfaces (kept only in table primitive component).
   - Complex surfaces migrated:
     - `src/pages/tasks/TasksPage.tsx` (main list + work log)
     - `src/components/rbac/PermissionMatrix.tsx`
     - `src/components/gantt/TaskTable.tsx`
   - All remaining table surfaces now use `useReactTable` directly or via `AppDataTable`.

## Deferred Patterns
1. Gantt domain controls (progress editor, resize/move controls, dependency UX).
2. Task filter/action popovers with domain-specific behavior.

## Deferral Rationale
1. These controls carry higher behavioral risk and are tightly coupled to product workflows.
2. Safe Core wave prioritizes substitutable interaction primitives with minimal regression risk.
3. Deferred items are better handled in dedicated UX waves with targeted E2E baselines.

## Guardrail
1. Added regression check script:
   - `npm run qa:tables`
   - Ensures table stack policy:
     - no raw `<table>` tags outside `src/components/ui/table.tsx`
     - files importing `@/components/ui/table` must use TanStack row model directly (`useReactTable`) or through `AppDataTable`.
