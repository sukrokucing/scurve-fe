import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    npmCommand,
    runCommand,
    startDevServer,
    stopDevServer,
    toPosixPath,
    writeJson,
} from "./utils.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..", "..");
const reportPath = path.join(projectRoot, "artifacts", "perf-upgrade", "tailwind4-canary-report.json");

const COPY_EXCLUDE_PREFIXES = [
    ".git",
    "node_modules",
    "dist",
    "playwright-report",
    "test-results",
    "output",
    "artifacts/ui-audit/screenshots",
];

function shouldCopyPath(sourcePath) {
    const relPath = toPosixPath(path.relative(projectRoot, sourcePath));
    if (!relPath || relPath === ".") return true;
    return !COPY_EXCLUDE_PREFIXES.some((prefix) => relPath === prefix || relPath.startsWith(`${prefix}/`));
}

async function patchPackageJson(tempDir) {
    const packagePath = path.join(tempDir, "package.json");
    const packageRaw = await fs.readFile(packagePath, "utf8");
    const pkg = JSON.parse(packageRaw);

    pkg.devDependencies = pkg.devDependencies ?? {};
    pkg.devDependencies.tailwindcss = "^4.2.1";
    pkg.devDependencies["@tailwindcss/vite"] = "^4.2.1";

    await fs.writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
}

async function patchViteConfig(tempDir) {
    const viteConfigPath = path.join(tempDir, "vite.config.ts");
    const raw = await fs.readFile(viteConfigPath, "utf8");

    let next = raw;
    if (!next.includes("@tailwindcss/vite")) {
        next = next.replace(
            'import react from "@vitejs/plugin-react";',
            'import react from "@vitejs/plugin-react";\nimport tailwindcss from "@tailwindcss/vite";',
        );
    }

    if (!next.includes("tailwindcss()")) {
        next = next.replace("plugins: [react()],", "plugins: [react(), tailwindcss()],");
    }

    if (!next.includes("tailwindcss()")) {
        throw new Error("Failed to patch vite.config.ts for Tailwind v4 canary");
    }

    await fs.writeFile(viteConfigPath, next, "utf8");
}

async function patchIndexCss(tempDir) {
    const indexCssPath = path.join(tempDir, "src", "index.css");
    const raw = await fs.readFile(indexCssPath, "utf8");
    const withoutLeadingConfig = raw.replace(/^@config\s+["'][^"']+["'];\r?\n\s*/m, "");
    const tailwindV3Header = /^@tailwind base;\r?\n@tailwind components;\r?\n@tailwind utilities;\r?\n/m;
    const themeCompatBlock = [
        "@theme {",
        "  --color-border: hsl(var(--border));",
        "  --color-input: hsl(var(--input));",
        "  --color-ring: hsl(var(--ring));",
        "  --color-ring-strong: hsl(var(--focus-strong));",
        "  --color-background: hsl(var(--background));",
        "  --color-foreground: hsl(var(--foreground));",
        "  --color-primary: hsl(var(--primary));",
        "  --color-primary-foreground: hsl(var(--primary-foreground));",
        "  --color-primary-dark: hsl(var(--primary-dark));",
        "  --color-primary-hover: hsl(var(--primary-hover));",
        "  --color-primary-active: hsl(var(--primary-active));",
        "  --color-secondary: hsl(var(--secondary));",
        "  --color-secondary-foreground: hsl(var(--secondary-foreground));",
        "  --color-secondary-hover: hsl(var(--secondary-hover));",
        "  --color-secondary-active: hsl(var(--secondary-active));",
        "  --color-destructive: hsl(var(--destructive));",
        "  --color-destructive-foreground: hsl(var(--destructive-foreground));",
        "  --color-muted: hsl(var(--muted));",
        "  --color-muted-foreground: hsl(var(--muted-foreground));",
        "  --color-accent: hsl(var(--accent));",
        "  --color-accent-foreground: hsl(var(--accent-foreground));",
        "  --color-accent-hover: hsl(var(--accent-hover));",
        "  --color-accent-active: hsl(var(--accent-active));",
        "  --color-surface: hsl(var(--surface));",
        "  --color-surface-hover: hsl(var(--surface-hover));",
        "  --color-surface-active: hsl(var(--surface-active));",
        "  --color-popover: hsl(var(--popover));",
        "  --color-popover-foreground: hsl(var(--popover-foreground));",
        "  --color-card: hsl(var(--card));",
        "  --color-card-foreground: hsl(var(--card-foreground));",
        "  --color-success: hsl(var(--success));",
        "  --color-success-foreground: hsl(var(--success-foreground));",
        "  --color-warning: hsl(var(--warning));",
        "  --color-warning-foreground: hsl(var(--warning-foreground));",
        "  --color-info: hsl(var(--info));",
        "  --color-info-foreground: hsl(var(--info-foreground));",
        "  --color-error: hsl(var(--error));",
        "  --color-error-foreground: hsl(var(--error-foreground));",
        "  --color-gray-50: hsl(var(--gray-50));",
        "  --color-gray-100: hsl(var(--gray-100));",
        "  --color-gray-200: hsl(var(--gray-200));",
        "  --color-gray-300: hsl(var(--gray-300));",
        "  --color-gray-400: hsl(var(--gray-400));",
        "  --color-gray-500: hsl(var(--gray-500));",
        "  --color-gray-600: hsl(var(--gray-600));",
        "  --color-gray-700: hsl(var(--gray-700));",
        "  --color-gray-800: hsl(var(--gray-800));",
        "  --color-gray-900: hsl(var(--gray-900));",
        "  --radius-sm: calc(var(--radius) - 4px);",
        "  --radius-md: calc(var(--radius) - 2px);",
        "  --radius-lg: var(--radius);",
        "}",
        "",
    ].join("\n");

    const next = withoutLeadingConfig.replace(
        tailwindV3Header,
        `@import "tailwindcss";\n@config "../tailwind.config.js";\n${themeCompatBlock}`,
    );

    if (next === raw) {
        throw new Error("Failed to convert Tailwind directives in src/index.css");
    }

    await fs.writeFile(indexCssPath, next, "utf8");
}

