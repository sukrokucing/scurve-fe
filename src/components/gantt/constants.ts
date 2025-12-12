// Gantt Chart Constants

export const ROW_HEIGHT = 50;
export const HEADER_HEIGHT = 80;

// Column widths per view mode
export const COLUMN_WIDTH = {
    day: 100,
    week: 200,
    month: 300,
} as const;

// Virtualization settings
export const OVERSCAN_ROWS = 5;
export const OVERSCAN_COLUMNS = 3;

// Task bar styling
export const TASK_BAR_HEIGHT = 32;
export const TASK_BAR_MARGIN = (ROW_HEIGHT - TASK_BAR_HEIGHT) / 2;
export const TASK_BAR_RADIUS = 6;

// Milestone styling
export const MILESTONE_SIZE = 20;

// Scroll behavior
export const SCROLL_DEBOUNCE_MS = 16; // ~60fps

// Default visible range (days before/after today)
export const DEFAULT_RANGE_BEFORE = 7;
export const DEFAULT_RANGE_AFTER = 30;
