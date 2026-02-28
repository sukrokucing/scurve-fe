import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
    clamp,
    contrastRatio,
    oklchToHslTriplet,
    oklchToSrgb,
    shiftLightness,
    wrapHue,
} from "./theme/color-utils.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const CONFIG_PATH = path.join(REPO_ROOT, "scripts", "theme", "harmony.config.json");
const INDEX_CSS_PATH = path.join(REPO_ROOT, "src", "index.css");

const MARKER_START = "/* THEME TOKENS: START (generated) */";
const MARKER_END = "/* THEME TOKENS: END (generated) */";

const THEME_ORDER = [":root", ".dark", ".theme-glass"];

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function mergeRole(baseDefaults, theme, key) {
    return {
        ...baseDefaults[key],
        ...theme[key],
    };
}

function getInteractionDeltas(deltas, isDark) {
    return {
        hover: isDark ? Math.abs(deltas.hover) : deltas.hover,
        active: isDark ? Math.abs(deltas.active) : deltas.active,
    };
}

function pickForeground(background, neutralHue) {
    const darkCandidate = { l: 0.2, c: 0.02, h: neutralHue };
    const lightCandidate = { l: 0.97, c: 0.01, h: neutralHue };

    const bgRgb = oklchToSrgb(background);
    const darkRatio = contrastRatio(oklchToSrgb(darkCandidate), bgRgb);
    const lightRatio = contrastRatio(oklchToSrgb(lightCandidate), bgRgb);

    return darkRatio >= lightRatio ? darkCandidate : lightCandidate;
}

