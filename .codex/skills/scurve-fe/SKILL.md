---
name: scurve-fe
description: >
  frontend skill for the s-curve project (scurve-fe). use this whenever working
  on, reviewing, debugging, or refactoring any feature, page, component, form,
  table, api integration, query/mutation flow, route, or ui/ux surface in the
  scurve-fe react/typescript codebase, even if the request does not explicitly
  mention the stack. triggers on: implementation, pr review, code critique, bug
  triage, regression analysis, crud flows, data tables, dialogs, forms,
  tanstack query logic, feature folders, routing, accessibility, and frontend
  architecture decisions in this project.
---

# S-Curve Frontend Skill

## Stack

| Layer | Library |
|---|---|
| UI Framework | React + TypeScript |
| Styling | TailwindCSS (utility-first; inline style only for runtime geometry) |
| Components | shadcn/ui |
| Data Fetching | TanStack Query v5 |
| Forms | React Hook Form + Zod |
| Tables | TanStack Table |
| Utility Hooks | react-use (only when React built-ins are insufficient) |

---

## Context7-Validated Sources (2026-03-12)

Use these as the canonical upstream references when rules conflict:

- `shadcn/ui` (`/shadcn/ui`): Combobox + Data Table composition patterns and CLI install flow
- `TanStack Query` (`/tanstack/query`): v5 query/mutation invalidation and dependent-query behavior

Validation notes:
- Add new primitives with `npx shadcn@latest add <component>` when possible.
- Follow TanStack Table state-driven composition (`sorting`, `filters`, pagination, selection) rather than ad-hoc local table state.
- Make query invalidation explicit after writes; return/await invalidation when UI consistency depends on refreshed cache.

---

## Review / Refactor / Debug Mode — PERFECT

Use this mode when the task is:
- code review
- pr feedback
- implementation audit
- bug analysis
- regression analysis
- refactor critique
- architecture review

Review in this order:

1. **Purpose**
   - Verify the change actually solves the requested task.
   - Check route behavior, data flow, user-visible behavior, and acceptance criteria first.
   - If the code does not solve the task, treat that as blocking regardless of style quality.

2. **Edge Cases**
   - Check loading, error, empty, nullability, undefined values, dependent queries, stale cache behavior, pagination/filter resets, permission states, responsive behavior, destructive flows, create/edit mode differences, and impossible-looking states that may become reachable later.

3. **Reliability**
   - Check performance, security basics, accessibility regressions, broken integrations, input/output validation, race conditions, mutation side effects, query invalidation, and risky assumptions around async state.

4. **Form**
   - Enforce repo contracts first, not generic opinion:
     - business logic stays in `features/<name>/`
     - no direct API calls inside UI components
     - TanStack Query v5 for server state
     - React Hook Form + Zod for forms
     - TanStack Table as the table state engine
     - shadcn/ui primitives first
     - TailwindCSS first
   - Use general design principles only after repo contracts are satisfied.

5. **Evidence**
   - Prefer tests, type checks, build results, lint output, and CI evidence.
   - Never claim tests pass unless verified.
   - If evidence is missing, state that explicitly.

6. **Clarity**
   - Check naming, file placement, component boundaries, prop typing, readability, and whether intent is understandable without tracing every line.
   - Prefer code that is easy to scan diagonally.

7. **Taste**
   - Treat personal preferences as non-blocking unless they violate an explicit repo rule or create meaningful maintenance risk.
   - Avoid subjective comments without concrete reasoning.

### Review Output Contract

When performing review-mode work, organize findings under:

- **Blocking**
- **Important non-blocking**
- **Optional / taste**

For each finding include:
- `location`
- `issue`
- `why it matters`
- `suggested fix`

Rules:
- Do not give vague approval such as `LGTM`.
- If no blocking issues are found, say what was checked and what was not verified.
- If a comment is subjective and unsupported by repo rules or evidence, keep it non-blocking.
- Prefer constructive, actionable feedback over taste-driven commentary.
- If a recurring review issue appears, suggest turning it into an explicit repo convention.

### Self-Review Requirement

Before finalizing code or a recommendation for complex work:
- run a quick self-review using the same PERFECT order
- surface the highest-risk assumption
- revise once if confidence is below `0.8`

