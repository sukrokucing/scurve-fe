# UI Refactor Decisions

## Locked Decisions
1. Full-app scope across product, admin, and auth routes.
2. Phased rollout with strict gates (`lint`, `tsc`, `audit:ui`, Playwright).
3. Preserve current brand direction (teal identity).
4. Preserve existing theme token contract (`hsl(var(--token))`).
5. No UI library swap; evolve existing Tailwind + Radix + custom primitives.

## Design-System Direction
1. Normalize target size and focus behavior in shared primitives first.
2. Prefer semantic token usage over hardcoded palette utilities.
3. Keep interaction density high but with reliable hit targets and spacing hierarchy.
4. Keep Gantt behavior semantics stable; only refine visual clarity and interaction polish.

## Audit Framework Decision
1. Static scan identifies likely code-level risks.
2. Runtime scan validates actual rendered behavior per route/theme/viewport.
3. Scorecard and merged findings drive phased backlog execution.
