# Runtime Performance Probes

This repo includes Playwright-based runtime probes for high-impact routes:

- `/tasks`
- `/settings/policy`
- `/settings/flow`

The probes are deterministic because they use API route mocking in the test.

## Command

```bash
npm run test:e2e:perf
```

## Output

- `artifacts/perf-probes/metrics.json`

The file contains:

- per-probe duration (`durationMs`)
- corresponding budget (`budgetMs`)
- pass/fail per probe (`ok`)

## Budget Overrides

You can tune budgets using environment variables:

- `PERF_BUDGET_TASKS_LOAD_MS`
- `PERF_BUDGET_TASKS_SEARCH_MS`
- `PERF_BUDGET_GANTT_SWITCH_MS`
- `PERF_BUDGET_GANTT_TODAY_MS`
- `PERF_BUDGET_POLICY_LOAD_MS`
- `PERF_BUDGET_POLICY_FILTER_MS`
- `PERF_BUDGET_FLOW_LOAD_MS`
- `PERF_BUDGET_FLOW_SELECT_MS`

Example:

```bash
PERF_BUDGET_TASKS_LOAD_MS=6500 npm run test:e2e:perf
```

## Notes

- These probes are regression guards, not synthetic benchmarks.
- Keep budgets realistic and stable across CI hardware.