---

## Project Structure

```text
src/
  components/
    ui/            ← shadcn primitives + shared reusable components
  features/
    <feature>/
      api.ts       ← axios/fetch functions, no business logic
      hooks.ts     ← TanStack Query hooks
      types.ts     ← TypeScript interfaces/types + zod schemas
      components/
        FeatureTable.tsx
        FeatureForm.tsx
        FeatureDialog.tsx
  hooks/           ← global shared hooks
  lib/             ← utils, axios instance, zod helpers
  pages/           ← route-level page components
  types/           ← global shared types
```

**Rules:**
- Business logic → `features/<name>/`
- Shared UI → `components/ui/`
- Feature UI → `features/<name>/components/`
- No direct API calls inside UI components — ever

---

## Feature Architecture

Every feature follows this exact structure:

```text
features/project/
  api.ts          ← pure fetch functions
  hooks.ts        ← useQuery / useMutation wrappers
  types.ts        ← Project, ProjectPayload, schema, etc.
  components/
    ProjectTable.tsx
    ProjectForm.tsx
    ProjectDialog.tsx
```

**Rules:**
- Keep `api.ts` limited to pure request/response functions.
- Keep `hooks.ts` limited to TanStack Query wrappers and cache behavior.
- Keep component files focused on presentation + local UI state.
- Do not bury feature logic inside route pages.

---

## Data Fetching — TanStack Query v5

```ts
// api.ts
export const fetchProjects = async (): Promise<Project[]> => {
  const { data } = await api.get('/projects')
  return data
}

export const createProject = async (
  payload: ProjectPayload
): Promise<Project> => {
  const { data } = await api.post('/projects', payload)
  return data
}
```

```ts
// hooks.ts
export const useProjects = () =>
  useQuery({
    queryKey: ['projects'],
    queryFn: fetchProjects,
  })

export const useCreateProject = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createProject,
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ['projects'] }),
  })
}
```

**Rules:**
- Always define `queryKey` as an array.
- Keep `queryKey` segments stable and serializable.
- Put filter/pagination objects in the last `queryKey` segment.
- Invalidate related queries after mutation (`onSuccess` or `onSettled`).
- If UI must wait for fresh cache, return/await `invalidateQueries(...)`.
- Never call `fetch` or `axios` directly in components.
- Use `enabled` for dependent queries.
- Do not use `useEffect` for server-state synchronization; use query cache + invalidation.
- Prefer colocated query hooks inside the relevant feature folder.

---

## Form Pattern — React Hook Form + Zod

```ts
// types.ts
export const projectSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
})

export type ProjectPayload = z.infer<typeof projectSchema>
```

```tsx
// ProjectForm.tsx
const form = useForm<ProjectPayload>({
  resolver: zodResolver(projectSchema),
  defaultValues: {
    name: '',
    description: '',
  },
})

return (
  <Form {...form}>
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Name</FormLabel>
            <FormControl>
              <Input {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </form>
  </Form>
)
```

**Rules:**
- Define Zod schema in `types.ts`, not inside the component.
- Always provide `defaultValues`.
- Always include `FormMessage` for validation feedback.
- For edit forms, pass `defaultValues` from fetched data.
- Keep submission transformation logic small and explicit.
- Do not skip schema validation even for "simple" forms.

---

## Table Pattern — TanStack Table + shadcn

```tsx
// ProjectTable.tsx
const columns: ColumnDef<Project>[] = [
  { accessorKey: 'name', header: 'Name' },
  {
    id: 'actions',
    cell: ({ row }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onClick={() => onEdit(row.original)}>
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onDelete(row.original.id)}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
]
```

Table responsibilities:
- data rendering
- pagination
- sorting
- filtering
- row actions

**Rules:**
- Use `useReactTable` as the table state engine.
- Do not manually re-implement sort/filter logic in ad-hoc component state.
- Keep table state explicit as needed: `sorting`, `columnFilters`, `columnVisibility`, `rowSelection`.
- Wrap the table with an `overflow-hidden rounded-md border` container for consistent clipping and borders.
- Always render an explicit empty-result row (`No results`) with proper `colSpan`.
- Use `data-state="selected"` on selected rows for styling consistency.
- Keep row actions predictable and colocated with the table feature.