async function patchPostcssConfig(tempDir) {
    const candidates = [
        "postcss.config.js",
        "postcss.config.cjs",
        "postcss.config.mjs",
    ].map((relativePath) => path.join(tempDir, relativePath));

    for (const filePath of candidates) {
        try {
            await fs.readFile(filePath, "utf8");
            await fs.writeFile(
                filePath,
                [
                    "export default {",
                    "  plugins: {",
                    "    autoprefixer: {},",
                    "  },",
                    "};",
                    "",
                ].join("\n"),
                "utf8",
            );
            return;
        } catch {
            // Continue checking other postcss config candidates.
        }
    }
}

async function runStep(steps, cwd, command, args, envOverrides = {}) {
    const startedAt = performance.now();
    runCommand(command, args, { cwd, env: envOverrides });
    const durationMs = Math.round(performance.now() - startedAt);
    steps.push({
        command: `${command} ${args.join(" ")}`,
        durationMs,
    });
}

async function readEnvValue(tempDir, key) {
    const envFiles = [".env", ".env.development", ".env.local"];
    for (const relativePath of envFiles) {
        try {
            const raw = await fs.readFile(path.join(tempDir, relativePath), "utf8");
            for (const rawLine of raw.split(/\r?\n/)) {
                const line = rawLine.trim();
                if (!line || line.startsWith("#")) continue;
                const separator = line.indexOf("=");
                if (separator <= 0) continue;
                const currentKey = line.slice(0, separator).trim();
                if (currentKey !== key) continue;
                const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
                if (value) return value;
            }
        } catch {
            // Ignore missing env file; continue searching.
        }
    }
    return null;
}

async function main() {
    const keepTemp = process.env.TAILWIND4_CANARY_KEEP_TMP === "1";
    const steps = [];
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "scurve-tailwind4-canary-"));
    let devServer = null;

    let success = false;
    let failure = null;

    try {
        await fs.cp(projectRoot, tempDir, {
            recursive: true,
            filter: shouldCopyPath,
        });

        await patchPackageJson(tempDir);
        await patchViteConfig(tempDir);
        await patchIndexCss(tempDir);
        await patchPostcssConfig(tempDir);

        await runStep(steps, tempDir, npmCommand, ["install", "--no-audit", "--no-fund"]);
        await runStep(steps, tempDir, npmCommand, ["run", "lint"]);
        await runStep(steps, tempDir, npmCommand, ["run", "typecheck"]);
        await runStep(steps, tempDir, npmCommand, ["run", "build"]);

        const envBaseUrl = process.env.BASE_URL
            ?? process.env.VITE_BASE_URL
            ?? await readEnvValue(tempDir, "VITE_BASE_URL")
            ?? "http://127.0.0.1:3001";
        const devStartAt = performance.now();
        devServer = await startDevServer(tempDir, {
            baseUrl: envBaseUrl,
            host: "127.0.0.1",
            timeoutMs: 120000,
        });
        steps.push({
            command: "npm run dev",
            durationMs: Math.round(performance.now() - devStartAt),
            details: {
                baseUrl: devServer.baseUrl.toString(),
            },
        });

        const auditEnv = {
            BASE_URL: devServer.baseUrl.toString(),
            VITE_BASE_URL: devServer.baseUrl.toString(),
            UI_AUDIT_MANAGED_SERVER: "0",
        };
        await runStep(steps, tempDir, npmCommand, ["run", "audit:ui"], auditEnv);
        await runStep(steps, tempDir, npmCommand, ["run", "audit:perf:strict"], {
            BASE_URL: devServer.baseUrl.toString(),
            VITE_BASE_URL: devServer.baseUrl.toString(),
        });

        const baselineManifest = path.join(tempDir, "artifacts", "perf-upgrade", "visual-baseline", "manifest.json");
        try {
            await fs.access(baselineManifest);
            await runStep(steps, tempDir, npmCommand, ["run", "visual:compare"], {
                BASE_URL: devServer.baseUrl.toString(),
                VITE_BASE_URL: devServer.baseUrl.toString(),
                UI_AUDIT_MANAGED_SERVER: "0",
            });
        } catch {
            steps.push({
                command: "npm run visual:compare",
                skipped: true,
                reason: "visual baseline not found in artifacts/perf-upgrade/visual-baseline/manifest.json",
            });
        }

        success = true;
    } catch (error) {
        failure = error instanceof Error ? error.message : String(error);
    } finally {
        await stopDevServer(devServer?.process);

        await writeJson(reportPath, {
            generatedAt: new Date().toISOString(),
            success,
            tempDir,
            keepTemp,
            steps,
            failure,
        });

        if (!keepTemp) {
            try {
                await fs.rm(tempDir, { recursive: true, force: true });
            } catch (cleanupError) {
                const message = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
                console.warn(`[upgrade:tailwind4:canary] cleanup skipped: ${message}`);
            }
        }
    }

    if (!success) {
        console.error("[upgrade:tailwind4:canary] failed");
        console.error(failure);
        process.exitCode = 1;
        return;
    }

    console.log("[upgrade:tailwind4:canary] passed");
    console.log(`[upgrade:tailwind4:canary] report: ${reportPath}`);
}

main().catch((error) => {
    console.error("[upgrade:tailwind4:canary] unexpected failure");
    console.error(error);
    process.exitCode = 1;
});