function deriveThemeTokens(selector, config) {
    const defaults = config.defaults;
    const theme = config.themes[selector];
    if (!theme) {
        throw new Error(`Missing theme config for selector "${selector}"`);
    }

    const neutralHue = theme.background?.h ?? defaults.neutralHue;
    const isDark = theme.background.l < theme.foreground.l;

    const primary = theme.primary;
    const background = theme.background;
    const surface = theme.surface;
    const muted = theme.muted;
    const foreground = theme.foreground;
    const border = theme.border;
    const accentSeed = mergeRole(defaults, theme, "accent");
    const statusSeed = mergeRole(defaults, theme, "status");
    const chartSeed = mergeRole(defaults, theme, "chart");

    const primaryDeltas = getInteractionDeltas(defaults.stateDeltas, isDark);
    const secondaryDeltas = getInteractionDeltas(defaults.secondaryStateDeltas, isDark);
    const accentDeltas = getInteractionDeltas(defaults.accentStateDeltas, isDark);
    const surfaceDeltas = getInteractionDeltas(defaults.surfaceStateDeltas, isDark);

    const primaryHover = shiftLightness(primary, primaryDeltas.hover);
    const primaryActive = shiftLightness(primary, primaryDeltas.active);
    const primaryDark = shiftLightness(primary, defaults.stateDeltas.active);

    const secondary = muted;
    const secondaryHover = shiftLightness(secondary, secondaryDeltas.hover);
    const secondaryActive = shiftLightness(secondary, secondaryDeltas.active);

    const accent = {
        l: accentSeed.l,
        c: accentSeed.c,
        h: wrapHue(primary.h + 30),
    };
    const accentHover = shiftLightness(accent, accentDeltas.hover);
    const accentActive = shiftLightness(accent, accentDeltas.active);

    const surfaceHover = shiftLightness(surface, surfaceDeltas.hover);
    const surfaceActive = shiftLightness(surface, surfaceDeltas.active);

    const card = { ...surface };
    const popover = shiftLightness(surface, isDark ? 0.02 : 0);

    const mutedForeground = {
        l: isDark
            ? clamp(foreground.l - 0.24, 0.2, 0.92)
            : clamp(foreground.l + 0.28, 0.2, 0.92),
        c: clamp(foreground.c * 0.6, 0.004, 0.03),
        h: neutralHue,
    };

    const destructive = { l: statusSeed.l, c: statusSeed.c, h: wrapHue(primary.h + 180) };
    const error = { ...destructive };
    const warning = {
        l: clamp(statusSeed.l + (isDark ? 0.04 : 0.05), 0.4, 0.9),
        c: clamp(statusSeed.c - 0.03, 0.08, 0.24),
        h: wrapHue(primary.h + 150),
    };
    const info = {
        l: clamp(statusSeed.l + (isDark ? 0.02 : 0.01), 0.38, 0.9),
        c: clamp(statusSeed.c - 0.01, 0.1, 0.24),
        h: wrapHue(primary.h + 120),
    };
    const success = {
        l: clamp(statusSeed.l + (isDark ? 0.01 : 0), 0.35, 0.85),
        c: clamp(statusSeed.c - 0.02, 0.08, 0.24),
        h: wrapHue(primary.h - 30),
    };

    const ring = { ...primary };
    const focusStrong = {
        l: clamp(primary.l + (isDark ? 0.12 : -0.12), 0.2, 0.85),
        c: clamp(primary.c + 0.03, 0.05, 0.3),
        h: primary.h,
    };

    const chartOffsets = [
        { l: 0.03, c: 0.02 },
        { l: 0.0, c: 0.01 },
        { l: -0.07, c: -0.03 },
        { l: 0.08, c: 0.02 },
        { l: 0.02, c: 0.0 },
    ];

    const charts = chartOffsets.map((offset, index) => ({
        l: clamp(chartSeed.l + offset.l, 0.3, 0.92),
        c: clamp(chartSeed.c + offset.c, 0.06, 0.28),
        h: wrapHue(primary.h + index * 72),
    }));

    const tokenColors = new Map([
        ["--background", background],
        ["--foreground", foreground],
        ["--primary", primary],
        ["--primary-dark", primaryDark],
        ["--primary-hover", primaryHover],
        ["--primary-active", primaryActive],
        ["--secondary", secondary],
        ["--secondary-hover", secondaryHover],
        ["--secondary-active", secondaryActive],
        ["--accent", accent],
        ["--accent-hover", accentHover],
        ["--accent-active", accentActive],
        ["--surface", surface],
        ["--surface-hover", surfaceHover],
        ["--surface-active", surfaceActive],
        ["--card", card],
        ["--popover", popover],
        ["--destructive", destructive],
        ["--muted", muted],
        ["--muted-foreground", mutedForeground],
        ["--border", border],
        ["--input", border],
        ["--ring", ring],
        ["--focus-strong", focusStrong],
        ["--success", success],
        ["--warning", warning],
        ["--info", info],
        ["--error", error],
        ["--chart-1", charts[0]],
        ["--chart-2", charts[1]],
        ["--chart-3", charts[2]],
        ["--chart-4", charts[3]],
        ["--chart-5", charts[4]],
    ]);

    const foregroundTokens = new Map([
        ["--primary-foreground", pickForeground(primary, neutralHue)],
        ["--secondary-foreground", pickForeground(secondary, neutralHue)],
        ["--accent-foreground", pickForeground(accent, neutralHue)],
        ["--card-foreground", pickForeground(card, neutralHue)],
        ["--popover-foreground", pickForeground(popover, neutralHue)],
        ["--destructive-foreground", pickForeground(destructive, neutralHue)],
        ["--success-foreground", pickForeground(success, neutralHue)],
        ["--warning-foreground", pickForeground(warning, neutralHue)],
        ["--info-foreground", pickForeground(info, neutralHue)],
        ["--error-foreground", pickForeground(error, neutralHue)],
    ]);

    const tokenOrder = [
        "--background",
        "--foreground",
        "--primary",
        "--primary-foreground",
        "--primary-dark",
        "--primary-hover",
        "--primary-active",
        "--secondary",
        "--secondary-foreground",
        "--secondary-hover",
        "--secondary-active",
        "--accent",
        "--accent-foreground",
        "--accent-hover",
        "--accent-active",
        "--surface",
        "--surface-hover",
        "--surface-active",
        "--card",
        "--card-foreground",
        "--popover",
        "--popover-foreground",
        "--destructive",
        "--destructive-foreground",
        "--muted",
        "--muted-foreground",
        "--border",
        "--input",
        "--ring",
        "--focus-strong",
        "--success",
        "--success-foreground",
        "--warning",
        "--warning-foreground",
        "--info",
        "--info-foreground",
        "--error",
        "--error-foreground",
        "--chart-1",
        "--chart-2",
        "--chart-3",
        "--chart-4",
        "--chart-5",
    ];

    return tokenOrder.map((token) => {
        const color = tokenColors.get(token) ?? foregroundTokens.get(token);
        if (!color) {
            throw new Error(`Token ${token} is missing generated color value.`);
        }
        return [token, oklchToHslTriplet(color)];
    });
}

function buildGeneratedSection(config) {
    const lines = [`    ${MARKER_START}`];

    for (const selector of THEME_ORDER) {
        if (!config.themes[selector]) continue;
        const tokens = deriveThemeTokens(selector, config);
        lines.push(`    ${selector} {`);
        for (const [token, value] of tokens) {
            lines.push(`        ${token}: ${value};`);
        }
        lines.push("    }");
    }

    lines.push(`    ${MARKER_END}`);
    return lines.join("\n");
}

function replaceGeneratedSection(indexCss, generatedSection) {
    const escapedStart = MARKER_START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedEnd = MARKER_END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const sectionPattern = new RegExp(`${escapedStart}[\\s\\S]*?${escapedEnd}`, "m");

    if (!sectionPattern.test(indexCss)) {
        throw new Error(
            `Could not locate generated token marker section in src/index.css.\nExpected markers:\n${MARKER_START}\n${MARKER_END}`
        );
    }

    return indexCss.replace(sectionPattern, generatedSection.trimEnd());
}

function main() {
    const config = readJson(CONFIG_PATH);
    const currentIndexCss = fs.readFileSync(INDEX_CSS_PATH, "utf8");
    const generatedSection = buildGeneratedSection(config);
    const updatedIndexCss = replaceGeneratedSection(currentIndexCss, generatedSection);

    fs.writeFileSync(INDEX_CSS_PATH, updatedIndexCss, "utf8");
    console.log("Theme tokens generated successfully.");
}

main();
