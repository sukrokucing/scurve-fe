---
name: scurve-fe
description: >
  frontend skill for s-curve project. triggers on: implementation, review,
  debug, refactor, crud flows, data tables, dialogs, forms, query/mutation,
  routing, accessibility, perf, and architecture decisions.
---

# S-Curve Frontend Skill

## Stack

| Layer | Library | Version |
|---|---|---|
| Runtime | React 19 + TypeScript 5.9 | ^19.1 |
| Build | Vite 8 | ^8.0 |
| Styling | Tailwind CSS v4 (PostCSS, config-less) | ^4.2 |
| Components | shadcn/ui (Radix primitives) | latest |
| Data Fetching | TanStack Query v5 | ^5.90 |
| Tables | TanStack Table v8 | ^8.21 |
| Virtualization | TanStack Virtual v3 | ^3.13 |
| Forms | React Hook Form v7 + Zod v4 | ^7.66 / ^4.1 |
| Client State | Zustand v5 | ^5.0 |
| Routing | React Router v7 | ^7.9 |
| Animation | Framer Motion v12 | ^12.23 |
| DnD | @dnd-kit (core + sortable) | ^6.3 / ^10.0 |
| Charts | Recharts (via shadcn Chart) | ^2.15 |
| Utility Hooks | react-use (only when React built-ins insufficient) | ^17.6 |
| Toast | Sonner v2 | ^2.0 |
| API Types | openapi-typescript (generated) | ^7.10 |

---

## Project Structure (Actual)

```
src/
  api/
    client.ts           ← axios instance
    openapiClient.ts    ← typed OpenAPI wrapper (all API methods + type exports)
    queries/            ← TanStack Query hooks per domain
      projects.ts       ← query key factory + useQuery/useMutation hooks
      tasks.ts
      rbac.ts
      users.ts
      notifications.ts
  schemas/
    project.ts          ← Zod schemas (fallback + generated)
    task.ts
    generated/
      api-schemas.ts    ← auto-generated from OpenAPI spec
  store/
    authStore.ts        ← Zustand: auth state
    networkStore.ts     ← Zustand: online/offline
    permissionStore.ts  ← Zustand: RBAC permissions cache
    realtimeStore.ts    ← Zustand: WebSocket/SSE state
  components/
    ui/                 ← shadcn primitives + shared components
    layout/             ← RootLayout, AppLayout, Sidebar, BottomNav
    gantt/              ← Gantt chart (virtualized timeline, task bars, DnD)
    kanban/             ← Kanban board
    dashboard/          ← ProjectDashboard
    rbac/               ← HierarchyExplorer, PermissionMatrix, AuditLog
    navigation/         ← MenuSearch, GlobalMenuSearchDialog
    realtime/           ← RealtimeBootstrap
  hooks/                ← shared hooks (useClientPagination, useDebouncedValue)
  pages/                ← route-level page components
  routes/               ← route config
  navigation/           ← menu/nav config
  auth/                 ← auth logic
  types/                ← global types (domain.ts, api.ts from openapi-typescript)
  lib/                  ← utils, cn(), apiSearch helpers
```

**Rules:**
- API calls → `api/openapiClient.ts` (typed methods, never raw axios in components)
- Query hooks → `api/queries/<domain>.ts`
- Zod schemas → `schemas/<domain>.ts`
- Client-only state → `store/` (Zustand) — auth, network, permissions, realtime only
- Server state → TanStack Query cache, never duplicated in Zustand
- Shared UI → `components/ui/`
- Domain UI → `components/<domain>/`
- Pages stay thin — assemble components, don't absorb logic

---

## API Layer — OpenAPI Typed Client

All API calls go through `openapi` object in `openapiClient.ts`. Types derived from OpenAPI spec via `openapi-typescript`.

```ts
// openapiClient.ts exports typed methods:
openapi.listProjects()
openapi.createProject(payload)
openapi.updateTask(projectId, taskId, body)
// Types exported alongside:
export type { TaskCreateRequest, ApiSCurveMetric, ... }
```

