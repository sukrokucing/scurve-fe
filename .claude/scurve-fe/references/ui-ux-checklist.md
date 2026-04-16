# UI/UX Core Checklist (Mandatory P0/P1)

Use this checklist for every UI change in `scurve-fe`.

## Pass Criteria

All checks below must be explicitly verified before concluding UI work.

1. Focus visibility (P0)
- Keyboard navigation shows visible `focus-visible` indicator on all primary interactive controls touched by the change.

2. Minimum target size (P1)
- Mobile primary targets are at least `44x44`.
- Desktop icon-only controls are at least `36x36`.

3. Horizontal overflow (P1)
- No unintended horizontal scrolling at:
  - `390x844`
  - `768x1024`
  - `1440x900`

4. Contrast and state readability (P0/P1)
- Text and interactive states remain readable across supported themes.
- Focus/hover/active/disabled states are visually distinct.

5. Async surface states (P1)
- Loading, empty, and error states are handled for any changed async UI surface.

## Output Evidence Template

Use this compact format in responses for UI tasks:

```md
UI/UX Core Checklist
- Focus visible: PASS/FAIL — [surface/component]
- Target size: PASS/FAIL — [surface/component]
- No horizontal overflow: PASS/FAIL — [viewport + surface]
- Contrast/state readability: PASS/FAIL — [theme + surface]
- Async states: PASS/FAIL/N/A — [surface]
```

If any item fails, include:
- failure location
- expected behavior
- fix applied or blocker
