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
const comparePath = path.join(artifactsDir, "perf-compare.json");
const probeMetricsPath = path.join(projectRoot, "artifacts", "perf-probes", "metrics.json");

function parsePositiveInt(value, fallback) {
    const parsed = Number.parseInt(value ?? "", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePercent(value, fallback) {
    const parsed = Number.parseFloat(value ?? "");
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseNonNegativeInt(value, fallback) {
    const parsed = Number.parseInt(value ?? "", 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

async function sleep(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
}

function evaluateBuildRegression({ baselineBuildMedianMs, currentBuildMedianMs, allowedBuildRegressionPct, allowedBuildRegressionAbsMs }) {
    if (typeof baselineBuildMedianMs !== "number" || typeof currentBuildMedianMs !== "number") {
        return null;
    }
    const buildLimitByPct = baselineBuildMedianMs * (1 + allowedBuildRegressionPct / 100);
    const buildLimitByAbs = baselineBuildMedianMs + allowedBuildRegressionAbsMs;
    const buildLimit = Math.max(buildLimitByPct, buildLimitByAbs);
    if (currentBuildMedianMs <= buildLimit) {
        return null;
    }
    return {
        type: "build",
        baselineMs: baselineBuildMedianMs,
        currentMs: currentBuildMedianMs,
        allowedMaxMs: Math.round(buildLimit),
        allowedRegressionPct: allowedBuildRegressionPct,
    };
}

function collectBuildDurations(cwd, runs, label = "build") {
    const durations = [];
    for (let run = 1; run <= runs; run += 1) {
        const durationMs = timedRun(npmCommand, ["run", "build"], {
            cwd,
            stdio: "ignore",
        });
        durations.push(durationMs);
        console.log(`[perf:compare] ${label} run ${run}: ${durationMs}ms`);
    }
    return durations;
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
            console.warn(`[perf:compare] probe run ${run} failed on attempt ${attempt + 1}; retrying (${nextAttempt}/${retries + 1})`);
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
    const baseline = await readJson(baselinePath);
    const buildRuns = parsePositiveInt(process.env.PERF_COMPARE_BUILD_RUNS, 3);
    const confirmBuildRuns = parsePositiveInt(process.env.PERF_COMPARE_CONFIRM_BUILD_RUNS, buildRuns);
    const probeRuns = parsePositiveInt(process.env.PERF_COMPARE_PROBE_RUNS, 3);
    const probeRunRetries = parseNonNegativeInt(process.env.PERF_PROBE_RUN_RETRIES, 1);
    const skipE2E = process.env.PERF_COMPARE_SKIP_E2E === "1";
    const confirmBuildRegression = process.env.PERF_COMPARE_CONFIRM_BUILD_REGRESSION !== "0";
    const allowedBuildRegressionPct = parsePercent(process.env.PERF_BUILD_REGRESSION_PCT, 5);
    const allowedProbeRegressionPct = parsePercent(process.env.PERF_PROBE_REGRESSION_PCT, 20);
    const allowedBuildRegressionAbsMs = parseNonNegativeInt(process.env.PERF_BUILD_REGRESSION_ABS_MS, 5000);
    const allowedProbeRegressionAbsMs = parseNonNegativeInt(process.env.PERF_PROBE_REGRESSION_ABS_MS, 200);
    const allowedRouteLoadRegressionAbsMs = parseNonNegativeInt(process.env.PERF_PROBE_ROUTE_LOAD_REGRESSION_ABS_MS, 800);
    const allowedGanttSwitchRegressionAbsMs = parseNonNegativeInt(process.env.PERF_PROBE_GANTT_SWITCH_REGRESSION_ABS_MS, 700);

    const buildDurationsMs = collectBuildDurations(projectRoot, buildRuns);
    const collectedProbeMetrics = [];
    let confirmationBuildDurationsMs = [];
    let confirmationBuildMedianMs = null;
    let initialBuildRegression = null;
    let confirmedBuildRegression = null;
    let buildRegressionSuppressedAsTransient = false;
    let devServer = null;
    const buildMedianMs = median(buildDurationsMs);

    initialBuildRegression = evaluateBuildRegression({
        baselineBuildMedianMs: baseline?.buildMedianMs,
        currentBuildMedianMs: buildMedianMs,
        allowedBuildRegressionPct,
        allowedBuildRegressionAbsMs,
    });

    if (initialBuildRegression && confirmBuildRegression) {
        console.warn("[perf:compare] initial build regression detected; collecting confirmation sample");
        confirmationBuildDurationsMs = collectBuildDurations(projectRoot, confirmBuildRuns, "build-confirmation");
        confirmationBuildMedianMs = median(confirmationBuildDurationsMs);
        confirmedBuildRegression = evaluateBuildRegression({
            baselineBuildMedianMs: baseline?.buildMedianMs,
            currentBuildMedianMs: confirmationBuildMedianMs,
            allowedBuildRegressionPct,
            allowedBuildRegressionAbsMs,
        });
        if (!confirmedBuildRegression) {
            buildRegressionSuppressedAsTransient = true;
            console.warn("[perf:compare] build regression not confirmed; suppressing transient regression");
        }
    }

    if (!skipE2E) {
        try {
            devServer = await startDevServer(projectRoot);
            const resolvedBaseUrl = devServer.baseUrl.toString();
            console.log(`[perf:compare] running runtime perf probes (${probeRuns} runs) at ${resolvedBaseUrl}`);
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
                console.log(`[perf:compare] probe run ${run}: captured ${metrics.length} metrics`);
            }
        } finally {
            await stopDevServer(devServer?.process);
        }
    } else {
        console.log("[perf:compare] skipping runtime perf probes (PERF_COMPARE_SKIP_E2E=1)");
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
        console.warn("[perf:compare] no runtime probe metrics found for comparison");
    }

    const regressions = [];

    if (confirmedBuildRegression) {
        regressions.push({
            ...confirmedBuildRegression,
            phase: "confirmed",
            initialCurrentMs: buildMedianMs,
        });
    } else if (initialBuildRegression && !confirmBuildRegression) {
        regressions.push({
            ...initialBuildRegression,
            phase: "initial",
        });
    }

    const baselineProbeSummary = baseline?.probeSummary ?? {};
    for (const [metricName, baselineMetric] of Object.entries(baselineProbeSummary)) {
        const baselineMedianMs = baselineMetric?.medianMs;
        const currentMedianMs = probeSummary?.[metricName]?.medianMs;
        if (typeof baselineMedianMs !== "number") continue;
        if (typeof currentMedianMs !== "number") {
            regressions.push({
                type: "probe-missing",
                metricName,
                baselineMs: baselineMedianMs,
                currentMs: null,
            });
            continue;
        }

        const metricSpecificProbeAbsMs = metricName.endsWith(".route.load")
            ? allowedRouteLoadRegressionAbsMs
            : metricName === "tasks.gantt.switch"
                ? allowedGanttSwitchRegressionAbsMs
                : allowedProbeRegressionAbsMs;
        const probeLimitByPct = baselineMedianMs * (1 + allowedProbeRegressionPct / 100);
        const probeLimitByAbs = baselineMedianMs + metricSpecificProbeAbsMs;
        const probeLimit = Math.max(probeLimitByPct, probeLimitByAbs);
        if (currentMedianMs > probeLimit) {
            regressions.push({
                type: "probe",
                metricName,
                baselineMs: baselineMedianMs,
                currentMs: currentMedianMs,
                allowedMaxMs: Math.round(probeLimit),
                allowedRegressionPct: allowedProbeRegressionPct,
                allowedRegressionAbsMs: metricSpecificProbeAbsMs,
            });
        }
    }

    const payload = {
        generatedAt: new Date().toISOString(),
        baselinePath,
        buildRuns,
        confirmBuildRuns: confirmBuildRegression ? confirmBuildRuns : 0,
        probeRuns: skipE2E ? 0 : probeRuns,
        probeRunRetries,
        buildDurationsMs,
        buildMedianMs,
        confirmationBuildDurationsMs,
        confirmationBuildMedianMs,
        buildRegressionSuppressedAsTransient,
        baselineBuildMedianMs: baseline?.buildMedianMs ?? null,
        probeSummary,
        baselineProbeSummary,
        allowedBuildRegressionPct,
        allowedBuildRegressionAbsMs,
        allowedProbeRegressionPct,
        allowedProbeRegressionAbsMs,
        allowedRouteLoadRegressionAbsMs,
        allowedGanttSwitchRegressionAbsMs,
        regressions,
        pass: regressions.length === 0,
    };

    await writeJson(comparePath, payload);
    console.log(`[perf:compare] report saved: ${comparePath}`);

    if (regressions.length > 0) {
        console.error("[perf:compare] regression detected");
        process.exitCode = 1;
    }
}

main().catch((error) => {
    console.error("[perf:compare] failed");
    console.error(error);
    process.exitCode = 1;
});