**Rules:**
- Never call `api.get/post` directly in query hooks — use `openapi.*`
- Types come from `components["schemas"]["TypeName"]` pattern
- Keep `openapiClient.ts` as single source for API surface
- Regenerate types: `npm run generate:schemas`

---

## Data Fetching — TanStack Query v5

### Query Key Factories

```ts
// api/queries/projects.ts
const PROJECTS_QUERY_KEY = ["projects"] as const;

export const projectsKeys = {
  all: PROJECTS_QUERY_KEY,
  detail: (id: string) => [...PROJECTS_QUERY_KEY, id] as const,
  dashboard: (id: string, metric: ApiSCurveMetric) =>
    [...PROJECTS_QUERY_KEY, id, "dashboard", metric] as const,
  members: (id: string) =>
    [...PROJECTS_QUERY_KEY, id, "settings", "members"] as const,
};
```

### Query Hooks

```ts
export function useProjectsQuery() {
  return useQuery<Project[]>({
    queryKey: projectsKeys.all,
    queryFn: () => openapi.listProjects(),
  });
}

// Dependent query
export function useProjectById(projectId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: projectsKeys.detail(projectId),
    queryFn: () => openapi.getProject(projectId),
    enabled: Boolean(projectId) && (options?.enabled ?? true),
  });
}

// Paginated with keepPreviousData
export function useTasksByProjectList(projectId: string, params: TaskListQueryParams) {
  return useQuery<PaginatedTasksResult>({
    queryKey: tasksKeys.byProjectList(projectId, params),
    queryFn: () => openapi.listTasksByProjectPaginated(projectId, params),
    enabled: Boolean(projectId),
    placeholderData: keepPreviousData,
  });
}
```

### Mutation + Invalidation

```ts
export function useCreateProjectMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ProjectCreatePayload) => openapi.createProject(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectsKeys.all });
    },
  });
}
```

### Optimistic Updates (established pattern)

```ts
export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args) => openapi.updateTask(args.projectId, args.id, body),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: tasksKeys.byProject(variables.projectId) });
      const previous = queryClient.getQueryData<Task[]>(tasksKeys.byProject(variables.projectId));
      // optimistically patch cache
      queryClient.setQueryData<Task[]>(key, patched);
      return { previous, projectId: variables.projectId };
    },
    onError: (_err, _vars, context) => {
      // rollback
      queryClient.setQueryData(key, context?.previous);
    },
  });
}
```

### Parallel Fetching

```ts
// useQueries for multiple projects
const results = useQueries({
  queries: projectIds.map((id) => ({
    queryKey: projectsKeys.sCurveHealth(id, metric),
    queryFn: () => openapi.getProjectSCurveHealth(id, metric),
    staleTime: 5 * 60 * 1000,
  })),
});
```

