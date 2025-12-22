# Performance Audit & Improvement Plan (Surgical Adoption)

> Goal: Achieve **measurable, real-user performance gains** by adopting *DOM-first / old-ways* concepts **surgically**, without destabilizing a complex React 19 application.

This plan assumes:

* React 19 + Vite
* TanStack Query/Table/Virtual
* Zustand
* DnD, Gantt, Charts, Animations

No ideology. Only wins that survive production reality.

---

## Phase 0 — Rules of Engagement (Non-Negotiable)

Before touching code, lock these rules:

* ❌ No replacing global app state with DOM queries
* ❌ No selector-driven business logic
* ❌ No coupling permissions, routing, or async flows to DOM

Allowed:

* DOM as **ephemeral UI state**
* DOM for **measurement and interaction**
* JS state only when it must persist or synchronize

If a change cannot be measured → it does not ship.

---

## Phase 1 — Establish Baseline (Stop Guessing)

### 1.1 Instrument the App

**Tools**:

* Chrome Performance Panel
* React DevTools Profiler
* Web Vitals (INP, LCP, CLS)

**Scenarios to record**:

* Initial load (cold cache)
* Route transitions
* Drag & drop interaction
* Gantt scrolling
* Large table sorting/filtering

**Deliverables**:

* Flamegraph screenshots
* Re-render counts per interaction
* JS execution time during interaction

> Output: `performance-baseline.md`

---

## Phase 2 — Identify JS That Should Be DOM or CSS

### 2.1 Eliminate State for Visual-Only UI

Audit for `useState` used exclusively for:

* Hover
* Focus
* Open/close animation
* Selection highlight

**Replace with**:

* CSS pseudo-classes
* `data-*` attributes
* Radix UI internal state

**Rule**:
If state does not affect data or network → it should not be React state.

---

### 2.2 Convert Transient UI State to DOM-First

Targets:

* Drag position
* Resize handles
* Scroll-linked indicators

**Implementation pattern**:

* DOM handles pointer events
* CSS `transform: translate3d(...)`
* JS commits final value *after interaction ends*

This mirrors the "DOM is state" idea **only during interaction windows**.

---

## Phase 3 — High-Impact Interaction Optimization

### 3.1 DnD Performance Surgery

Current risk:

* React re-render on every pointer move

**Action**:

* Ensure drag movement does NOT trigger React state updates
* Use refs + direct style mutation during drag
* Commit result once on `dragEnd`

**Success metric**:

* JS thread idle during drag
* No React commits per frame

---

### 3.2 Gantt & Chart Isolation

Charts and gantt libraries are **JS-heavy**.

Actions:

* Lazy-load per route
* Memoize inputs aggressively
* Wrap with `React.memo`
* Freeze props objects

Optional:

* Move purely visual updates to DOM transforms

---

## Phase 4 — List, Table, and Data Discipline

### 4.1 Virtualize Everything Scrollable

Rules:

* No list > 50 rows without virtualization
* No table column recalculation on scroll

Already using TanStack Virtual — verify:

* Stable row keys
* No inline functions in cell renderers

---

### 4.2 Zustand Containment

Audit Zustand stores:

* Split stores by concern
* Avoid large object mutations
* No selector returning new objects

If a component subscribes to more than it needs → refactor.

---

## Phase 5 — Forms: Lean Hard Into DOM State

You already use `react-hook-form`. Go further.

Actions:

* Prefer uncontrolled inputs everywhere
* Avoid watching fields unless required
* Read values only on submit or validation

This aligns with DOM-first principles **safely**.

---

## Phase 6 — Network & Async Reality Check

### 6.1 TanStack Query Audit

Checklist:

* Proper `staleTime`
* No refetch-on-focus unless justified
* Stable query keys
* Avoid dependent waterfalls

Most perceived slowness comes from refetch storms.

---

## Phase 7 — JS Payload Reduction

### 7.1 Route-Level Code Splitting

Split:

* Charts
* Gantt
* DnD-heavy views

Rule:
If the user cannot see it immediately, it must not load immediately.

---

## Phase 8 — DOM Reads (Allowed, but Controlled)

Use DOM reads ONLY for:

* Measurements (size, position)
* Visibility
* Intersection

Never for:

* App state
* Permissions
* Derived business logic

Wrap reads:

* `requestAnimationFrame`
* `ResizeObserver`
* `IntersectionObserver`

---

## Phase 9 — Verification & Regression Guard

### 9.1 Re-Measure Everything

Repeat Phase 1 scenarios.

Required improvements:

* Lower interaction JS time
* Fewer React commits
* Improved INP

If metrics do not improve → revert.

---

## Phase 10 — Cultural Guardrails (Prevent Regression)

Add rules:

* No new state without justification
* No per-frame React updates
* DOM-first for interaction, React for logic

Document this philosophy in `CONTRIBUTING.md`.

---

## Final Reality Check

This plan:

* Borrows the **useful parts** of DOM-first thinking
* Rejects ideology
* Optimizes where it actually matters
* Do a dependency-level risk audit (which libs hurt you most)
* Design a DOM-first interaction layer for DnD/Gantt specifically
* Identify which React states to kill first for maximum gain
* Define hard performance budgets (JS time, commits, payload)

If you follow this, your app will be faster than 90% of React apps — without becoming unmaintainable.

If you skip measurement and jump to clever tricks, you’ll waste time and learn nothing.
