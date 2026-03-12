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

type DashboardResponse = {
    project: ProjectRecord;
    actual: ActualPoint[];
    plan: PlanPoint[];
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

function toMetricValue(value: number | null | undefined, fallback: number) {
    if (isFiniteNumber(value)) return value;
    if (isFiniteNumber(fallback)) return fallback;
    return null;
}

function pickLatestActual(actual: ActualPoint[]) {
    return [...actual]
        .map((point) => ({ ...point, ts: new Date(point.date).getTime() }))
        .filter((point) => Number.isFinite(point.ts))
        .sort((a, b) => a.ts - b.ts)
        .at(-1);
}

function pickLatestPlan(plan: PlanPoint[]) {
    return [...plan]
        .map((point) => ({ ...point, ts: new Date(point.date).getTime() }))
        .filter((point) => Number.isFinite(point.ts))
        .sort((a, b) => a.ts - b.ts)
        .at(-1);
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
    const dashboardResponse = await page.request.get(`/api/projects/${projectId}/dashboard`, { headers });
    expect(dashboardResponse.ok()).toBeTruthy();
    const dashboard = (await dashboardResponse.json()) as DashboardResponse;

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

    const latestActual = pickLatestActual(Array.isArray(dashboard.actual) ? dashboard.actual : []);
    const latestPlan = pickLatestPlan(Array.isArray(dashboard.plan) ? dashboard.plan : []);
    const dashboardActual = latestActual ? latestActual.actual : 0;
    const dashboardPlan = latestPlan ? latestPlan.planned_progress : 0;
    const dashboardVariance = dashboardActual - dashboardPlan;

    const expectedProgressActual = formatPercentage(toMetricValue(progressHealth.actual_pct, dashboardActual));
    const expectedProgressPlan = formatPercentage(toMetricValue(progressHealth.planned_pct, dashboardPlan));
    const expectedProgressVarianceRaw = toMetricValue(progressHealth.variance_pct, dashboardVariance);
    const expectedProgressVariance = expectedProgressVarianceRaw === null
        ? "N/A"
        : `${expectedProgressVarianceRaw > 0 ? "+" : ""}${formatPercentage(expectedProgressVarianceRaw)}`;

    const expectedHoursActual = formatPercentage(toMetricValue(hoursHealth.actual_pct, Number.NaN));
    const expectedHoursPlan = formatPercentage(toMetricValue(hoursHealth.planned_pct, Number.NaN));
    const expectedHoursVarianceRaw = toMetricValue(hoursHealth.variance_pct, Number.NaN);
    const expectedHoursVariance = expectedHoursVarianceRaw === null
        ? "N/A"
        : `${expectedHoursVarianceRaw > 0 ? "+" : ""}${formatPercentage(expectedHoursVarianceRaw)}`;

    const expectedCostActual = formatPercentage(toMetricValue(costHealth.actual_pct, Number.NaN));
    const expectedCostPlan = formatPercentage(toMetricValue(costHealth.planned_pct, Number.NaN));
    const expectedCostVarianceRaw = toMetricValue(costHealth.variance_pct, Number.NaN);
    const expectedCostVariance = expectedCostVarianceRaw === null
        ? "N/A"
        : `${expectedCostVarianceRaw > 0 ? "+" : ""}${formatPercentage(expectedCostVarianceRaw)}`;

    await page.goto(`/projects/${projectId}/dashboard`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Dashboard$/ })).toBeVisible({ timeout: 15_000 });

    await expect(page.getByTestId("project-dashboard-actual-value")).toHaveText(expectedProgressActual);
    await expect(page.getByTestId("project-dashboard-planned-value")).toHaveText(expectedProgressPlan);
    await expect(page.getByTestId("project-dashboard-variance-value")).toHaveText(expectedProgressVariance);

    await page.getByTestId("project-dashboard-metric-combobox").click();
    await page.getByRole("option", { name: "Hours" }).click();

    await expect(page.getByTestId("project-dashboard-actual-value")).toHaveText(expectedHoursActual);
    await expect(page.getByTestId("project-dashboard-planned-value")).toHaveText(expectedHoursPlan);
    await expect(page.getByTestId("project-dashboard-variance-value")).toHaveText(expectedHoursVariance);

    await page.getByTestId("project-dashboard-metric-combobox").click();
    await page.getByRole("option", { name: "Cost" }).click();

    await expect(page.getByTestId("project-dashboard-actual-value")).toHaveText(expectedCostActual);
    await expect(page.getByTestId("project-dashboard-planned-value")).toHaveText(expectedCostPlan);
    await expect(page.getByTestId("project-dashboard-variance-value")).toHaveText(expectedCostVariance);
});