**Rules:**
- Query key factory per domain — `as const` for type safety
- `keepPreviousData` for pagination/filtering (prevents flash)
- `staleTime` on stable data (resource roles, assignees = 5min)
- Optimistic updates for drag/drop, inline edits — always with rollback
- `onSuccess` for simple invalidation, `onSettled` when UI must wait
- `useQueries` for parallel independent fetches
- `enabled` for dependent queries — never fetch with empty IDs
- No `useEffect` for server-state sync
- Handle 403/404 gracefully (return `[]` or `null`, don't throw)

---

## Client State — Zustand v5

Zustand for state that doesn't come from server or must persist across routes:

| Store | Purpose |
|---|---|
| `authStore` | Auth tokens, user identity |
| `networkStore` | Online/offline detection |
| `permissionStore` | RBAC permissions cache (localStorage-backed) |
| `realtimeStore` | WebSocket/SSE connection state |

```ts
import { create } from 'zustand';

export const usePermissionStore = create<PermissionState>((set, get) => ({
  permissions: getInitialPermissions(), // from localStorage
  hasPermission: (name, scope) => { /* check logic */ },
  setPermissions: (p) => { localStorage.setItem(...); set({ permissions: p }); },
  reset: () => { localStorage.removeItem(...); set({ permissions: [] }); },
}));
```

**Rules:**
- Zustand only for client-only state (auth, network, UI prefs, permissions)
- Server data stays in TanStack Query cache — never duplicate
- Keep stores small and focused — one concern per store
- Use `get()` for derived state inside actions, not `useEffect`

---

## Forms — React Hook Form v7 + Zod v4

```ts
// schemas/task.ts
import { z } from "zod";

export const taskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().max(4000).optional(),
  plan: z.number().min(1).max(3650),
  progress: z.number().min(0).max(100).default(0),
  status: z.enum(["todo", "in_progress", "blocked", "done"]).optional(),
});

export type TaskFormValues = z.infer<typeof taskSchema>;
```

```tsx
// Component
const form = useForm<TaskFormValues>({
  resolver: zodResolver(taskSchema),
  defaultValues: { title: '', progress: 0 },
});
```

**Rules:**
- Zod schemas in `schemas/<domain>.ts`, not in components
- Always provide `defaultValues`
- Always include `FormMessage` for validation feedback
- Prefer generated schemas when available (`schemas/generated/`)
- Zod v4: `z.string().min()`, `z.number().min()` — same surface for common patterns
- Keep submission logic small — transform close to mutation call

---

## Tables — TanStack Table v8

Use `useReactTable` as state engine. No ad-hoc sort/filter reimplementation.

**Rules:**
- Explicit state: `sorting`, `columnFilters`, `columnVisibility`, `rowSelection`
- `overflow-hidden rounded-md border` container
- Always render empty-result row with proper `colSpan`
- `data-state="selected"` on selected rows
- Row actions colocated with table
- `keepPreviousData` in backing query for pagination

---

## Performance — Vite 8 + React 19

### Build
- Vite 8 with `@vitejs/plugin-react` — ESM-only, fast HMR
- Tailwind v4 via `@tailwindcss/postcss` — no `tailwind.config.js`, CSS-first config
- Tree-shaking: named imports from `lucide-react`, `date-fns`, `recharts`

### Runtime
- `React.lazy()` + `Suspense` for route-level code splitting
- `@tanstack/react-virtual` for long lists (Gantt, large tables)
- `keepPreviousData` prevents layout thrash during pagination
- `staleTime` on stable queries to reduce refetches
- `useMemo`/`useCallback` only where profiler shows need — React 19 compiler handles most cases
- Optimistic updates for perceived speed on mutations
- `framer-motion` `layoutId` for smooth transitions, `AnimatePresence` for mount/unmount

### Bundle
- Audit: `npm run audit:perf:strict` — automated perf gate
- Check: `npm run perf:compare` — compare against baseline
- Avoid barrel exports in hot paths
- Dynamic import heavy dependencies (Gantt, charts) behind route splits

---

## Review / Refactor / Debug — PERFECT Protocol

Use for: code review, PR feedback, audit, bug analysis, refactor critique.

Review in order:

1. **Purpose** — Does change solve requested task? Route/data/behavior correct?
2. **Edge Cases** — Loading, error, empty, null, stale cache, pagination reset, permissions, responsive, destructive flows
3. **Reliability** — Perf, security, a11y regressions, race conditions, mutation side effects, query invalidation
4. **Form** — Repo contracts first:
   - API calls via `openapi.*` only
   - Query hooks in `api/queries/`
   - Zod schemas in `schemas/`
   - TanStack Table for tables
   - shadcn primitives first
   - Tailwind v4 first
5. **Evidence** — Tests, typecheck, build, lint. Never claim passes without verification
6. **Clarity** — Naming, file placement, component boundaries, prop typing
7. **Taste** — Non-blocking unless violates repo rule

### Output Contract

Group findings: **Blocking** → **Important non-blocking** → **Optional/taste**

Each: `location`, `issue`, `why`, `fix`

No vague LGTM. State what was checked vs. assumed.

---

## Dialog / CRUD Pattern

```tsx
interface ProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: Project; // undefined = create, defined = edit
}
```

- One dialog for create/edit unless flows materially differ
- Dialog state controlled at page level
- Close only after successful mutation or user cancel
- `AlertDialog` for destructive actions

---

## CRUD Page Checklist

1. `schemas/<name>.ts` — Zod schema + form type
2. `api/openapiClient.ts` — add typed methods (if new domain)
3. `api/queries/<name>.ts` — query key factory + hooks
4. `components/<name>/Table.tsx` — columns + row actions
5. `components/<name>/Form.tsx` — form + validation
6. `components/<name>/Dialog.tsx` — create/edit dialog
7. `pages/<Name>Page.tsx` — assemble + state
8. Wire route

Page rules: handle `isLoading`/`isError`/empty. Keep pages thin.

---

## UI / Styling

- **Tailwind v4** — CSS-first config, `@theme` for tokens, no `tailwind.config.js`
- **shadcn/ui first** — install via `npx shadcn@latest add <component>`
- Semantic tokens: `text-muted-foreground`, `bg-card` — no raw hex
- `gap-*` over `space-x/y-*`, `size-*` when w=h, `cn()` for conditional classes
- `Skeleton` for loading, `empty-state` for empty, `sonner` for toast
- `AlertDialog` for destructive confirms, never `window.confirm`
- For every UI task: apply `references/ui-ux-checklist.md`
- Load `references/ui-ux-pro-max.md` only for complex UX work

---

## Naming

| Thing | Convention | Example |
|---|---|---|
| Components | PascalCase | `ProjectTable.tsx` |
| Hooks | `use` prefix, camelCase | `useProjectsQuery` |
| Query key factories | `<domain>Keys` | `projectsKeys`, `tasksKeys` |
| Zod schemas | camelCase + `Schema` | `taskSchema` |
| Types | PascalCase | `Project`, `TaskFormValues` |
| Store hooks | `use<Name>Store` | `usePermissionStore` |

---

## Guardrails

**Never:**
- Call `api.get/post` or `axios` directly in components or query hooks (use `openapi.*`)
- Put server state in Zustand
- Use `useEffect` to sync server state
- Write inline `style={{}}` for static styling
- Duplicate shadcn primitive
- Skip Zod validation on forms
- Block review on taste alone

**Always:**
- Use query key factory for every domain
- Handle `isLoading`/`isError` in every query consumer
- `AlertDialog` for destructive actions
- Invalidate correct keys after mutations
- Type all props — no `any`
- State what was verified vs. assumed in review

---

## Hooks — react-use Policy

React built-ins first. react-use only for significant boilerplate savings.

Approved: `useDebounce`, `useLocalStorage`, `useWindowSize`, `usePrevious`, `useToggle`, `useIntersection`, `useCopyToClipboard`, `useMedia`, `useInterval`, `useIdle`

Skip: `useAsync/useFetch` (use TanStack Query), `useEffectOnce/useMount` (trivial), `useMountedState` (React 19 handles this)

→ Full ref: `references/react-use-hooks.md`

---

## Meta-Cognitive Protocol

For complex/ambiguous/high-impact work only:

1. **Decompose** — data flow, UI, server state, validation, a11y, edge cases
2. **Solve** — address each, confidence 0.0–1.0 on uncertain decisions
3. **Verify** — logic consistency, repo rules, library correctness, completeness
4. **Synthesize** — combine, prefer strongest-supported path
5. **Reflect** — if confidence < 0.8, revise once

For review: use PERFECT order. Prefer smallest fix restoring correctness.

---

## References

- `references/shadcn-components.md` — component list + use-cases
- `references/shadcn-skill-rules.md` — CLI workflow + composition rules
- `references/react-use-hooks.md` — approved hooks with examples
- `references/ui-ux-checklist.md` — mandatory P0/P1 UI checks
- `references/ui-ux-pro-max.md` — advanced UX guidance for complex surfaces
