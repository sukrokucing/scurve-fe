const HEX_THEME_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const DEFAULT_PROJECT_THEME_COLOR = "#0EA5A4";

export function isValidProjectThemeColor(value: string) {
    return HEX_THEME_COLOR_PATTERN.test(value.trim());
}

export function resolveProjectThemeColor(value: string | null | undefined) {
    const normalized = value?.trim() ?? "";
    return isValidProjectThemeColor(normalized) ? normalized : DEFAULT_PROJECT_THEME_COLOR;
}
