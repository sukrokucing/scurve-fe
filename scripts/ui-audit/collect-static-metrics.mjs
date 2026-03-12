import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditConfig } from "./config.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..", "..");
const srcRoot = path.join(projectRoot, "src");
const artifactsDir = path.join(projectRoot, "artifacts", "ui-audit");
const outputPath = path.join(artifactsDir, "findings.static.json");
const auditRunId = process.env.UI_AUDIT_RUN_ID ?? `static-${Date.now()}`;

const SMALL_SIZE_PATTERN = /\b(?:h|w)-(?:5|6|7|8)\b/g;
const DIRECT_COLOR_PATTERN = /\b(?:bg|text|border)-(?:teal|red|green|blue|yellow|purple|pink|orange|indigo)-\d{2,3}\b/g;
const TRUNCATE_PATTERN = /\b(?:truncate|line-clamp-\d+)\b/;
const ARBITRARY_SPACING_PATTERN = /\b(?:-?m(?:[trblxy])?|-?p(?:[trblxy])?|gap(?:-[xy])?|space-[xy])-\[[^\]]+\]/g;
const TIGHT_INTERACTIVE_PADDING_PATTERN = /\b(?:p|px|py)-(?:0|0\.5|1|1\.5)\b/g;
const INLINE_SPACING_STYLE_PATTERN = /style=\{\{[\s\S]*?\b(?:margin(?:Top|Right|Bottom|Left)?|padding(?:Top|Right|Bottom|Left)?)\s*:\s*([^,}]+)[\s\S]*?\}\}/g;
const NATIVE_CONFIRM_PATTERN = /\b(?:window\.)?confirm\s*\(/;
const DESKTOP_ONLY_COPY_PATTERN = /best viewed on desktop/i;
const HARDCODED_THEME_HEX_PATTERN = /theme_color[^#\n]*#[0-9a-f]{3,8}/i;

function toPosixPath(filePath) {
    return filePath.split(path.sep).join("/");
}

async function walkFiles(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const nested = await Promise.all(entries.map(async (entry) => {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            return walkFiles(fullPath);
        }
        return fullPath;
    }));
    return nested.flat();
}

function createFinding({
    id,
    ruleId,
    severity,
    file,
    line,
    message,
    snippet,
}) {
    return {
        id,
        source: "static",
        ruleId,
        severity,
        route: null,
        theme: null,
        viewport: null,
        file,
        line,
        message,
        evidence: {
            snippet: snippet.trim(),
        },
    };
}

function getLineNumberFromIndex(raw, index) {
    return raw.slice(0, index).split(/\r?\n/).length;
}

function isZeroLikeValue(rawValue) {
    const cleaned = rawValue
        .replace(/[`'"]/g, "")
        .replace(/\s+/g, "")
        .toLowerCase();
    return cleaned === "0" || cleaned === "0px" || cleaned === "0rem" || cleaned === "0em" || cleaned === "0%";
}

function isLikelyInteractiveLine(lineText) {
    return /<(button|a|input|select|textarea)/.test(lineText)
        || /(?:onClick=|role="button"|tabIndex=)/.test(lineText);
}

async function collect() {
    const allFiles = await walkFiles(srcRoot);
    const tsxFiles = allFiles.filter((file) => file.endsWith(".tsx"));
    const findings = [];
    let findingCounter = 1;

    for (const filePath of tsxFiles) {
        const raw = await fs.readFile(filePath, "utf8");
        const lines = raw.split(/\r?\n/);
        const relPath = toPosixPath(path.relative(projectRoot, filePath));

        for (let index = 0; index < lines.length; index += 1) {
            const line = lines[index];
            const lineNumber = index + 1;

            const localContext = `${lines[index - 1] ?? ""}\n${line}\n${lines[index + 1] ?? ""}`;

            if (SMALL_SIZE_PATTERN.test(line) && isLikelyInteractiveLine(localContext)) {
                findings.push(createFinding({
                    id: `STATIC-${String(findingCounter).padStart(4, "0")}`,
                    ruleId: "a11y.target-size",
                    severity: "P1",
                    file: relPath,
                    line: lineNumber,
                    message: "Potentially undersized interactive target (h/w 5-8 classes).",
                    snippet: line,
                }));
                findingCounter += 1;
            }
            SMALL_SIZE_PATTERN.lastIndex = 0;

            if (DIRECT_COLOR_PATTERN.test(line)) {
                findings.push(createFinding({
                    id: `STATIC-${String(findingCounter).padStart(4, "0")}`,
                    ruleId: "good-ui.visual-consistency",
                    severity: "P2",
                    file: relPath,
                    line: lineNumber,
                    message: "Direct palette utility class found; prefer semantic token-based classes.",
                    snippet: line,
                }));
                findingCounter += 1;
            }
            DIRECT_COLOR_PATTERN.lastIndex = 0;

            if (ARBITRARY_SPACING_PATTERN.test(line)) {
                findings.push(createFinding({
                    id: `STATIC-${String(findingCounter).padStart(4, "0")}`,
                    ruleId: "spacing.scale-consistency",
                    severity: "P2",
                    file: relPath,
                    line: lineNumber,
                    message: "Arbitrary spacing utility detected; prefer spacing scale tokens for padding/margin/gap.",
                    snippet: line,
                }));
                findingCounter += 1;
            }
            ARBITRARY_SPACING_PATTERN.lastIndex = 0;

            if (TIGHT_INTERACTIVE_PADDING_PATTERN.test(line) && isLikelyInteractiveLine(localContext)) {
                findings.push(createFinding({
                    id: `STATIC-${String(findingCounter).padStart(4, "0")}`,
                    ruleId: "spacing.scale-consistency",
                    severity: "P2",
                    file: relPath,
                    line: lineNumber,
                    message: "Very tight interactive padding detected; verify tap comfort and spacing rhythm.",
                    snippet: line,
                }));
                findingCounter += 1;
            }
            TIGHT_INTERACTIVE_PADDING_PATTERN.lastIndex = 0;

            if (line.includes("text-center") && !line.includes("justify-center") && (line.includes("<p") || line.includes("CardDescription"))) {
                findings.push(createFinding({
                    id: `STATIC-${String(findingCounter).padStart(4, "0")}`,
                    ruleId: "good-ui.readability",
                    severity: "P2",
                    file: relPath,
                    line: lineNumber,
                    message: "Centered text in content copy may reduce scan speed for multi-line content.",
                    snippet: line,
                }));
                findingCounter += 1;
            }

            if (NATIVE_CONFIRM_PATTERN.test(line)) {
                findings.push(createFinding({
                    id: `STATIC-${String(findingCounter).padStart(4, "0")}`,
                    ruleId: "flow.confirmation-consistency",
                    severity: "P1",
                    file: relPath,
                    line: lineNumber,
                    message: "Native confirm() detected; use app dialog patterns for consistent UX and accessibility.",
                    snippet: line,
                }));
                findingCounter += 1;
            }

            if (DESKTOP_ONLY_COPY_PATTERN.test(line)) {
                findings.push(createFinding({
                    id: `STATIC-${String(findingCounter).padStart(4, "0")}`,
                    ruleId: "layout.mobile-primary-content-overflow",
                    severity: "P1",
                    file: relPath,
                    line: lineNumber,
                    message: "Desktop-only warning copy detected; provide a mobile-first workflow instead of warning-only fallback.",
                    snippet: line,
                }));
                findingCounter += 1;
            }

            if (HARDCODED_THEME_HEX_PATTERN.test(line) && !line.includes("example")) {
                findings.push(createFinding({
                    id: `STATIC-${String(findingCounter).padStart(4, "0")}`,
                    ruleId: "good-ui.visual-consistency",
                    severity: "P2",
                    file: relPath,
                    line: lineNumber,
                    message: "Hardcoded theme color fallback detected; prefer semantic tokens or centralized defaults.",
                    snippet: line,
                }));
                findingCounter += 1;
            }

            const truncationContext = lines
                .slice(Math.max(0, index - 2), Math.min(lines.length, index + 3))
                .join("\n");
            const isUtilitySelectorOnly = /\[\&[^\]]+\]:(?:truncate|line-clamp-\d+)/.test(line);
            const hasFallbackInContext = /(?:title=|aria-label=|TooltipTrigger|TooltipContent)/.test(truncationContext);
            const hasMarkupInContext = /<[\w/]/.test(truncationContext);

            if (TRUNCATE_PATTERN.test(line) && hasMarkupInContext && !isUtilitySelectorOnly && !hasFallbackInContext) {
                findings.push(createFinding({
                    id: `STATIC-${String(findingCounter).padStart(4, "0")}`,
                    ruleId: "content.intentional-truncation",
                    severity: "P2",
                    file: relPath,
                    line: lineNumber,
                    message: "Truncation class detected without nearby fallback label/tooltip.",
                    snippet: line,
                }));
                findingCounter += 1;
            }
        }

        const inlineSpacingMatches = Array.from(raw.matchAll(INLINE_SPACING_STYLE_PATTERN));
        inlineSpacingMatches.forEach((match) => {
            const snippet = match[0];
            if (!snippet) return;
            const valueToken = match[1] ?? "";
            if (isZeroLikeValue(valueToken)) {
                return;
            }

            const lineNumber = getLineNumberFromIndex(raw, match.index ?? 0);
            findings.push(createFinding({
                id: `STATIC-${String(findingCounter).padStart(4, "0")}`,
                ruleId: "spacing.inline-style-drift",
                severity: "P2",
                file: relPath,
                line: lineNumber,
                message: "Inline margin/padding style found; prefer spacing tokens in class names when possible.",
                snippet,
            }));
            findingCounter += 1;
        });
    }

    await fs.mkdir(artifactsDir, { recursive: true });

    const payload = {
        generatedAt: new Date().toISOString(),
        runId: auditRunId,
        source: "static",
        thresholds: auditConfig.thresholds,
        scannedFiles: tsxFiles.length,
        findings,
        counts: {
            total: findings.length,
            bySeverity: findings.reduce((acc, finding) => {
                const key = finding.severity;
                acc[key] = (acc[key] ?? 0) + 1;
                return acc;
            }, {}),
        },
    };

    await fs.writeFile(outputPath, JSON.stringify(payload, null, 2));
    console.log(`[ui-audit] static findings written: ${outputPath}`);
    console.log(`[ui-audit] static findings count: ${findings.length}`);
}

collect().catch((error) => {
    console.error("[ui-audit] static scan failed");
    console.error(error);
    process.exitCode = 1;
});
