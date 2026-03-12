# shadcn Skill Rules (skills.sh) — Project Reference

Primary source:
- https://skills.sh/shadcn/ui/shadcn
- https://raw.githubusercontent.com/shadcn/ui/HEAD/skills/shadcn/SKILL.md

Use this reference when:
- Adding/updating shadcn components with CLI.
- Reviewing component composition/styling consistency.
- Auditing generated registry code before merge.

## High-Value Rules to Adopt in scurve-fe

1. Prefer CLI discovery and docs before custom UI.
- `npx shadcn@latest search ...`
- `npx shadcn@latest docs <component>`
- `npx shadcn@latest info --json`

2. Use semantic tokens and built-in variants first.
- Prefer `bg-primary`, `text-muted-foreground`, `variant="outline"`, `size="sm"`.
- Avoid raw colors (`bg-blue-500`, custom hex in utility classes).

3. Keep Tailwind utility patterns consistent.
- Use `gap-*` over `space-x-*` / `space-y-*`.
- Use `size-*` when width/height are equal.
- Use `truncate` shorthand.
- Use `cn()` for conditional class composition.

4. Respect composition constraints in shadcn primitives.
- Keep grouped items inside group containers (e.g. `SelectGroup`/`CommandGroup`).
- Keep `TabsTrigger` inside `TabsList`.
- Require titles in `Dialog`/`Sheet`/`Drawer` for accessibility.
- Prefer full card composition (`CardHeader`, `CardTitle`, `CardContent`, etc.).

5. Avoid anti-patterns in overlays and loading states.
- Do not add manual overlay z-index hacks unless debugging a proven stack bug.
- `Button` should use `disabled` + spinner composition, not custom `isLoading` props.

6. Update workflow should be diff-first.
- Preview with `npx shadcn@latest add <component> --dry-run`.
- Inspect with `npx shadcn@latest add <component> --diff <file>`.
- Avoid blind overwrite unless explicitly requested.

7. Do not guess community registry source.
- If user asks for a block/component without registry name, ask which registry to use.

## Compatibility Notes for This Repo

1. Current project uses established wrappers (`Form`, `Input`, `Combobox`, etc.).
- Apply these rules incrementally; do not force broad rewrites that break contracts.

2. Keep existing UX/test contracts stable.
- Preserve `data-testid` selectors and existing interaction behavior unless explicitly changing them.

3. Use these rules as a review checklist.
- Enforce mainly on new/updated files and during refactors.
