---
name: scurve-fe
description: >
  Skill for the S-Curve frontend project (scurve-fe). Use this whenever working
  on any feature, page, component, form, table, API integration, or refactor in
  the scurve-fe React/TypeScript codebase — even if the request doesn't
  explicitly mention the stack. Triggers on: creating pages, CRUD flows,
  data tables, dialogs, forms, API hooks, feature folders, routing, or any
  UI/UX work in this project.
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
- New primitives should be added with `npx shadcn@latest add <component>` when possible.
- Data table behavior should follow TanStack Table state-driven composition (`sorting`, `filters`, pagination, selection) rather than ad-hoc table state.
- Query invalidation should be explicit after writes; return/await invalidation when UI consistency depends on refreshed cache.

---

## Project Structure

```
src/
  components/
    ui/            ← shadcn primitives + shared reusable components
  features/
    <feature>/
      api.ts       ← axios/fetch functions, no business logic
      hooks.ts     ← TanStack Query hooks
      types.ts     ← TypeScript interfaces/types
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

```
features/project/
  api.ts          ← pure fetch functions
  hooks.ts        ← useQuery / useMutation wrappers
  types.ts        ← Project, ProjectPayload, etc.
  components/
    ProjectTable.tsx
    ProjectForm.tsx
    ProjectDialog.tsx
```

---

## Data Fetching — TanStack Query v5

```ts
// api.ts
export const fetchProjects = async (): Promise<Project[]> => {
  const { data } = await api.get('/projects')
  return data
}

export const createProject = async (payload: ProjectPayload): Promise<Project> => {
  const { data } = await api.post('/projects', payload)
  return data
}
```

```ts
// hooks.ts
export const useProjects = () =>
  useQuery({ queryKey: ['projects'], queryFn: fetchProjects })

export const useCreateProject = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createProject,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  })
}
```

**Rules:**
- Always define `queryKey` as an array
- Keep `queryKey` segments stable + serializable (put filter/pagination object in the last segment)
- Invalidate related queries after mutation (`onSuccess` or `onSettled`)
- If UI must wait for fresh cache, return/await `invalidateQueries(...)` promise
- Never call fetch/axios directly in components
- Use `enabled` option for dependent queries
- Do not use `useEffect` for server-state synchronization (use Query cache + invalidation)

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
  defaultValues: { name: '', description: '' },
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
            <FormControl><Input {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </form>
  </Form>
)
```

**Rules:**
- Zod schema defined in `types.ts`, not inside the component
- `defaultValues` always provided
- `FormMessage` always included for validation feedback
- For edit forms: pass `defaultValues` from fetched data

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
          <Button variant="ghost" size="icon"><MoreHorizontal /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onClick={() => onEdit(row.original)}>Edit</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onDelete(row.original.id)}>Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
]
```

Table responsibilities: data rendering, pagination, sorting, filtering, row actions.

**Rules:**
- Use `useReactTable` as the table state engine (no manual sort/filter re-implementation in component state)
- Keep table state explicit as needed: `sorting`, `columnFilters`, `columnVisibility`, `rowSelection`
- Wrap table with `overflow-hidden rounded-md border` container for consistent clipping and borders
- Always render an explicit empty-result row (`No results`) with proper `colSpan`
- Use `data-state="selected"` on selected rows for styling consistency

---

## Dialog / CRUD Pattern

```tsx
// ProjectDialog.tsx
interface ProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  project?: Project   // undefined = create mode, defined = edit mode
}

export function ProjectDialog({ open, onOpenChange, project }: ProjectDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{project ? 'Edit Project' : 'Create Project'}</DialogTitle>
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

One dialog component handles both create and edit based on whether `project` prop is provided.

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

---

## UI / Styling Rules

- **TailwindCSS first** — avoid inline `style={{}}`, and use it only for runtime geometry (virtualization, measured widths/heights, pixel coordinates)
- **shadcn/ui components first** — don't reinvent existing primitives
- Install missing shadcn primitives via CLI first: `npx shadcn@latest add <component>`
- For shadcn CLI/component governance, use `references/shadcn-skill-rules.md`
- For every UI task, apply mandatory checks from `references/ui-ux-checklist.md`
- Load `references/ui-ux-pro-max.md` only for complex UX work (see hybrid flow below)
- For loading states: use `<Skeleton />` from shadcn
- For empty states: use `<Empty />` from shadcn or a consistent custom pattern
- For toast notifications: use `sonner` (via shadcn `<Sonner />`)
- For confirmation dialogs: use `<AlertDialog />` not `window.confirm`

→ Full shadcn component list: `references/shadcn-components.md`

---

## UI/UX Pro Max (Hybrid)

### Enforcement Model

- **Mandatory for all UI work:** `references/ui-ux-checklist.md` (P0/P1 core checks)
- **On-demand deep guidance:** `references/ui-ux-pro-max.md`

### Decision Flow

1. If request includes any UI change:
   - apply `ui-ux-checklist.md` and report checklist evidence
2. Load full `ui-ux-pro-max.md` only when task includes:
   - layout redesign
   - dense admin/settings screens
   - modal-heavy interaction polish
   - cross-breakpoint UX improvements
3. If task is non-UI (API/types/backend contracts):
   - do not inject unnecessary UX checklist commentary

### Conflict Rule

If UX guidance conflicts with repo contracts, keep repo contracts authoritative:
- feature architecture and data flow in this `SKILL.md`
- shadcn composition rules (`references/shadcn-skill-rules.md`)
- Tailwind semantic/token conventions
- stable `data-testid` behavior unless explicitly changed by task

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

---

## Design Principles (Frontend)

- Commit to a clear visual direction — avoid generic, template-like aesthetics
- Use spacing consistently with Tailwind's scale (`gap-4`, `p-6`, etc.)
- Typography: pick one heading size per context and be consistent
- Color: use semantic Tailwind tokens (`text-muted-foreground`, `bg-card`) rather than hardcoded colors
- Loading/error/empty states must be handled for every data-fetching component
- Prefer `Sheet` for side-panel flows, `Dialog` for confirmations and short forms

---

## Guardrails

**Never:**
- Call `fetch` or `axios` directly inside a component
- Put state in a global store when TanStack Query cache suffices
- Use `useEffect` to sync server state (use React Query instead)
- Write inline `style={{}}` for static styling that should be tokenized class utilities
- Duplicate a shadcn component that already exists
- Skip Zod validation on forms

**Always:**
- Keep feature logic inside the feature folder
- Handle `isLoading`, `isError` in every component using `useQuery`
- Use `AlertDialog` for destructive actions (delete, reset)
- Invalidate the correct query keys after mutations
- Type all props explicitly — avoid `any`

---

## References

- `references/shadcn-components.md` — full shadcn component list with use-cases
- `references/shadcn-skill-rules.md` — upstream shadcn `skills.sh` rules and CLI workflow
- `references/react-use-hooks.md` — react-use hooks reference with examples
- `references/ui-ux-checklist.md` — mandatory P0/P1 UI checklist + output evidence template
- `references/ui-ux-pro-max.md` — distilled advanced UI/UX guidance for complex surfaces
