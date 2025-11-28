# Knowledge Checkpoints for UI Review

## 2025-11-24 Login + Dashboard + Projects + Tasks
- Credentials used: `jimmy@dwp.co.id` / `password123`
- Login page loads, accessible form (email + password) passes manual inspection.
- Dashboard shows Projects overview card (lists Dwifi Trial) and Next steps guidance. Snackbar confirms login success.
- Projects view fetches workspace projects via `/api/projects` (backend currently returning HTTP 500 on GET). UI still renders cached row (Dwifi Trial) and offers Refresh/New project CTA.
- Tasks view renders Dwifi Trial backlog, table shows "Quick task" row, progress toggle exists; console warns about Select switching uncontrolled→controlled (needs fix).
- Screenshots exported to `output/playwright-run-1763947082159/1763947082159/output/playwright-run-1763947082159/` (dashboard/projects/tasks).
- Outstanding backend issue: `/projects` GET returns 500 from rust-service when called via curl (see prior diagnostics). Frontend should surface error states.
