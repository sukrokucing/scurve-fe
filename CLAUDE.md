# S-Curve FE

React 19 + TypeScript 5.9 + Vite 8 + Tailwind v4 + TanStack Query v5 + Zustand v5.

## Commands

- `npm run dev` — dev server on `:3001`
- `npm run check` — lint + typecheck + perf audit (run before PR)
- `npm run build` — production build
- `npm run test:e2e` — all Playwright E2E
- `npm run test:e2e:critical` — smoke + menu + perf probes
- `npm run generate:schemas` — regen API types + Zod from `src/openapi.json`
- `npm run generate:theme` — regen theme tokens
- `npm run audit:ui` — full UI audit (visual + a11y + report)

## Structure

- `src/api/openapiClient.ts` — typed API methods (single source for all calls)
- `src/api/queries/` — TanStack Query hooks per domain
- `src/schemas/` — Zod schemas (manual + generated)
- `src/store/` — Zustand (auth, network, permissions, realtime)
- `src/components/ui/` — shadcn primitives
- `src/components/<domain>/` — gantt, kanban, dashboard, rbac
- `src/pages/` — route pages (thin, assemble only)
- `src/types/api.ts` — generated OpenAPI types

## Rules

- API calls via `openapi.*` only — never raw axios/fetch in components
- Server state in TanStack Query — never duplicate in Zustand
- Zustand only for client-only state (auth, network, permissions, realtime)
- No `useEffect` for server-state sync — use query cache + invalidation
- Query key factories (`projectsKeys`, `tasksKeys`) with `as const`
- Zod schemas in `schemas/`, not components
- shadcn primitives first — install missing: `npx shadcn@latest add <component>`
- Tailwind v4 CSS-first — semantic tokens (`text-muted-foreground`, `bg-card`)
- `AlertDialog` for destructive actions — never `window.confirm`
- Handle `isLoading`/`isError`/empty in every query consumer
- Type all props — no `any`

## Detailed Patterns

See `.codex/skills/scurve-fe/SKILL.md` for full architecture, code examples, review protocol (PERFECT), and reference docs.
