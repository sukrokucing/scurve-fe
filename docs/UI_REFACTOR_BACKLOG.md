# UI Refactor Backlog

## Current Baseline (2026-02-28)
- Total findings: `0`
- Severity: `P0: 0`, `P1: 0`, `P2: 0`, `P3: 0`
- Scorecard: `100`

## P0
- None currently committed. Runtime scan output is the source of truth.

## P1
- Normalize minimum target sizes in dense controls:
  - pagination icon buttons
  - RBAC matrix info/help buttons
  - compact action buttons in Gantt and access flow
- Enforce keyboard-visible focus on all interactive primitives and icon-only buttons.
- Remove unintended horizontal overflow where detected by route/theme/viewport matrix.

## P2
- Reduce direct color utility drift (`bg-*-500`, `text-*-600`) in feature components; prefer semantic token classes.
- Ensure truncation (`truncate`, `line-clamp-*`) has fallback affordance (`title` or tooltip) for critical labels.
- Tighten typography hierarchy and spacing rhythm for admin dense pages:
  - `/settings/policy`
  - `/settings/roles`
  - `/settings/users`

## P3
- Fine-tune motion and transition consistency between list/table/dialog controls.
- Improve empty/loading/error state language consistency by route.

## Tracking
- Findings are generated into `artifacts/ui-audit/findings.json`.
- Prioritize by severity, then by route interaction frequency.
