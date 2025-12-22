# Contributing to S-Curve FE

## Performance "Rules of Engagement" (Non-Negotiable)

We are committed to **measurable, real-user performance gains**. We adopt *DOM-first* concepts surgically to avoid React overhead in high-frequency interactions.

### 1. The Golden Rule
**If a change cannot be measured → it does not ship.**
Always verify performance changes with Chrome Performance Panel or React Profiler.

### 2. State & DOM Usage Rules
*   **❌ No replacing global app state with DOM queries.** React owns the source of truth.
*   **❌ No selector-driven business logic.**
*   **❌ No coupling permissions/routing to DOM.**
*   **✅ DOM is for ephemeral UI state.** (e.g., drag positions, hover states).
*   **✅ DOM is for interactions.** (e.g., resize handles, scroll-linked indicators).

### 3. High-Impact Optimizations
*   **Drag & Drop**: Must NOT trigger React re-renders on every pixel move. Use refs + direct style mutation. Commit to React state only on `dragEnd`.
*   **Visual-Only State**: Avoid `useState` for hover/focus/highlight. Use CSS pseudo-classes or `data-*` attributes.
*   **Gantt/Charts**: These are expensive. Lazy load them. Memoize their props.

### 4. Data Discipline
*   **Virtualize**: Any list > 50 rows MUST be virtualized.
*   **Zustand**: Split stores by concern. No selector should return a new object reference.
*   **Forms**: Prefer uncontrolled inputs (`react-hook-form` without watching every field) to align with DOM-first principles.

### 5. Network
*   **React Query**: verify `staleTime` to avoid refetch storms. No refetch-on-focus unless absolutely justified.

---

## Commit Messages
Please follow conventional commits (e.g., `feat:`, `fix:`, `perf:`, `refactor:`).

## Code Style
Run `npm run lint` before pushing.
