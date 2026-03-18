import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { getOrCreateAuthSessionForCredentials, seedAuthState, type AuthSession } from "./support/auth-session";

const AUTH_BROWSER_ALLOWLIST = (process.env.PLAYWRIGHT_AUTH_E2E_BROWSERS ?? "chromium")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

type TeamDemoReport = {
    project: {
        id: string;
        name: string;
    };
    verification: {
        ok: boolean;
        tasks: Array<{
            title: string;
            assignee_email: string | null;
            actual_progress_pct: number | null;
            expected_progress_pct: number | null;
            variance_pct: number | null;
            health_status: string | null;
            schedule_status: string | null;
        }>;
    };
};

let TEAM_DEMO_SESSION: AuthSession | null = null;
let TEAM_DEMO_REPORT: TeamDemoReport | null = null;

function formatPercent(value: number | null) {
    if (value === null || !Number.isFinite(value)) return "—";
    return `${Math.round(value)}%`;
}

function formatVariance(value: number | null) {
    if (value === null || !Number.isFinite(value)) return "—";
    const rounded = Math.round(value);
    return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function toHealthLabel(value: string | null) {
    switch (value) {
        case "ahead":
            return "Ahead";
        case "on_track":
            return "On Track";
        case "at_risk":
            return "At Risk";
        case "critical":
            return "Critical";
        case "needs_plan":
            return "Needs Plan";
        default:
            return "Unknown";
    }
}

function toAssigneeName(email: string | null) {
    if (!email) return "—";
    const localPart = email.split("@")[0] ?? "";
    return localPart
        .split(".")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

function escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function expectNear(received: number | null | undefined, expected: number | null | undefined, tolerance = 1) {
    if (received === null || received === undefined || expected === null || expected === undefined) {
        expect(received).toBe(expected);
        return;
    }
    expect(Math.abs(received - expected)).toBeLessThanOrEqual(tolerance);
}

async function selectProject(page: Page, projectName: string) {
    const projectCombobox = page.getByTestId("tasks-project-combobox");
    const currentLabel = (await projectCombobox.textContent().catch(() => "")) ?? "";
    if (currentLabel.includes(projectName)) return;

    await projectCombobox.click();
    await page.getByRole("option", { name: new RegExp(`^${escapeRegex(projectName)}$`) }).click();
    await expect(projectCombobox).toContainText(projectName);
}

test.describe("tasks derived health", () => {
    test.describe.configure({ mode: "serial" });
    test.skip(
        ({ browserName }) => !AUTH_BROWSER_ALLOWLIST.includes(browserName),
        "Auth-heavy e2e runs only on: " + AUTH_BROWSER_ALLOWLIST.join(", "),
    );

    test.beforeAll(async ({ request }, testInfo) => {
        testInfo.setTimeout(180_000);

        execFileSync(process.execPath, ["scripts/seed-team-demo.mjs"], {
            cwd: process.cwd(),
            stdio: "inherit",
            env: process.env,
        });

        const reportPath = path.resolve(process.cwd(), "artifacts", "team-demo-seed.json");
        TEAM_DEMO_REPORT = JSON.parse(readFileSync(reportPath, "utf8")) as TeamDemoReport;
        if (!TEAM_DEMO_REPORT.verification.ok) {
            throw new Error("team demo seed verification failed");
        }

        const demoPassword = process.env.DEMO_PERSONA_PASSWORD ?? process.env.TEST_PASSWORD ?? "password123";
        TEAM_DEMO_SESSION = await getOrCreateAuthSessionForCredentials(
            request,
            "demo.project.owner@example.com",
            demoPassword,
            {
                cacheKey: "team-demo-project-owner",
                purpose: "tasks derived health",
            },
        );
    });

    test.beforeEach(async ({ page }) => {
        if (!TEAM_DEMO_SESSION) {
            throw new Error("Tasks derived-health auth session is not initialized.");
        }
        await seedAuthState(page, TEAM_DEMO_SESSION);
    });

    test("live task API exposes derived progress and health values for planned tasks", async ({ request }) => {
        if (!TEAM_DEMO_SESSION || !TEAM_DEMO_REPORT) {
            throw new Error("Tasks derived-health test state is not initialized.");
        }

        const projectId = TEAM_DEMO_REPORT.project.id;
        const response = await request.get(`/api/projects/${projectId}/tasks?page=1&per_page=100&sort_by=title&sort_dir=asc`, {
            headers: {
                Authorization: `Bearer ${TEAM_DEMO_SESSION.token}`,
            },
        });

        expect(response.ok()).toBeTruthy();
        const payload = await response.json();
        const tasks = Array.isArray(payload) ? payload : (Array.isArray(payload?.tasks) ? payload.tasks : []);

        const byTitle = new Map(tasks.map((task) => [task.title, task]));
        const reportTasks = new Map(TEAM_DEMO_REPORT.verification.tasks.map((task) => [task.title, task]));

        const plannedTitles = [
            "[team-demo] Requirements baseline review",
            "[team-demo] Member API contract update",
            "[team-demo] Tasks responsive polish",
            "[team-demo] Intern bugfix support bundle",
        ];

        for (const title of plannedTitles) {
            const task = byTitle.get(title);
            const reportTask = reportTasks.get(title);
            expect(task, `${title} should exist in live task API`).toBeTruthy();
            expect(reportTask, `${title} should exist in demo report`).toBeTruthy();
            expect(task.expected_progress_pct, `${title} should derive expected progress`).not.toBeNull();
            expect(task.variance_pct, `${title} should derive variance`).not.toBeNull();
            expect(task.health_status, `${title} should derive health`).not.toBe("needs_plan");
            expectNear(task.expected_progress_pct, reportTask?.expected_progress_pct, 1);
            expectNear(task.variance_pct, reportTask?.variance_pct, 1);
            expect(task.health_status).toBe(reportTask?.health_status);
            expect(task.schedule_status).toBe(reportTask?.schedule_status);
        }

        const undated = byTitle.get("[team-demo] Project sign-off checkpoint");
        expect(undated).toBeTruthy();
        expect(undated?.expected_progress_pct).toBeNull();
        expect(undated?.variance_pct).toBeNull();
        expect(undated?.health_status).toBe("needs_plan");
        expect(undated?.schedule_status).toBe("not_specified");
    });

    test("tasks list renders backend-derived expected, variance, and health values", async ({ page }) => {
        if (!TEAM_DEMO_REPORT) {
            throw new Error("Tasks derived-health report is not initialized.");
        }

        await page.goto("/tasks", { waitUntil: "domcontentloaded" });
        await selectProject(page, TEAM_DEMO_REPORT.project.name);
        await page.getByTestId("tasks-search-input").fill("[team-demo]");
        await expect(page.getByRole("row", { name: /\[team-demo\]/ })).toHaveCount(5, { timeout: 15_000 });

        const requirements = TEAM_DEMO_REPORT.verification.tasks.find((task) => task.title === "[team-demo] Requirements baseline review");
        const overdue = TEAM_DEMO_REPORT.verification.tasks.find((task) => task.title === "[team-demo] Member API contract update");
        const undated = TEAM_DEMO_REPORT.verification.tasks.find((task) => task.title === "[team-demo] Project sign-off checkpoint");

        if (!requirements || !overdue || !undated) {
            throw new Error("Expected seeded tasks are missing from team demo report.");
        }

        const requirementsRow = page.getByRole("row", { name: new RegExp(escapeRegex(requirements.title)) });
        await expect(requirementsRow).toContainText(toAssigneeName(requirements.assignee_email));
        await expect(requirementsRow).toContainText(formatPercent(requirements.expected_progress_pct));
        await expect(requirementsRow).toContainText(formatPercent(requirements.actual_progress_pct));
        await expect(requirementsRow).toContainText(formatVariance(requirements.variance_pct));
        await expect(requirementsRow).toContainText(toHealthLabel(requirements.health_status));

        const overdueRow = page.getByRole("row", { name: new RegExp(escapeRegex(overdue.title)) });
        await expect(overdueRow).toContainText("Overdue");
        await expect(overdueRow).toContainText(formatPercent(overdue.expected_progress_pct));
        await expect(overdueRow).toContainText(formatVariance(overdue.variance_pct));
        await expect(overdueRow).toContainText(toHealthLabel(overdue.health_status));

        const undatedRow = page.getByRole("row", { name: new RegExp(escapeRegex(undated.title)) });
        await expect(undatedRow).toContainText("Not specified");
        await expect(undatedRow).toContainText("Needs Plan");
        await expect(undatedRow).toContainText("—");
    });
});
