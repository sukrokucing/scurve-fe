# UI Audit Method

## Scope
- Routes: `/`, `/projects`, `/tasks`, `/settings/users`, `/settings/roles`, `/settings/policy`, `/settings/flow`, `/login`, `/register`
- Themes: `light`, `dark`, `glass`
- Viewports: `mobile (390x844)`, `tablet (768x1024)`, `desktop (1440x900)`
- States: `default`, `hover-focus`, plus observed `loading|empty|error` indicators

## Rulebook
- Source: `scripts/ui-audit/good-ui-rules.ts`
- Core categories:
  - hierarchy / density / CTA clarity
  - readability / visual consistency
  - spacing consistency (`padding`, `margin`, `gap`) and inline-style drift
  - accessibility (contrast, target size, focus)
  - layout integrity / truncation recoverability

## Commands
- Full gate run: `npm run audit:ui`
- Visual-only scan: `npm run audit:ui:mode -- --mode=visual`
- A11y-focused scan: `npm run audit:ui:mode -- --mode=a11y`
- Aggregate existing outputs: `npm run audit:ui:mode -- --mode=report`

`BASE_URL` defaults to `http://localhost:3001` when not set.
The app must be running and reachable at `BASE_URL`; route/load errors fail the Playwright audit run directly.

## Artifacts
- Static findings: `artifacts/ui-audit/findings.static.json`
- Runtime findings: `artifacts/ui-audit/findings.runtime.json`
- Merged findings: `artifacts/ui-audit/findings.json`
- Scorecard: `artifacts/ui-audit/scorecard.json`
- Screenshots: `artifacts/ui-audit/screenshots/`

## Severity
- `P0`: critical accessibility break (shipping blocker)
- `P1`: task friction/high-impact usability break
- `P2`: visual inconsistency/readability issue
- `P3`: polish/low-risk issue

## Quality Gate
- `npm run audit:ui` fails when any `P0` or `P1` findings exist.
- CI should run:
  - `npm run lint`
  - `npx tsc --noEmit`
  - `npm run audit:ui`
