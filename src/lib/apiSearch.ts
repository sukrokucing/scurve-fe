export const API_SEARCH_QUERY_MAX_LENGTH = 128;

export function normalizeApiFilterValue(value?: string | null): string | undefined {
    const trimmed = value?.trim();
    return trimmed || undefined;
}

export function normalizeApiSearchQuery(query?: string | null): string | undefined {
    const trimmed = normalizeApiFilterValue(query);
    if (!trimmed) {
        return undefined;
    }

    return trimmed.slice(0, API_SEARCH_QUERY_MAX_LENGTH);
}

export function normalizePositiveIntegerParam(
    value: number | undefined,
    options?: { min?: number; max?: number; fallback?: number },
): number | undefined {
    if (value === undefined) {
        return options?.fallback;
    }

    if (!Number.isFinite(value)) {
        return options?.fallback;
    }

    const min = options?.min ?? 1;
    const max = options?.max ?? Number.POSITIVE_INFINITY;
    return Math.min(max, Math.max(min, Math.trunc(value)));
}

export function normalizeDateOnlyToApiDateTime(
    value?: string | null,
    boundary: "start" | "end" = "start",
): string | undefined {
    const normalizedValue = normalizeApiFilterValue(value);
    if (!normalizedValue) {
        return undefined;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
        return boundary === "start"
            ? `${normalizedValue}T00:00:00.000Z`
            : `${normalizedValue}T23:59:59.999Z`;
    }

    const parsed = new Date(normalizedValue);
    if (Number.isNaN(parsed.getTime())) {
        return undefined;
    }

    return parsed.toISOString();
}
