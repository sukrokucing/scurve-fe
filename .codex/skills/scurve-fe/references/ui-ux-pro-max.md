# UI/UX Pro Max (Distilled Hybrid Guide)

Source inspiration:
- https://skills.sh/nextlevelbuilder/ui-ux-pro-max-skill/ui-ux-pro-max

Use this reference for complex UI/UX work in `scurve-fe`. Keep it concise and apply only what improves user outcomes.

## When to Load This File

Load this file when the task includes:
- layout redesign or major visual refactor
- dense admin/settings screens
- modal/dialog/sheet interaction quality issues
- cross-breakpoint polish (mobile + desktop parity)
- navigation/search usability improvements

Skip loading this file for:
- pure API/type/schema tasks
- backend-only integration changes
- tiny copy or one-line non-UI fixes

## Priority Order (Apply Top to Bottom)

1. Accessibility and interaction safety
2. Task completion speed and clarity
3. Responsive layout stability
4. Visual consistency and hierarchy polish
5. Motion and personality polish

## 1) Hierarchy and Scannability

- Make one primary action obvious per surface.
- Group related controls and increase spacing between unrelated groups.
- Keep dense screens readable with clear section labels and rhythm.
- Reduce visual noise before adding new UI patterns.

## 2) Spacing and Density

- Use tokenized spacing scale consistently (`gap-*`, `p-*`, `space-y-*`).
- Keep compact UI for data-heavy screens, but preserve clickability.
- Avoid mixed spacing patterns within the same component family.
- Use consistent row heights for tables/lists with interactive cells.

## 3) Interaction Targets and Feedback

- Mobile targets: at least `44x44`.
- Desktop icon-only controls: at least `36x36`.
- Use pointer semantics consistently:
  - actionable: `cursor-pointer`
  - disabled: `cursor-not-allowed`
- Provide immediate visual feedback for hover, active, focus, disabled, loading.
- For async actions, show pending state and prevent duplicate submissions.

## 4) Accessibility Baseline

- Keep visible keyboard focus on all focusable controls (`focus-visible` ring).
- Maintain color contrast:
  - body/small text: WCAG AA target (`>= 4.5:1`)
  - large text/icons: target (`>= 3:1`)
- Avoid color-only meaning for status; include text/icon cues.
- Keep dialog/sheet labels and titles explicit for screen readers.

## 5) Responsive Layout Stability

- No horizontal overflow at key viewports (`390x844`, `768x1024`, `1440x900`).
- Avoid fixed-width containers that break on mobile.
- Protect table-heavy views with scroll strategy and content truncation rules.
- Preserve information hierarchy on wide screens with readable max widths.

## 6) Motion and Perceived Performance

- Keep motion purposeful and short.
- Prefer subtle transitions for affordance, not decoration.
- Avoid slow hover cards/popovers that delay task completion.
- Keep skeleton/loading states shape-aligned with final layout.

## 7) Form and Validation UX

- Show labels, helper text, and errors near the field.
- Validate early enough to reduce rework, but avoid noisy errors.
- Use consistent input grouping and spacing in dialogs/forms.
- Keep submit actions predictable (clear disabled/loading states).

## 8) Navigation and Search UX

- Preserve fast-path actions in top-level navigation.
- Use progressive disclosure for advanced controls to reduce clutter.
- In command/search UI:
  - `Enter` should prefer highlighted item
  - fallback to first ranked result if none highlighted
- Keep keyboard and pointer behavior equivalent.

## Conflict Rule for This Repo

If any guideline here conflicts with existing repo contracts:
- keep architecture and contract rules in `SKILL.md` authoritative
- apply best-fit UX improvement without breaking:
  - shadcn composition rules
  - Tailwind token conventions
  - TanStack Query data flow
  - existing `data-testid` contracts unless task explicitly changes tests
