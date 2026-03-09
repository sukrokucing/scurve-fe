# UI Refactor Decisions

## Locked Decisions
1. Full-app scope across product, admin, and auth routes.
2. Phased rollout with strict gates (`lint`, `tsc`, `audit:ui`, Playwright).
3. Preserve current brand direction (teal identity).
4. Preserve existing theme token contract (`hsl(var(--token))`).
5. No UI library swap; evolve existing Tailwind + Radix + custom primitives.
6. Prioritize friction reduction in high-frequency flows (`/tasks`, `/settings/policy`) before visual polish.
7. Prefer progressive disclosure over always-visible dense control bars.
8. Remove native browser confirms in favor of consistent app dialogs.

## Design-System Direction
1. Normalize target size and focus behavior in shared primitives first.
2. Prefer semantic token usage over hardcoded palette utilities.
3. Keep interaction density high but with reliable hit targets and spacing hierarchy.
4. Keep Gantt behavior semantics stable; only refine visual clarity and interaction polish.
5. Use clear language labels for admin flows (avoid unexplained RBAC jargon in primary headings).

## Audit Framework Decision
1. Static scan identifies likely code-level risks.
2. Runtime scan validates actual rendered behavior per route/theme/viewport.
3. Scorecard and merged findings drive phased backlog execution.
4. Runtime audit must treat unexpected route error states as a quality signal, not only a screenshot artifact.
