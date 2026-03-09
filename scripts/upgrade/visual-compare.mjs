import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    hashFile,
    npmCommand,
    readJson,
    runCommand,
    toPosixPath,
    walkFiles,
    writeJson,
} from "./utils.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..", "..");

const baselineRoot = path.join(projectRoot, "artifacts", "perf-upgrade", "visual-baseline");
const baselineManifestPath = path.join(baselineRoot, "manifest.json");
const screenshotsDir = path.join(projectRoot, "artifacts", "ui-audit", "screenshots");
const scorecardPath = path.join(projectRoot, "artifacts", "ui-audit", "scorecard.json");
const reportPath = path.join(projectRoot, "artifacts", "perf-upgrade", "visual-compare.json");

function shouldSkipCapture(args) {
    if (process.env.VISUAL_COMPARE_SKIP_CAPTURE === "1") return true;
    return args.includes("--skip-capture");
}

function shouldEnforceHashParity(args) {
    if (process.env.VISUAL_COMPARE_ENFORCE_HASH === "1") return true;
    return args.includes("--strict-hash");
}

async function collectManifest(rootDir) {
    const files = await walkFiles(rootDir);
    const pngFiles = files.filter((filePath) => filePath.toLowerCase().endsWith(".png"));
    const manifest = [];
    for (const filePath of pngFiles) {
        const relPath = toPosixPath(path.relative(rootDir, filePath));
        const stats = await fs.stat(filePath);
        const sha256 = await hashFile(filePath);
        manifest.push({
            path: relPath,
            size: stats.size,
            sha256,
        });
    }
    manifest.sort((a, b) => a.path.localeCompare(b.path));
    return manifest;
}

function indexManifest(manifestEntries) {
    const map = new Map();
    for (const entry of manifestEntries) {
        map.set(entry.path, entry);
    }
    return map;
}

async function main() {
    const args = process.argv.slice(2);
    const skipCapture = shouldSkipCapture(args);
    const enforceHashParity = shouldEnforceHashParity(args);

    if (!skipCapture) {
        console.log("[visual:compare] running visual audit capture");
        runCommand(npmCommand, ["run", "audit:ui:mode", "--", "--mode=visual"], { cwd: projectRoot });
    } else {
        console.log("[visual:compare] capture skipped");
    }

    const baselineManifestPayload = await readJson(baselineManifestPath).catch(() => null);
    if (!baselineManifestPayload?.manifest) {
        throw new Error(`Baseline manifest not found. Run: npm run visual:baseline (${baselineManifestPath})`);
    }

    const currentManifest = await collectManifest(screenshotsDir);
    const baselineManifest = baselineManifestPayload.manifest;

    const baselineByPath = indexManifest(baselineManifest);
    const currentByPath = indexManifest(currentManifest);

    const missingFiles = [];
    const newFiles = [];
    const changedFiles = [];

    for (const baselineEntry of baselineManifest) {
        const currentEntry = currentByPath.get(baselineEntry.path);
        if (!currentEntry) {
            missingFiles.push(baselineEntry.path);
            continue;
        }
        if (currentEntry.sha256 !== baselineEntry.sha256) {
            changedFiles.push(baselineEntry.path);
        }
    }

    for (const currentEntry of currentManifest) {
        if (!baselineByPath.has(currentEntry.path)) {
            newFiles.push(currentEntry.path);
        }
    }

    const scorecard = await readJson(scorecardPath).catch(() => null);
    const p0Count = Number(scorecard?.counts?.bySeverity?.P0 ?? 0);
    const p1Count = Number(scorecard?.counts?.bySeverity?.P1 ?? 0);

    const hasBlockingManifestDiff = missingFiles.length > 0 || newFiles.length > 0;
    const hasBlockingHashDiff = enforceHashParity && changedFiles.length > 0;
    const hasBlockingAuditFindings = p0Count > 0 || p1Count > 0;
    const pass = !hasBlockingManifestDiff && !hasBlockingHashDiff && !hasBlockingAuditFindings;

    const report = {
        generatedAt: new Date().toISOString(),
        skipCapture,
        enforceHashParity,
        baselineManifestPath,
        scorecardPath,
        counts: {
            baselineScreenshots: baselineManifest.length,
            currentScreenshots: currentManifest.length,
            missing: missingFiles.length,
            new: newFiles.length,
            changed: changedFiles.length,
            p0: p0Count,
            p1: p1Count,
        },
        missingFiles,
        newFiles,
        changedFiles,
        notes: {
            hashChangesAreNonBlocking: !enforceHashParity,
        },
        pass,
    };

    await writeJson(reportPath, report);
    console.log(`[visual:compare] report saved: ${reportPath}`);

    if (!pass) {
        console.error("[visual:compare] visual parity failed");
        process.exitCode = 1;
    }
}

main().catch((error) => {
    console.error("[visual:compare] failed");
    console.error(error);
    process.exitCode = 1;
});
