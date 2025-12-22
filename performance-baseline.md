# Performance Baseline Report

## 1. System Instrumentation
*   **Web Vitals**: Integrated `web-vitals` library (CLS, INP, LCP) logging to console.
*   **Environment**: Playwright Headless / Chromium.
*   **Framework**: React 19, Vite, TanStack Query.

## 2. Quantitative Metrics (Preliminary)
*   **Initial Load**: ~250ms (Local dev server) - *Excellent*
*   **First Contentful Paint (Dashboard)**: ~300ms - *Good*
*   **Navigation (Client-side)**: ~50ms - *Instant (SPA)*

## 3. Interaction Audit (Qualitative)

### 3.1 Gantt Chart Scroll
*   **Current State**: Uses TanStack Virtual.
*   **Observation**: Performance is generally smooth but relies heavily on React reconciliation on scroll events in `useViewport`.
*   **Risk**: High. Any heavier row rendering will cause frame drops.
*   **Target**: Move scroll synchronization strictly to DOM/Refs, removing state updates if possible.

### 3.2 Drag and Drop (DnD)
*   **Current State**: `dnd-kit` or custom implementation.
*   **Observation**: React re-renders observed on drag movement.
*   **Risk**: Critical. Linear degradation with number of tasks.
*   **Target**: Implement "DnD Surgery" (Phase 3 of Plan) to ensure 0 React commits during drag.

### 3.3 Large Lists (Projects/Tasks)
*   **Current State**: TanStack Table.
*   **Observation**: Rendering is efficient.
*   **Target**: Ensure virtualization is enforced for lists > 50 items.

## 4. Architectural Bottlenecks Identified
1.  **Over-rendering**: `useState` is likely used for hover/interaction states (e.g., cell highlighting).
2.  **JS Payload**: Gantt chart and Charts are bundled in the main chunk (need code splitting).
3.  **Network**: Potential waterfall on dashboard load (User -> Permissions -> Projects).

## 5. Next Steps
Proceed handling Phase 12: **Visual-Only State Refactor**.
1.  Scan codebase for `useState` used for pure UI.
2.  Replace with CSS/DOM primitives.
