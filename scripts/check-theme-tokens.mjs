import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
    contrastRatio,
    hslTripletToRgb,
} from "./theme/color-utils.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
const INDEX_CSS_PATH = path.join(REPO_ROOT, "src", "index.css");

const MARKER_START = "/* THEME TOKENS: START (generated) */";
const MARKER_END = "/* THEME TOKENS: END (generated) */";

const REQUIRED_TOKENS = [
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

const HSL_TRIPLET_PATTERN = /^-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?%\s+-?\d+(?:\.\d+)?%$/;

const CONTRAST_RULES = [
    ["--foreground", "--background", 4.5],
    ["--primary-foreground", "--primary", 4.5],
    ["--primary-foreground", "--primary-hover", 4.5],
    ["--primary-foreground", "--primary-active", 4.5],
    ["--secondary-foreground", "--secondary", 4.5],
    ["--secondary-foreground", "--secondary-hover", 4.5],
    ["--secondary-foreground", "--secondary-active", 4.5],
    ["--foreground", "--surface", 4.5],
    ["--foreground", "--surface-hover", 4.5],
    ["--foreground", "--surface-active", 4.5],
    ["--accent-foreground", "--accent-hover", 4.5],
    ["--accent-foreground", "--accent-active", 4.5],
    ["--destructive-foreground", "--destructive", 4.5],
    ["--focus-strong", "--background", 3.0],
];

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractGeneratedSection(indexCss) {
    const pattern = new RegExp(
        `${escapeRegex(MARKER_START)}([\\s\\S]*?)${escapeRegex(MARKER_END)}`,
        "m"
    );
    const match = indexCss.match(pattern);
    if (!match) {
        throw new Error("Generated token markers not found in src/index.css.");
    }
    return match[1];
}

function parseThemeBlocks(section) {
    const selectorPattern = /(:root|\.dark|\.theme-glass)\s*\{([\s\S]*?)\}/g;
    const themes = new Map();
    let selectorMatch = selectorPattern.exec(section);

    while (selectorMatch) {
        const selector = selectorMatch[1];
        const body = selectorMatch[2];
        const tokenPattern = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi;
        const tokens = new Map();

        let tokenMatch = tokenPattern.exec(body);
        while (tokenMatch) {
            tokens.set(tokenMatch[1], tokenMatch[2].trim());
            tokenMatch = tokenPattern.exec(body);
        }

        themes.set(selector, tokens);
        selectorMatch = selectorPattern.exec(section);
    }

    return themes;
}

function validateRequiredTokens(themes) {
    const errors = [];

    for (const selector of [":root", ".dark", ".theme-glass"]) {
        const tokens = themes.get(selector);
        if (!tokens) {
            errors.push(`Missing selector block: ${selector}`);
            continue;
        }

        for (const token of REQUIRED_TOKENS) {
            if (!tokens.has(token)) {
                errors.push(`${selector} missing token ${token}`);
            }
        }
    }

    return errors;
}

function validateTokenFormats(themes) {
    const errors = [];

    for (const [selector, tokens] of themes) {
        for (const token of REQUIRED_TOKENS) {
            const value = tokens.get(token);
            if (!value) continue;
            if (!HSL_TRIPLET_PATTERN.test(value)) {
                errors.push(`${selector} token ${token} has invalid format: "${value}"`);
            }
        }
    }

    return errors;
}

function validateContrast(themes) {
    const errors = [];

    for (const [selector, tokens] of themes) {
        for (const [foregroundToken, backgroundToken, minRatio] of CONTRAST_RULES) {
            const foreground = tokens.get(foregroundToken);
            const background = tokens.get(backgroundToken);
            if (!foreground || !background) continue;

            try {
                const ratio = contrastRatio(
                    hslTripletToRgb(foreground),
                    hslTripletToRgb(background)
                );
                if (ratio < minRatio) {
                    errors.push(
                        `${selector} contrast ${foregroundToken} on ${backgroundToken} is ${ratio.toFixed(
                            2
                        )} (required >= ${minRatio})`
                    );
                }
            } catch (error) {
                errors.push(
                    `${selector} contrast check failed for ${foregroundToken}/${backgroundToken}: ${error.message}`
                );
            }
        }
    }

    return errors;
}

function main() {
    const css = fs.readFileSync(INDEX_CSS_PATH, "utf8");
    const generatedSection = extractGeneratedSection(css);
    const themes = parseThemeBlocks(generatedSection);

    const errors = [
        ...validateRequiredTokens(themes),
        ...validateTokenFormats(themes),
        ...validateContrast(themes),
    ];

    if (errors.length > 0) {
        console.error("Theme token checks failed:");
        for (const error of errors) {
            console.error(`- ${error}`);
        }
        process.exit(1);
    }

    console.log("Theme token checks passed.");
}

main();
