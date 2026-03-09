import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    median,
    npmCommand,
    readJson,
    startDevServer,
    stopDevServer,
    timedRun,
    writeJson,
} from "./utils.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..", "..");

const artifactsDir = path.join(projectRoot, "artifacts", "perf-upgrade");
const baselinePath = path.join(artifactsDir, "perf-baseline.json");
const probeMetricsPath = path.join(projectRoot, "artifacts", "perf-probes", "metrics.json");

function parsePositiveInt(value, fallback) {
    const parsed = Number.parseInt(value ?? "", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInt(value, fallback) {
    const parsed = Number.parseInt(value ?? "", 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

async function sleep(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
}

function runPerfProbeSuite({ cwd, env }) {
    timedRun(npmCommand, ["run", "test:e2e:perf"], {
        cwd,
        env,
    });
}

async function runPerfProbeSuiteWithRetries({ cwd, env, retries, run }) {
    let attempt = 0;
    while (attempt <= retries) {
        try {
            runPerfProbeSuite({ cwd, env });
            return;
        } catch (error) {
            if (attempt >= retries) {
                throw error;
            }
            const nextAttempt = attempt + 2;
            console.warn(`[perf:baseline] probe run ${run} failed on attempt ${attempt + 1}; retrying (${nextAttempt}/${retries + 1})`);
            await sleep(1500);
            attempt += 1;
        }
    }
}

function summarizeProbeMetrics(metricsPayload) {
    const metrics = metricsPayload?.metrics ?? [];
    const durationsByName = new Map();

    for (const metric of metrics) {
        if (!metric?.name || typeof metric.durationMs !== "number") continue;
        const current = durationsByName.get(metric.name) ?? [];
        current.push(metric.durationMs);
        durationsByName.set(metric.name, current);
    }

    const summary = {};
    for (const [name, durations] of durationsByName.entries()) {
        summary[name] = {
            medianMs: median(durations),
            sampleCount: durations.length,
        };
    }
    return summary;
}

function buildProbeEnv() {
    const probeBudgetCeilingMs = "60000";
    return {
        PERF_BUDGET_TASKS_LOAD_MS: process.env.PERF_BUDGET_TASKS_LOAD_MS ?? probeBudgetCeilingMs,
        PERF_BUDGET_TASKS_SEARCH_MS: process.env.PERF_BUDGET_TASKS_SEARCH_MS ?? probeBudgetCeilingMs,
        PERF_BUDGET_GANTT_SWITCH_MS: process.env.PERF_BUDGET_GANTT_SWITCH_MS ?? probeBudgetCeilingMs,
        PERF_BUDGET_GANTT_TODAY_MS: process.env.PERF_BUDGET_GANTT_TODAY_MS ?? probeBudgetCeilingMs,
        PERF_BUDGET_POLICY_LOAD_MS: process.env.PERF_BUDGET_POLICY_LOAD_MS ?? probeBudgetCeilingMs,
        PERF_BUDGET_POLICY_FILTER_MS: process.env.PERF_BUDGET_POLICY_FILTER_MS ?? probeBudgetCeilingMs,
        PERF_BUDGET_FLOW_LOAD_MS: process.env.PERF_BUDGET_FLOW_LOAD_MS ?? probeBudgetCeilingMs,
        PERF_BUDGET_FLOW_SELECT_MS: process.env.PERF_BUDGET_FLOW_SELECT_MS ?? probeBudgetCeilingMs,
    };
}

async function main() {
    const buildRuns = parsePositiveInt(process.env.PERF_BASELINE_BUILD_RUNS, 3);
    const probeRuns = parsePositiveInt(process.env.PERF_BASELINE_PROBE_RUNS, 3);
    const probeRunRetries = parseNonNegativeInt(process.env.PERF_BASELINE_PROBE_RUN_RETRIES, 1);
    const skipE2E = process.env.PERF_BASELINE_SKIP_E2E === "1";
    const buildDurationsMs = [];
    const collectedProbeMetrics = [];
    let devServer = null;

    console.log(`[perf:baseline] collecting build baseline (${buildRuns} runs)`);
    for (let run = 1; run <= buildRuns; run += 1) {
        const durationMs = timedRun(npmCommand, ["run", "build"], {
            cwd: projectRoot,
            stdio: "ignore",
        });
        buildDurationsMs.push(durationMs);
        console.log(`[perf:baseline] build run ${run}: ${durationMs}ms`);
    }

    if (!skipE2E) {
        try {
            devServer = await startDevServer(projectRoot);
            const resolvedBaseUrl = devServer.baseUrl.toString();
            console.log(`[perf:baseline] running runtime perf probes (${probeRuns} runs) at ${resolvedBaseUrl}`);
            for (let run = 1; run <= probeRuns; run += 1) {
                await runPerfProbeSuiteWithRetries({
                    cwd: projectRoot,
                    env: {
                        ...buildProbeEnv(),
                        BASE_URL: resolvedBaseUrl,
                        VITE_BASE_URL: resolvedBaseUrl,
                    },
                    retries: probeRunRetries,
                    run,
                });
                const probeMetricsPayload = await readJson(probeMetricsPath);
                const metrics = probeMetricsPayload?.metrics ?? [];
                for (const metric of metrics) {
                    collectedProbeMetrics.push(metric);
                }
                console.log(`[perf:baseline] probe run ${run}: captured ${metrics.length} metrics`);
            }
        } finally {
            await stopDevServer(devServer?.process);
        }
    } else {
        console.log("[perf:baseline] skipping runtime perf probes (PERF_BASELINE_SKIP_E2E=1)");
    }

    let probeSummary = {};
    try {
        if (collectedProbeMetrics.length > 0) {
            probeSummary = summarizeProbeMetrics({ metrics: collectedProbeMetrics });
        } else {
            const probeMetrics = await readJson(probeMetricsPath);
            probeSummary = summarizeProbeMetrics(probeMetrics);
        }
    } catch {
        console.warn("[perf:baseline] no runtime probe metrics found; baseline will include build-only data");
    }

    const payload = {
        generatedAt: new Date().toISOString(),
        buildRuns,
        probeRuns: skipE2E ? 0 : probeRuns,
        buildDurationsMs,
        buildMedianMs: median(buildDurationsMs),
        probeSummary,
    };

    await writeJson(baselinePath, payload);
    console.log(`[perf:baseline] baseline saved: ${baselinePath}`);
}

main().catch((error) => {
    console.error("[perf:baseline] failed");
    console.error(error);
    process.exitCode = 1;
});
