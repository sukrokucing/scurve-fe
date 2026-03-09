import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    ensureDir,
    hashFile,
    npmCommand,
    runCommand,
    toPosixPath,
    walkFiles,
    writeJson,
} from "./utils.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..", "..");

const screenshotsDir = path.join(projectRoot, "artifacts", "ui-audit", "screenshots");
const baselineRoot = path.join(projectRoot, "artifacts", "perf-upgrade", "visual-baseline");
const baselineScreenshotsDir = path.join(baselineRoot, "screenshots");
const manifestPath = path.join(baselineRoot, "manifest.json");

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

async function main() {
    console.log("[visual:baseline] running visual audit capture");
    runCommand(npmCommand, ["run", "audit:ui:mode", "--", "--mode=visual"], { cwd: projectRoot });

    await ensureDir(baselineRoot);
    await fs.rm(baselineScreenshotsDir, { recursive: true, force: true });
    await fs.cp(screenshotsDir, baselineScreenshotsDir, { recursive: true });

    const manifest = await collectManifest(baselineScreenshotsDir);
    await writeJson(manifestPath, {
        generatedAt: new Date().toISOString(),
        screenshotCount: manifest.length,
        manifest,
    });

    console.log(`[visual:baseline] baseline screenshots: ${manifest.length}`);
    console.log(`[visual:baseline] baseline manifest saved: ${manifestPath}`);
}

main().catch((error) => {
    console.error("[visual:baseline] failed");
    console.error(error);
    process.exitCode = 1;
});
