# UI/UX Pro Max (Distilled Guide)

Source: https://skills.sh/nextlevelbuilder/ui-ux-pro-max-skill/ui-ux-pro-max

**Load only for:** layout redesign, dense admin screens, modal/sheet polish, cross-breakpoint UX.
**Skip for:** API/type/schema tasks, backend integration, tiny non-UI fixes.

## Priority (top to bottom)

1. Accessibility + interaction safety
2. Task completion speed + clarity
3. Responsive layout stability
4. Visual consistency + hierarchy
5. Motion + personality polish

## Rules

**Hierarchy** — One primary action per surface. Group related controls. Reduce noise before adding UI.

**Spacing** — Tokenized scale (`gap-*`, `p-*`). Compact for data-heavy, preserve clickability. Consistent row heights.

**Targets** — Mobile: 44x44 min. Desktop icon-only: 36x36 min. `cursor-pointer` for actionable, `cursor-not-allowed` for disabled. Show feedback on hover/active/focus/disabled/loading. Prevent duplicate submissions.

**Accessibility** — Visible `focus-visible` ring. Text contrast >= 4.5:1 (AA). Large text/icons >= 3:1. No color-only meaning. Explicit dialog/sheet titles.

**Responsive** — No horizontal overflow at 390x844, 768x1024, 1440x900. No fixed-width containers breaking mobile. Scroll strategy for tables. Max widths for readability.

**Motion** — Purposeful, short. Subtle transitions for affordance. No slow hover delays. Skeleton shapes match final layout.

**Forms** — Labels + errors near field. Validate early, not noisy. Consistent grouping. Clear submit disabled/loading states.

**Navigation** — Fast-path actions in top-level nav. Progressive disclosure for advanced controls. `Enter` = highlighted item, fallback to first result. Keyboard = pointer parity.

## Conflict Rule

Repo contracts override these guidelines:
- Architecture + data flow in SKILL.md authoritative
- shadcn composition rules
- Tailwind token conventions
- TanStack Query data flow
- Existing `data-testid` contracts unless task explicitly changes tests