---

## Dialog / CRUD Pattern

```tsx
// ProjectDialog.tsx
interface ProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  project?: Project // undefined = create mode, defined = edit mode
}

export function ProjectDialog({
  open,
  onOpenChange,
  project,
}: ProjectDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {project ? 'Edit Project' : 'Create Project'}
          </DialogTitle>
        </DialogHeader>

        <ProjectForm
          defaultValues={project}
          onSuccess={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
```

One dialog component handles both create and edit based on whether the `project` prop is provided.

**Rules:**
- Reuse one dialog for create/edit unless the flows are materially different.
- Keep dialog open state controlled at the page/feature level.
- Close only after successful mutation or explicit user cancel.

---

## CRUD Page Checklist

When building a new CRUD page, complete steps in order:

1. `features/<name>/types.ts` — define entity type + Zod schema
2. `features/<name>/api.ts` — implement CRUD functions
3. `features/<name>/hooks.ts` — wrap with TanStack Query
4. `features/<name>/components/NameTable.tsx` — columns + row actions
5. `features/<name>/components/NameForm.tsx` — form with validation
6. `features/<name>/components/NameDialog.tsx` — create/edit dialog
7. `pages/NamePage.tsx` — assemble table + dialog + state
8. Wire up route in the router config

**Page-level rules:**
- Handle `isLoading`, `isError`, and empty state explicitly.
- Keep server state in Query, not in duplicated page state.
- Keep route pages thin; assemble, do not absorb feature internals.

---

## UI / Styling Rules

- **TailwindCSS first** — avoid inline `style={{}}`; use inline style only for runtime geometry (virtualization, measured widths/heights, pixel coordinates).
- **shadcn/ui components first** — do not reinvent existing primitives.
- Install missing shadcn primitives via CLI first: `npx shadcn@latest add <component>`.
- For shadcn CLI/component governance, use `references/shadcn-skill-rules.md`.
- For every UI task, apply mandatory checks from `references/ui-ux-checklist.md`.
- Load `references/ui-ux-pro-max.md` only for complex UX work.
- For loading states, use `<Skeleton />` from shadcn.
- For empty states, use `<Empty />` from shadcn or a consistent custom pattern.
- For toast notifications, use `sonner` (via shadcn `<Sonner />`).
- For confirmation dialogs, use `<AlertDialog />`, not `window.confirm`.

→ Full shadcn component list: `references/shadcn-components.md`

---

## UI/UX Pro Max (Hybrid)

### Enforcement Model

- **Mandatory for all UI work:** `references/ui-ux-checklist.md` (P0/P1 core checks)
- **On-demand deep guidance:** `references/ui-ux-pro-max.md`

### Decision Flow

1. If the request includes any UI change:
   - apply `ui-ux-checklist.md`
   - report checklist evidence
2. Load full `ui-ux-pro-max.md` only when the task includes:
   - layout redesign
   - dense admin/settings screens
   - modal-heavy interaction polish
   - cross-breakpoint UX improvements
3. If the task is non-UI (API/types/backend contracts):
   - do not inject unnecessary UX checklist commentary

### Conflict Rule

If UX guidance conflicts with repo contracts, keep repo contracts authoritative:
- feature architecture and data flow in this `SKILL.md`
- shadcn composition rules (`references/shadcn-skill-rules.md`)
- Tailwind semantic/token conventions
- stable `data-testid` behavior unless explicitly changed by the task

---

## Meta-Cognitive Reasoning Protocol

Use this protocol only for **complex, ambiguous, or high-impact work**, such as:
- multi-file refactors
- architecture decisions
- non-trivial CRUD flows
- state synchronization issues
- query invalidation strategy
- dense UI/UX redesigns
- debugging with multiple plausible root causes
- code review where multiple findings compete for priority

For these tasks:

1. **Decompose**
   - Break the task into smaller sub-problems:
     - data flow
     - UI structure
     - server state
     - validation
     - accessibility
     - edge cases

2. **Solve**
   - Address each sub-problem explicitly.
   - Assign a confidence level from `0.0` to `1.0` for important decisions only when uncertainty is meaningful.

