import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..", "..");
const srcRoot = path.join(projectRoot, "src");
const artifactsDir = path.join(projectRoot, "artifacts", "perf-audit");
const outputPath = path.join(artifactsDir, "findings.json");

const isStrict = process.argv.includes("--gate");

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

function getLineNumber(raw, index) {
    return raw.slice(0, index).split(/\r?\n/).length;
}

function createFinding({
    id,
    file,
    line,
    ruleId,
    severity,
    message,
    snippet,
}) {
    return {
        id,
        file,
        line,
        ruleId,
        severity,
        message,
        snippet: snippet.trim(),
    };
}

function findSearchStateVariables(raw) {
    const stateRegex = /const\s*\[\s*([A-Za-z_$][\w$]*)\s*,\s*set[A-Za-z_$][\w$]*\s*]\s*=\s*useState\s*\(\s*["'`]?\s*["'`]?\s*\)/g;
    const names = [];
    for (const match of raw.matchAll(stateRegex)) {
        const stateName = match[1];
        if (!stateName) continue;
        if (!/(search|query)/i.test(stateName)) continue;
        names.push(stateName);
    }
    return names;
}

function hasDebounceSignal(raw, stateName) {
    const specific = new RegExp(`${stateName}\\w*\\s*=\\s*useDebouncedValue\\(`);
    return specific.test(raw) || /useDebouncedValue\(/.test(raw) || /searchDebounceMs\s*=/.test(raw);
}

function detectDebounceFindings(raw, relPath, startId) {
    const findings = [];
    let idCounter = startId;
    const searchStates = findSearchStateVariables(raw);

    for (const stateName of searchStates) {
        const queryKeyRegex = new RegExp(`queryKey\\s*:\\s*\\[[^\\]]*\\b${stateName}\\b`);
        const match = queryKeyRegex.exec(raw);
        if (!match) continue;
        if (hasDebounceSignal(raw, stateName)) continue;

        findings.push(createFinding({
            id: `PERF-${String(idCounter).padStart(4, "0")}`,
            file: relPath,
            line: getLineNumber(raw, match.index),
            ruleId: "query.search-debounce",
            severity: "P1",
            message: `Search state "${stateName}" is used directly in queryKey without a debounce/deferred layer.`,
            snippet: match[0],
        }));
        idCounter += 1;
    }

    return { findings, nextId: idCounter };
}

function detectRefetchInEffect(raw, relPath, startId) {
    const findings = [];
    let idCounter = startId;
    const effectRegex = /useEffect\s*\(\s*\(\)\s*=>\s*\{[\s\S]{0,800}?\brefetch[A-Za-z_$]*\s*\(\s*\)[\s\S]{0,800}?\}\s*,\s*\[[^\]]*]\s*\)/g;

    for (const match of raw.matchAll(effectRegex)) {
        const text = match[0];
        if (!text) continue;
        findings.push(createFinding({
            id: `PERF-${String(idCounter).padStart(4, "0")}`,
            file: relPath,
            line: getLineNumber(raw, match.index ?? 0),
            ruleId: "query.refetch-in-effect",
            severity: "P2",
            message: "Manual refetch inside useEffect detected; verify if query key/enabled can replace imperative refetch.",
            snippet: text.slice(0, 220),
        }));
        idCounter += 1;
    }

    return { findings, nextId: idCounter };
}

function detectUnstableListKey(raw, relPath, startId) {
    const findings = [];
    let idCounter = startId;
    const keyRegex = /key=\{\s*(?:index|idx|i)\s*}/g;

    for (const match of raw.matchAll(keyRegex)) {
        findings.push(createFinding({
            id: `PERF-${String(idCounter).padStart(4, "0")}`,
            file: relPath,
            line: getLineNumber(raw, match.index ?? 0),
            ruleId: "render.unstable-key",
            severity: "P2",
            message: "Index-based React key detected; prefer stable entity id keys to avoid unnecessary remounts.",
            snippet: match[0],
        }));
        idCounter += 1;
    }

    return { findings, nextId: idCounter };
}

async function main() {
    const allFiles = await walkFiles(srcRoot);
    const candidateFiles = allFiles.filter((filePath) => /\.(?:tsx|ts)$/.test(filePath));
    const findings = [];
    let idCounter = 1;

    for (const filePath of candidateFiles) {
        const raw = await fs.readFile(filePath, "utf8");
        const relPath = toPosixPath(path.relative(projectRoot, filePath));

        const debounceResult = detectDebounceFindings(raw, relPath, idCounter);
        findings.push(...debounceResult.findings);
        idCounter = debounceResult.nextId;

        const refetchResult = detectRefetchInEffect(raw, relPath, idCounter);
        findings.push(...refetchResult.findings);
        idCounter = refetchResult.nextId;

        const keyResult = detectUnstableListKey(raw, relPath, idCounter);
        findings.push(...keyResult.findings);
        idCounter = keyResult.nextId;
    }

    const counts = findings.reduce((acc, finding) => {
        acc[finding.severity] = (acc[finding.severity] ?? 0) + 1;
        return acc;
    }, {});

    await fs.mkdir(artifactsDir, { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify({
        generatedAt: new Date().toISOString(),
        strictMode: isStrict,
        scannedFiles: candidateFiles.length,
        findings,
        counts: {
            total: findings.length,
            bySeverity: counts,
        },
    }, null, 2));

    console.log(`[perf-audit] scanned files: ${candidateFiles.length}`);
    console.log(`[perf-audit] findings: ${findings.length}`);
    console.log(`[perf-audit] output: ${toPosixPath(path.relative(projectRoot, outputPath))}`);

    if (!isStrict) return;

    const hasBlocking = findings.some((finding) => finding.severity === "P1");
    if (hasBlocking) {
        console.error("[perf-audit] strict mode failed: found P1 performance issues.");
        process.exitCode = 1;
    }
}

main().catch((error) => {
    console.error("[perf-audit] failed");
    console.error(error);
    process.exitCode = 1;
});
