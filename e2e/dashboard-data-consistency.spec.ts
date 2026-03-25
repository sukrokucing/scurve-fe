import { expect, test } from "@playwright/test";
import { getOrCreateAuthSession, seedAuthState, type AuthSession } from "./support/auth-session";

type ProjectRecord = {
    id: string;
    name: string;
};

type ActualPoint = {
    date: string;
    actual: number;
};

type PlanPoint = {
    date: string;
    planned_progress: number;
};

type MetricPoint = {
    date: string;
    value: number;
};

type DashboardResponse = {
    project: ProjectRecord;
    actual: ActualPoint[];
    plan: PlanPoint[];
    metric_actual?: MetricPoint[];
    metric_plan?: MetricPoint[];
    unit?: string | null;
};

type HealthResponse = {
    actual_pct?: number | null;
    planned_pct?: number | null;
    variance_pct?: number | null;
    rule_50_70_pass?: boolean | null;
    rule_50_70_status?: string | null;
};

type PortfolioProject = {
    rule_50_70_pass?: boolean | null;
};

type PortfolioResponse = {
    projects?: PortfolioProject[];
};

let DASHBOARD_SESSION: AuthSession | null = null;

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function formatPercentage(value: number | null) {
    if (value === null) return "N/A";
    return `${value.toFixed(1)}%`;
}

