import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { goodUiRuleMap } from "./good-ui-rules.mjs";
import { startDevServer, stopDevServer } from "../upgrade/utils.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..", "..");
const artifactsDir = path.join(projectRoot, "artifacts", "ui-audit");

const staticFindingsPath = path.join(artifactsDir, "findings.static.json");
const runtimeFindingsPath = path.join(artifactsDir, "findings.runtime.json");
const mergedFindingsPath = path.join(artifactsDir, "findings.json");
const scorecardPath = path.join(artifactsDir, "scorecard.json");

const severityPenalty = {
    P0: 30,
    P1: 12,
    P2: 2,
    P3: 1,
};

function parseArgs(argv) {
    const args = new Map();
    argv.forEach((arg) => {
        if (!arg.startsWith("--")) return;
        const [key, value] = arg.replace(/^--/, "").split("=");
        args.set(key, value ?? "true");
    });
    return args;
}

function runNodeScript(scriptPath, extraEnv = {}) {
    const result = spawnSync(
        process.execPath,
        [scriptPath],
        {
            cwd: projectRoot,
            stdio: "inherit",
            env: {
                ...process.env,
                ...extraEnv,
            },
        },
    );
    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}

function runPlaywrightAudit(mode) {
    const playwrightCli = path.join(projectRoot, "node_modules", "playwright", "cli.js");
    const result = spawnSync(
        process.execPath,
        [
            playwrightCli,
            "test",
            "e2e/ui-audit.spec.ts",
            "--project=chromium",
            "--workers=1",
        ],
        {
            cwd: projectRoot,
            stdio: "inherit",
            env: {
                ...process.env,
                UI_AUDIT_MODE: mode,
                BASE_URL: process.env.BASE_URL ?? "http://localhost:3001",
            },
        },
    );
    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}

async function readJson(filePath) {
    try {
        const raw = await fs.readFile(filePath, "utf8");
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function computeScorecard(findings) {
    const counts = {
        total: findings.length,
        bySeverity: { P0: 0, P1: 0, P2: 0, P3: 0 },
        byRule: {},
    };

    let penalty = 0;
    for (const finding of findings) {
        const severity = finding.severity ?? "P3";
        counts.bySeverity[severity] = (counts.bySeverity[severity] ?? 0) + 1;
        counts.byRule[finding.ruleId] = (counts.byRule[finding.ruleId] ?? 0) + 1;

        const ruleWeight = goodUiRuleMap[finding.ruleId]?.weight ?? 4;
        penalty += (severityPenalty[severity] ?? 1) + (ruleWeight * 0.1);
    }

    const score = Math.max(0, Math.round((100 - penalty) * 10) / 10);
    const pass = counts.bySeverity.P0 === 0 && counts.bySeverity.P1 === 0;
    return {
        score,
        pass,
        counts,
    };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const mode = args.get("mode") ?? "full";
    const gateEnabled = args.get("gate") === "true";
    const manageDevServer = process.env.UI_AUDIT_MANAGED_SERVER !== "0";
    let devServer = null;

    try {
        await fs.mkdir(artifactsDir, { recursive: true });

        if (mode !== "report" && manageDevServer) {
            const requestedBaseUrl = process.env.BASE_URL ?? process.env.VITE_BASE_URL ?? "http://127.0.0.1:3001";
            devServer = await startDevServer(projectRoot, {
                baseUrl: requestedBaseUrl,
                host: "127.0.0.1",
            });
            const resolvedBaseUrl = devServer.baseUrl.toString();
            process.env.BASE_URL = resolvedBaseUrl;
            process.env.VITE_BASE_URL = resolvedBaseUrl;
            console.log(`[ui-audit] managed dev server started: ${resolvedBaseUrl}`);
        }

        if (mode !== "report") {
            runNodeScript(path.join(projectRoot, "scripts", "ui-audit", "collect-static-metrics.mjs"));

            if (mode === "full" || mode === "visual" || mode === "a11y") {
                runPlaywrightAudit(mode);
            }
        }

        const staticPayload = await readJson(staticFindingsPath);
        const runtimePayload = await readJson(runtimeFindingsPath);

        const mergedFindings = [
            ...(staticPayload?.findings ?? []),
            ...(runtimePayload?.findings ?? []),
        ];

        const scorecard = computeScorecard(mergedFindings);
        const mergedPayload = {
            generatedAt: new Date().toISOString(),
            mode,
            findings: mergedFindings,
            inputs: {
                static: staticPayload?.generatedAt ?? null,
                runtime: runtimePayload?.generatedAt ?? null,
            },
            counts: scorecard.counts,
        };

        await fs.writeFile(mergedFindingsPath, JSON.stringify(mergedPayload, null, 2));
        await fs.writeFile(scorecardPath, JSON.stringify({
            generatedAt: new Date().toISOString(),
            mode,
            ...scorecard,
        }, null, 2));

        console.log(`[ui-audit] merged findings written: ${mergedFindingsPath}`);
        console.log(`[ui-audit] scorecard written: ${scorecardPath}`);
        console.log(`[ui-audit] severity counts: ${JSON.stringify(scorecard.counts.bySeverity)}`);
        console.log(`[ui-audit] score: ${scorecard.score}`);

        if (gateEnabled && !scorecard.pass) {
            console.error("[ui-audit] quality gate failed (P0/P1 findings present).");
            process.exit(1);
        }
    } finally {
        if (devServer?.process) {
            await stopDevServer(devServer.process);
            console.log("[ui-audit] managed dev server stopped");
        }
    }
}

main().catch((error) => {
    console.error("[ui-audit] run failed");
    console.error(error);
    process.exit(1);
});
