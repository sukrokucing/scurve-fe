# Performance Audit

This project includes a static performance audit to catch common regressions early.

## Commands

```bash
npm run audit:perf
npm run audit:perf:strict
```

- `audit:perf`: runs static checks and writes findings.
- `audit:perf:strict`: same checks, exits non-zero when `P1` findings exist.

## Output

- `artifacts/perf-audit/findings.json`

## Current Rules

1. `query.search-debounce` (`P1`)
- Detects search/query state used directly in React Query `queryKey` without debounce/deferred handling.

2. `query.refetch-in-effect` (`P2`)
- Detects manual `refetch()` calls inside `useEffect`.
- Usually this can be replaced by stable query keys and `enabled`.

3. `render.unstable-key` (`P2`)
- Detects `key={index|i|idx}` patterns.
- Prefer stable entity IDs for list keys.

## Notes

- This is intentionally conservative and complements runtime profiling.
- Use React Profiler and Playwright runs for runtime validation on heavy routes (Tasks, Gantt, RBAC Policy).