function formatMetricValue(metric: "progress" | "hours" | "cost", value: number | null, unit?: string | null) {
    if (value === null) return "N/A";

    if (metric === "progress") {
        return formatPercentage(value);
    }

    if (metric === "hours") {
        const hourUnit = unit?.trim() || "hours";
        return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${hourUnit}`;
    }

    const normalizedUnit = unit?.trim().toUpperCase();
    if (normalizedUnit && /^[A-Z]{3}$/.test(normalizedUnit)) {
        try {
            return new Intl.NumberFormat(undefined, {
                style: "currency",
                currency: normalizedUnit,
                maximumFractionDigits: 2,
            }).format(value);
        } catch {
            return `${normalizedUnit} ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
        }
    }

    if (unit?.trim()) {
        return `${unit.trim()} ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    }

    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatMetricDelta(metric: "progress" | "hours" | "cost", value: number | null, unit?: string | null) {
    if (value === null) return "N/A";

    if (metric === "progress") {
        return `${value > 0 ? "+" : ""}${formatPercentage(value)}`;
    }

    const absoluteValue = Math.abs(value);
    const formatted = formatMetricValue(metric, absoluteValue, unit);
    if (formatted === "N/A") return formatted;
    return `${value > 0 ? "+" : value < 0 ? "-" : ""}${formatted}`;
}

function toMetricValue(value: number | null | undefined, fallback: number) {
    if (isFiniteNumber(value)) return value;
    if (isFiniteNumber(fallback)) return fallback;
    return null;
}

function buildChartData(dashboard: DashboardResponse) {
    const dateMap: Record<string, { date: string; plan?: number; actual?: number }> = {};
    const metricPlanPoints = Array.isArray(dashboard.metric_plan) ? dashboard.metric_plan : [];
    const metricActualPoints = Array.isArray(dashboard.metric_actual) ? dashboard.metric_actual : [];
    const hasMetricSeries = metricPlanPoints.length > 0 || metricActualPoints.length > 0;

    if (hasMetricSeries) {
        metricPlanPoints.forEach((point) => {
            const dateStr = point.date.slice(0, 10);
            if (!dateMap[dateStr]) dateMap[dateStr] = { date: dateStr };
            dateMap[dateStr].plan = point.value;
        });

        metricActualPoints.forEach((point) => {
            const dateStr = point.date.slice(0, 10);
            if (!dateMap[dateStr]) dateMap[dateStr] = { date: dateStr };
            dateMap[dateStr].actual = point.value;
        });
    } else {
        dashboard.plan.forEach((point) => {
            const dateStr = point.date.slice(0, 10);
            if (!dateMap[dateStr]) dateMap[dateStr] = { date: dateStr };
            dateMap[dateStr].plan = point.planned_progress;
        });

        dashboard.actual.forEach((point) => {
            const dateStr = point.date.slice(0, 10);
            if (!dateMap[dateStr]) dateMap[dateStr] = { date: dateStr };
            dateMap[dateStr].actual = point.actual;
        });
    }

    return Object.values(dateMap)
        .map((point) => ({ ...point, ts: new Date(point.date).getTime() }))
        .filter((point) => Number.isFinite(point.ts))
        .sort((a, b) => a.ts - b.ts);
}

function getMetricExpectations(
    dashboard: DashboardResponse,
    health: HealthResponse,
    metric: "progress" | "hours" | "cost",
) {
    const chartData = buildChartData(dashboard);
    const latestActual = chartData.at(-1);
    const latestPlan = chartData.at(-1);
    const dashboardActual = latestActual ? latestActual.actual ?? 0 : 0;
    const dashboardPlan = latestPlan ? latestPlan.plan ?? 0 : 0;
    const dashboardVariance = dashboardActual - dashboardPlan;
    const isProgressMetric = metric === "progress";
    const chartUnit = dashboard.unit ?? (isProgressMetric ? "%" : "");

    const actual = isProgressMetric
        ? toMetricValue(health.actual_pct, dashboardActual)
        : toMetricValue(dashboardActual, Number.NaN);
    const planned = isProgressMetric
        ? toMetricValue(health.planned_pct, dashboardPlan)
        : toMetricValue(dashboardPlan, Number.NaN);
    const variance = isProgressMetric
        ? toMetricValue(health.variance_pct, dashboardVariance)
        : toMetricValue(dashboardVariance, Number.NaN);

    return {
        actual: formatMetricValue(metric, actual, chartUnit),
        planned: formatMetricValue(metric, planned, chartUnit),
        variance: formatMetricDelta(metric, variance, chartUnit),
    };
}

function computeRuleSummary(portfolio: PortfolioResponse | null) {
    const projects = Array.isArray(portfolio?.projects) ? portfolio.projects : [];
    const evaluated = projects.filter((project) => typeof project.rule_50_70_pass === "boolean");
    const passCount = evaluated.filter((project) => project.rule_50_70_pass === true).length;
    const passRate = evaluated.length > 0
        ? `${Math.round((passCount / evaluated.length) * 100)}%`
        : "N/A";
    const passNote = evaluated.length > 0
        ? `${passCount}/${evaluated.length} projects passed`
        : "No supported rule checks yet";

    return { passRate, passNote };
}

test.beforeAll(async ({ request }, testInfo) => {
    testInfo.setTimeout(180_000);
    DASHBOARD_SESSION = await getOrCreateAuthSession(request, "dashboard consistency");
});

test.beforeEach(async ({ page }) => {
    if (!DASHBOARD_SESSION) {
        throw new Error("Dashboard auth session is not initialized.");
    }
    await seedAuthState(page, DASHBOARD_SESSION);
});

test("main dashboard KPIs match live API values", async ({ page }) => {
    if (!DASHBOARD_SESSION) throw new Error("Missing auth session.");
    const headers = { Authorization: `Bearer ${DASHBOARD_SESSION.token}` };

    const projectsResponse = await page.request.get("/api/projects", { headers });
    expect(projectsResponse.ok()).toBeTruthy();
    const projects = (await projectsResponse.json()) as ProjectRecord[];

    const portfolioResponse = await page.request.get("/api/portfolio/s-curve/summary?metric=progress", { headers });
    const portfolio = portfolioResponse.ok()
        ? ((await portfolioResponse.json()) as PortfolioResponse)
        : null;

    const expectedTotalProjects = Array.isArray(projects) ? projects.length : 0;
    const expectedRule = computeRuleSummary(portfolio);

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 15_000 });

    await expect(page.getByTestId("dashboard-kpi-total-projects-value"))
        .toHaveText(String(expectedTotalProjects));
    await expect(page.getByTestId("dashboard-kpi-scurve-pass-rate-value"))
        .toHaveText(expectedRule.passRate);
    await expect(page.getByTestId("dashboard-kpi-scurve-pass-rate-note"))
        .toHaveText(expectedRule.passNote);
});

test("project dashboard metric cards match live API values", async ({ page }) => {
    if (!DASHBOARD_SESSION) throw new Error("Missing auth session.");
    const headers = { Authorization: `Bearer ${DASHBOARD_SESSION.token}` };

    const projectsResponse = await page.request.get("/api/projects", { headers });
    expect(projectsResponse.ok()).toBeTruthy();
    const projects = (await projectsResponse.json()) as ProjectRecord[];

    if (!Array.isArray(projects) || projects.length === 0) {
        test.skip(true, "No accessible projects available for dashboard consistency validation.");
        return;
    }

    const projectId = projects[0].id;
    const progressDashboardResponse = await page.request.get(`/api/projects/${projectId}/dashboard?metric=progress`, { headers });
    expect(progressDashboardResponse.ok()).toBeTruthy();
    const progressDashboard = (await progressDashboardResponse.json()) as DashboardResponse;

    const hoursDashboardResponse = await page.request.get(`/api/projects/${projectId}/dashboard?metric=hours`, { headers });
    expect(hoursDashboardResponse.ok()).toBeTruthy();
    const hoursDashboard = (await hoursDashboardResponse.json()) as DashboardResponse;

    const costDashboardResponse = await page.request.get(`/api/projects/${projectId}/dashboard?metric=cost`, { headers });
    expect(costDashboardResponse.ok()).toBeTruthy();
    const costDashboard = (await costDashboardResponse.json()) as DashboardResponse;

    const progressHealthResponse = await page.request.get(
        `/api/projects/${projectId}/s-curve/health?metric=progress`,
        { headers },
    );
    expect(progressHealthResponse.ok()).toBeTruthy();
    const progressHealth = (await progressHealthResponse.json()) as HealthResponse;

    const hoursHealthResponse = await page.request.get(
        `/api/projects/${projectId}/s-curve/health?metric=hours`,
        { headers },
    );
    expect(hoursHealthResponse.ok()).toBeTruthy();
    const hoursHealth = (await hoursHealthResponse.json()) as HealthResponse;

    const costHealthResponse = await page.request.get(
        `/api/projects/${projectId}/s-curve/health?metric=cost`,
        { headers },
    );
    expect(costHealthResponse.ok()).toBeTruthy();
    const costHealth = (await costHealthResponse.json()) as HealthResponse;

    const expectedProgress = getMetricExpectations(progressDashboard, progressHealth, "progress");
    const expectedHours = getMetricExpectations(hoursDashboard, hoursHealth, "hours");
    const expectedCost = getMetricExpectations(costDashboard, costHealth, "cost");

    await page.goto(`/projects/${projectId}/dashboard`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("project-dashboard-metric-combobox")).toBeVisible({ timeout: 15_000 });

    await expect(page.getByTestId("project-dashboard-actual-value")).toHaveText(expectedProgress.actual);
    await expect(page.getByTestId("project-dashboard-planned-value")).toHaveText(expectedProgress.planned);
    await expect(page.getByTestId("project-dashboard-variance-value")).toHaveText(expectedProgress.variance);

    await page.getByTestId("project-dashboard-metric-combobox").click();
    await page.getByRole("option", { name: "Hours" }).click();

    await expect(page.getByTestId("project-dashboard-actual-value")).toHaveText(expectedHours.actual);
    await expect(page.getByTestId("project-dashboard-planned-value")).toHaveText(expectedHours.planned);
    await expect(page.getByTestId("project-dashboard-variance-value")).toHaveText(expectedHours.variance);

    await page.getByTestId("project-dashboard-metric-combobox").click();
    await page.getByRole("option", { name: "Cost" }).click();

    await expect(page.getByTestId("project-dashboard-actual-value")).toHaveText(expectedCost.actual);
    await expect(page.getByTestId("project-dashboard-planned-value")).toHaveText(expectedCost.planned);
    await expect(page.getByTestId("project-dashboard-variance-value")).toHaveText(expectedCost.variance);
});