3. **Verify**
   - Check:
     - logic consistency
     - agreement with this skill's architecture rules
     - factual and library-version correctness
     - completeness of edge cases
     - bias toward an overcomplicated or preferred pattern

4. **Synthesize**
   - Combine sub-results into a final recommendation or implementation plan.
   - Prefer the path with the strongest support from repo rules and the highest-confidence reasoning.

5. **Reflect**
   - If overall confidence is below `0.8`, identify the weakest assumption and revise the plan once before finalizing.

### Review-Mode Extension

For review, refactor, and debugging tasks:
- use PERFECT as the prioritization order for analysis
- do not lead with subjective style feedback
- prefer the smallest fix that restores correctness and repo alignment

### Output Style

- For simple tasks, answer directly without showing the protocol.
- For complex tasks, provide:
  - clear answer
  - confidence level
  - key caveats
- Keep this concise unless the user explicitly asks for detailed reasoning.

### Guardrail

Do not let this protocol override repository contracts. If reasoning and repo rules conflict, follow:

1. this `SKILL.md`
2. referenced repo conventions
3. upstream library guidance

---

## Hooks — When to Use react-use

Prefer React built-ins (`useState`, `useEffect`, `useCallback`, `useMemo`, etc.) first.

Use `react-use` only when the built-in requires significant boilerplate:

| Scenario | react-use hook |
|---|---|
| Debouncing input | `useDebounce` |
| Local storage sync | `useLocalStorage` |
| Window resize tracking | `useWindowSize` |
| Previous value | `usePrevious` |
| Toggle boolean | `useToggle` |
| Mounted/unmounted guard | `useMountedState` |
| Intersection observer | `useIntersection` |
| Copy to clipboard | `useCopyToClipboard` |

→ Full reference: `references/react-use-hooks.md`

---

## Naming Conventions

| Thing | Convention | Example |
|---|---|---|
| Components | PascalCase | `ProjectTable.tsx` |
| Hooks | camelCase + `use` | `useProjects`, `useCreateProject` |
| Files | camelCase or PascalCase | `api.ts`, `ProjectForm.tsx` |
| Query keys | kebab-case strings | `['project-list']` |
| Zod schemas | camelCase + `Schema` suffix | `projectSchema` |
| Types/interfaces | PascalCase | `Project`, `ProjectPayload` |

**Rules:**
- Keep feature names stable and obvious.
- Prefer names that reveal intent without reading implementation.
- Avoid vague names like `data`, `handler`, `temp`, `misc`.

---

## Design Principles (Frontend)

- Commit to a clear visual direction; avoid generic, template-like aesthetics.
- Use spacing consistently with Tailwind's scale (`gap-4`, `p-6`, etc.).
- Pick one heading size per context and stay consistent.
- Use semantic Tailwind tokens (`text-muted-foreground`, `bg-card`) rather than hardcoded colors.
- Handle loading, error, and empty states for every data-fetching component.
- Prefer `Sheet` for side-panel flows and `Dialog` for confirmations and short forms.
- Optimize for clarity, cohesion, and maintainability before cleverness.

---

## Guardrails

**Never:**
- Call `fetch` or `axios` directly inside a component.
- Put state in a global store when TanStack Query cache suffices.
- Use `useEffect` to sync server state.
- Write inline `style={{}}` for static styling that should be tokenized class utilities.
- Duplicate a shadcn component that already exists.
- Skip Zod validation on forms.
- Block a review purely on taste when no repo rule is violated.

**Always:**
- Keep feature logic inside the feature folder.
- Handle `isLoading` and `isError` in every component using `useQuery`.
- Use `AlertDialog` for destructive actions (`delete`, `reset`).
- Invalidate the correct query keys after mutations.
- Type all props explicitly; avoid `any`.
- State what was verified versus assumed during review/debug work.

---

## References

- `references/shadcn-components.md` — full shadcn component list with use-cases
- `references/shadcn-skill-rules.md` — upstream shadcn `skills.sh` rules and CLI workflow
- `references/react-use-hooks.md` — react-use hooks reference with examples
- `references/ui-ux-checklist.md` — mandatory P0/P1 UI checklist + output evidence template
- `references/ui-ux-pro-max.md` — distilled advanced UI/UX guidance for complex surfaces
