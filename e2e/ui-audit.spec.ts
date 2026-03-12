import fs from "node:fs/promises";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
    UI_AUDIT_CONFIG,
    getViewportTargetSize,
    type UiAuditRoute,
    type UiAuditTheme,
    type UiAuditViewport,
} from "../scripts/ui-audit/config";

type UiAuditSeverity = "P0" | "P1" | "P2" | "P3";

type RuntimeFinding = {
    id: string;
    source: "runtime";
    ruleId: string;
    severity: UiAuditSeverity;
    route: string;
    theme: UiAuditTheme;
    viewport: UiAuditViewport;
    file: null;
    line: null;
    message: string;
    evidence: Record<string, unknown>;
};

type RuntimeObservation = {
    route: string;
    theme: UiAuditTheme;
    viewport: UiAuditViewport;
    states: {
        loadingVisible: boolean;
        emptyVisible: boolean;
        errorVisible: boolean;
    };
    metrics: {
        hasHorizontalOverflow: boolean;
        smallTargetCount: number;
        unlabeledButtonCount: number;
        overflowingTableCount: number;
        truncationRiskCount: number;
        focusedElementHasVisibleRing: boolean | null;
        searchSurfaceOpened?: boolean;
        searchSurfaceSmallTargetCount?: number;
        searchSurfaceUnlabeledButtonCount?: number;
        searchSurfaceHasHorizontalOverflow?: boolean;
        tasksPrimaryControlCount?: number;
        tasksTelemetryHasIntentLabel?: boolean;
        tasksTelemetryHasPassiveExitLabel?: boolean;
        rbacControlCount?: number;
        rbacBasicModeVisible?: boolean;
        rbacAdvancedMatrixVisible?: boolean;
        rbacMatrixHasHorizontalOverflow?: boolean;
    };
};

type RouteSpecificMetrics = {
    tasksPrimaryControlCount?: number;
    tasksTelemetryHasIntentLabel?: boolean;
    tasksTelemetryHasPassiveExitLabel?: boolean;
    rbacControlCount?: number;
    rbacBasicModeVisible?: boolean;
    rbacAdvancedMatrixVisible?: boolean;
    rbacMatrixHasHorizontalOverflow?: boolean;
};

const artifactsDir = path.resolve(process.cwd(), "artifacts", "ui-audit");
const screenshotsDir = path.join(artifactsDir, "screenshots");
const outputFile = path.join(artifactsDir, "findings.runtime.json");
const runtimeMode = process.env.UI_AUDIT_MODE ?? "full";
const auditRunId = process.env.UI_AUDIT_RUN_ID ?? `runtime-${Date.now()}`;
const strictApiMocking = process.env.UI_AUDIT_STRICT_API_MOCK !== "0";

const SESSION = {
    token: process.env.PLAYWRIGHT_AUTH_TOKEN ?? "ui-audit-token",
    user: {
        id: process.env.PLAYWRIGHT_USER_ID ?? "ui-audit-user",
        name: process.env.PLAYWRIGHT_USER_NAME ?? "UI Audit User",
        email: process.env.PLAYWRIGHT_USER_EMAIL ?? "ui-audit@example.com",
    },
    permissions: ["progress.view", "user.manage", "role.manage", "permission.manage"],
};

const AUDIT_PROJECTS = [
    {
        id: "project-alpha",
        name: "Audit Project Alpha",
        description: "Audit baseline project for dashboard route validation.",
        theme_color: "#0ea5a4",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        user_id: SESSION.user.id,
    },
    {
        id: "project-beta",
        name: "Audit Project Beta",
        description: "Secondary project for chart scaling checks.",
        theme_color: "#0284c7",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        user_id: SESSION.user.id,
    },
];

const AUDIT_TASKS_BY_PROJECT: Record<string, Array<Record<string, unknown>>> = {
    "project-alpha": [
        {
            id: "task-alpha-1",
            project_id: "project-alpha",
            title: "Define requirements",
            description: "Define scope and acceptance criteria.",
            status: "in_progress",
            progress: 58,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
            due_date: "2026-03-20T00:00:00Z",
        },
    ],
    "project-beta": [
        {
            id: "task-beta-1",
            project_id: "project-beta",
            title: "Implement feature",
            description: "Implement baseline UI integration.",
            status: "pending",
            progress: 20,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
            due_date: "2026-03-28T00:00:00Z",
        },
    ],
};

const AUDIT_SCOPES = [
    {
        permissions: ["task.create", "task.update", "project.read"],
        project_id: "project-alpha",
        project_name: "Audit Project Alpha",
        access_role_id: "role-system-analyst",
        access_role_name: "System Analyst",
        resource_roles: [{ id: "resource-system-analyst", name: "system_analyst" }],
    },
    {
        permissions: ["task.create", "project.read"],
        project_id: "project-beta",
        project_name: "Audit Project Beta",
        access_role_id: "role-team-member",
        access_role_name: "Team Member",
        resource_roles: [{ id: "resource-backend-engineer", name: "backend_engineer" }],
    },
];

const AUDIT_PORTFOLIO_SUMMARY = {
    data_status: "ok" as const,
    metric_supported: true,
    avg_actual_pct: 51,
    avg_planned_pct: 49,
    avg_variance_pct: 2,
    decline_count: 0,
    lag_count: 0,
    log_count: 2,
    maturity_count: 0,
    metric: "progress" as const,
    project_count: AUDIT_PROJECTS.length,
    projects: [
        {
            actual_pct: 58,
            elapsed_time_pct: 54,
            last_updated_at: "2026-03-10T00:00:00Z",
            planned_pct: 52,
            project_id: "project-alpha",
            project_name: "Audit Project Alpha",
            rule_50_70_pass: true,
            rule_50_70_status: "pass",
            stage: "log",
            variance_pct: 6,
        },
        {
            actual_pct: 44,
            elapsed_time_pct: 49,
            last_updated_at: "2026-03-10T00:00:00Z",
            planned_pct: 46,
            project_id: "project-beta",
            project_name: "Audit Project Beta",
            rule_50_70_pass: false,
            rule_50_70_status: "warning",
            stage: "log",
            variance_pct: -2,
        },
    ],
};

function makeProjectDashboard(projectId: string, metric: "progress" | "hours" | "cost") {
    const project = AUDIT_PROJECTS.find((item) => item.id === projectId) ?? AUDIT_PROJECTS[0];
    const metricSupported = metric === "progress";
    return {
        metric,
        metric_supported: metricSupported,
        data_status: metricSupported ? "ok" : "unsupported_metric",
        unit: metric === "hours" ? "hours" : "%",
        currency: metric === "cost" ? "USD" : null,
        project,
        plan: [
            {
                id: `${project.id}-plan-1`,
                project_id: project.id,
                planned_progress: 25,
                date: "2026-02-01T00:00:00Z",
                created_at: "2026-02-01T00:00:00Z",
                updated_at: "2026-02-01T00:00:00Z",
            },
            {
                id: `${project.id}-plan-2`,
                project_id: project.id,
                planned_progress: 52,
                date: "2026-03-01T00:00:00Z",
                created_at: "2026-03-01T00:00:00Z",
                updated_at: "2026-03-01T00:00:00Z",
            },
        ],
        actual: [
            { date: "2026-02-01", actual: 22 },
            { date: "2026-03-01", actual: project.id === "project-alpha" ? 58 : 44 },
        ],
        metric_plan: metricSupported
            ? [
                { date: "2026-02-01", value: 25 },
                { date: "2026-03-01", value: 52 },
            ]
            : [],
        metric_actual: metricSupported
            ? [
                { date: "2026-02-01", value: 22 },
                { date: "2026-03-01", value: project.id === "project-alpha" ? 58 : 44 },
            ]
            : [],
    };
}

function makeProjectHealth(metric: "progress" | "hours" | "cost") {
    if (metric === "hours" || metric === "cost") {
        return {
            data_status: "unsupported_metric",
            actual_pct: null,
            elapsed_time_pct: null,
            last_updated_at: "2026-03-10T00:00:00Z",
            metric,
            metric_supported: false,
            planned_pct: null,
            rule_50_70_pass: null,
            rule_50_70_status: "unsupported_metric",
            stage: null,
            variance_pct: null,
        };
    }
    return {
        data_status: "ok",
        actual_pct: 58,
        elapsed_time_pct: 54,
        last_updated_at: "2026-03-10T00:00:00Z",
        metric,
        metric_supported: true,
        planned_pct: 52,
        rule_50_70_pass: true,
        rule_50_70_status: "pass",
        stage: "log",
        variance_pct: 6,
    };
}

const findings: RuntimeFinding[] = [];
const observations: RuntimeObservation[] = [];
let findingCounter = 1;
let screenshotCounter = 0;

function nextFindingId() {
    const id = `RUNTIME-${String(findingCounter).padStart(4, "0")}`;
    findingCounter += 1;
    return id;
}

function slug(input: string): string {
    return input
        .replace(/[^a-zA-Z0-9-_]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase();
}

async function ensureDir(dirPath: string) {
    await fs.mkdir(dirPath, { recursive: true });
}

async function setAuthSession(page: Page) {
    await page.addInitScript((session) => {
        window.localStorage.setItem("token", session.token);
        window.localStorage.setItem("user", JSON.stringify(session.user));
        window.localStorage.setItem("permissions", JSON.stringify(session.permissions));
    }, SESSION);
}

async function installAuditApiMocks(page: Page) {
    await page.route("**/*", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const { pathname } = url;
        const method = request.method();

        if (!pathname.startsWith("/api/")) {
            await route.continue();
            return;
        }

        const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
            route.fulfill({
                status,
                contentType: "application/json",
                headers,
                body: JSON.stringify(body),
            });

        if (pathname === "/api/auth/me" && method === "GET") {
            return json(SESSION.user);
        }

        if (/^\/api\/rbac\/users\/[^/]+\/effective-permissions$/.test(pathname) && method === "GET") {
            return json({
                user_id: SESSION.user.id,
                roles: [{ id: "role-admin", name: "admin" }],
                permissions: SESSION.permissions,
            });
        }

        if (pathname === "/api/projects" && method === "GET") {
            return json(AUDIT_PROJECTS);
        }

        if (/^\/api\/projects\/[^/]+\/tasks$/.test(pathname) && method === "GET") {
            const projectId = pathname.split("/")[3] ?? "";
            return json(AUDIT_TASKS_BY_PROJECT[projectId] ?? []);
        }

        if (/^\/api\/projects\/[^/]+\/dependencies$/.test(pathname) && method === "GET") {
            return json([]);
        }

        if (/^\/api\/projects\/[^/]+\/critical-path$/.test(pathname) && method === "GET") {
            return json({ task_ids: [] });
        }

        if (/^\/api\/projects\/[^/]+\/dashboard$/.test(pathname) && method === "GET") {
            const projectId = pathname.split("/")[3] ?? "";
            const metricParam = url.searchParams.get("metric");
            const metric = metricParam === "hours" || metricParam === "cost" ? metricParam : "progress";
            return json(makeProjectDashboard(projectId, metric));
        }

        if (/^\/api\/projects\/[^/]+\/s-curve\/health$/.test(pathname) && method === "GET") {
            const metricParam = url.searchParams.get("metric");
            const metric = metricParam === "hours" || metricParam === "cost" ? metricParam : "progress";
            return json(makeProjectHealth(metric));
        }

        if (pathname === "/api/users" && method === "GET") {
            return json([], 200, { "x-total-count": "0" });
        }

        if (pathname === "/api/users/me/projects" && method === "GET") {
            return json(AUDIT_SCOPES);
        }

        if (pathname === "/api/portfolio/s-curve/summary" && method === "GET") {
            const metricParam = url.searchParams.get("metric");
            const metric = metricParam === "hours" || metricParam === "cost" ? metricParam : "progress";
            return json({
                ...AUDIT_PORTFOLIO_SUMMARY,
                metric,
                metric_supported: metric === "progress",
                data_status: metric === "progress" ? "ok" : "unsupported_metric",
            });
        }

        if (pathname === "/api/rbac/roles" && method === "GET") {
            return json([]);
        }

        if (pathname === "/api/rbac/permissions" && method === "GET") {
            return json([]);
        }

        if (/^\/api\/rbac\/roles\/[^/]+\/permissions$/.test(pathname) && method === "GET") {
            return json([]);
        }

        if (/^\/api\/rbac\/users\/[^/]+\/roles$/.test(pathname) && method === "GET") {
            return json([]);
        }

        if (pathname === "/api/rbac/audit-logs" && method === "GET") {
            return json({ items: [], total: 0, page: 1, per_page: 10 });
        }

        if (strictApiMocking) {
            return route.fulfill({
                status: 501,
                contentType: "application/json",
                body: JSON.stringify({
                    error: "ui-audit-unmocked-endpoint",
                    method,
                    pathname,
                }),
            });
        }

        return json({});
    });
}

async function applyTheme(page: Page, theme: UiAuditTheme) {
    await page.evaluate((nextTheme) => {
        const html = document.documentElement;
        const body = document.body;
        html.classList.remove("dark", "theme-glass");
        body.classList.remove("dark", "theme-glass");
        if (nextTheme === "dark") {
            html.classList.add("dark");
        }
        if (nextTheme === "glass") {
            html.classList.add("theme-glass");
        }
    }, theme);
}

async function screenshotPathFor(routeLabel: string, theme: UiAuditTheme, viewport: UiAuditViewport, state: string) {
    const routeSegment = slug(routeLabel);
    const filePath = path.join(
        screenshotsDir,
        routeSegment,
        theme,
        `${viewport}-${state}.png`,
    );
    await ensureDir(path.dirname(filePath));
    return filePath;
}

async function captureFocusState(page: Page) {
    for (let attempt = 1; attempt <= 8; attempt += 1) {
        await page.keyboard.press("Tab");
        const focusState = await page.evaluate(() => {
            const active = document.activeElement as HTMLElement | null;
            if (!active || active === document.body || active === document.documentElement) {
                return {
                    hasVisibleRing: null,
                    tagName: active?.tagName ?? null,
                    className: active?.className ?? "",
                    reason: "root-focus",
                };
            }
            const style = window.getComputedStyle(active);
            const outlineVisible = style.outlineStyle !== "none" && style.outlineWidth !== "0px";
            const ringVisible = style.boxShadow !== "none";
            const borderVisible = Number.parseFloat(style.borderWidth || "0") > 1 && style.borderStyle !== "none";
            return {
                hasVisibleRing: outlineVisible || ringVisible || borderVisible,
                tagName: active.tagName,
                className: active.className,
                reason: "focusable",
            };
        });

        if (focusState.reason === "focusable") {
            return focusState;
        }
    }

    return {
        hasVisibleRing: null,
        tagName: null,
        className: "",
        reason: "no-focusable",
    };
}

async function collectRuntimeMetrics(page: Page, minTargetSize: number) {
    return await page.evaluate((minTarget) => {
        const isVisible = (element: Element) => {
            if (!(element instanceof HTMLElement)) return false;
            const style = window.getComputedStyle(element);
            if (style.visibility === "hidden" || style.display === "none") return false;
            if (style.opacity === "0" || style.pointerEvents === "none") return false;
            // Skip screen-reader-only elements unless currently focused.
            if (
                element.classList.contains("sr-only")
                && !element.matches(":focus")
                && !element.matches(":focus-visible")
            ) {
                return false;
            }
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        };

        const interactiveSelector = [
            "button",
            "a[href]",
            "input:not([type=hidden])",
            "select",
            "textarea",
            "[role='button']",
            "[tabindex]:not([tabindex='-1'])",
        ].join(", ");

        const interactive = Array.from(document.querySelectorAll(interactiveSelector))
            .filter(isVisible)
            .slice(0, 500);

        const smallTargets = interactive
            .map((element) => {
                const rect = element.getBoundingClientRect();
                return {
                    tag: element.tagName.toLowerCase(),
                    className: (element as HTMLElement).className,
                    ariaLabel: element.getAttribute("aria-label"),
                    width: Number(rect.width.toFixed(2)),
                    height: Number(rect.height.toFixed(2)),
                };
            })
            .filter((entry) => entry.width < minTarget || entry.height < minTarget);

        const buttonLike = interactive.filter((element) =>
            element.tagName === "BUTTON" || element.getAttribute("role") === "button",
        );

        const unlabeledButtons = buttonLike
            .map((element) => {
                const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
                return {
                    tag: element.tagName.toLowerCase(),
                    className: (element as HTMLElement).className,
                    ariaLabel: element.getAttribute("aria-label"),
                    ariaLabelledBy: element.getAttribute("aria-labelledby"),
                    title: element.getAttribute("title"),
                    testId: element.getAttribute("data-testid"),
                    text,
                };
            })
            .filter((entry) => !entry.ariaLabel && !entry.ariaLabelledBy && !entry.title && entry.text.length === 0);

        const truncationRisks = Array.from(
            document.querySelectorAll<HTMLElement>(".truncate, [class*='line-clamp-']"),
        )
            .filter((element) => element.scrollWidth > element.clientWidth + 1)
            .map((element) => ({
                className: element.className,
                text: (element.textContent ?? "").trim().slice(0, 120),
                hasTitle: element.hasAttribute("title"),
                hasAriaLabel: element.hasAttribute("aria-label"),
            }))
            .filter((entry) => !entry.hasTitle && !entry.hasAriaLabel);

        const overflowingTables = Array.from(document.querySelectorAll("table"))
            .filter(isVisible)
            .map((table) => {
                const container = table.parentElement as HTMLElement | null;
                if (!container) return null;
                if (container.scrollWidth <= container.clientWidth + 1) return null;

                return {
                    tableClassName: (table as HTMLElement).className,
                    containerClassName: container.className,
                    containerClientWidth: Number(container.clientWidth.toFixed(2)),
                    containerScrollWidth: Number(container.scrollWidth.toFixed(2)),
                };
            })
            .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

        const hasHorizontalOverflow = document.documentElement.scrollWidth > window.innerWidth + 1;
        const text = (document.body.innerText || "").toLowerCase();
        const loadingVisible = /(loading|please wait|fetching)/.test(text);
        const emptyVisible = /(no .*found|no data|empty)/.test(text);
        const routeErrorPattern = /(failed to load|something went wrong|unable to .*?(?:load|reach)|network error|try again later)/i;
        const alertTexts = Array.from(document.querySelectorAll<HTMLElement>("[role='alert'], [data-testid*='error']"))
            .filter(isVisible)
            .map((element) => (element.innerText || "").toLowerCase())
            .join(" ");
        const errorVisible = routeErrorPattern.test(alertTexts)
            || (routeErrorPattern.test(text) && /(retry|failed to load|something went wrong)/.test(text));

        return {
            hasHorizontalOverflow,
            smallTargets,
            unlabeledButtons,
            overflowingTables,
            truncationRisks,
            loadingVisible,
            emptyVisible,
            errorVisible,
        };
    }, minTargetSize);
}

async function collectScopedMetrics(page: Page, minTargetSize: number, scopeSelector: string) {
    return await page.evaluate(({ minTarget, selector }) => {
        const scope = document.querySelector(selector);
        if (!(scope instanceof HTMLElement)) {
            return null;
        }

        const isVisible = (element: Element) => {
            if (!(element instanceof HTMLElement)) return false;
            const style = window.getComputedStyle(element);
            if (style.visibility === "hidden" || style.display === "none") return false;
            if (style.opacity === "0" || style.pointerEvents === "none") return false;
            if (
                element.classList.contains("sr-only")
                && !element.matches(":focus")
                && !element.matches(":focus-visible")
            ) {
                return false;
            }
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        };

        const interactiveSelector = [
            "button",
            "a[href]",
            "input:not([type=hidden])",
            "select",
            "textarea",
            "[role='button']",
            "[role='option']",
            "[cmdk-item]",
            "[tabindex]:not([tabindex='-1'])",
        ].join(", ");

        const interactive = Array.from(scope.querySelectorAll(interactiveSelector))
            .filter(isVisible)
            .slice(0, 500);

        const smallTargets = interactive
            .map((element) => {
                const rect = element.getBoundingClientRect();
                return {
                    tag: element.tagName.toLowerCase(),
                    className: (element as HTMLElement).className,
                    ariaLabel: element.getAttribute("aria-label"),
                    testId: element.getAttribute("data-testid"),
                    text: (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80),
                    width: Number(rect.width.toFixed(2)),
                    height: Number(rect.height.toFixed(2)),
                };
            })
            .filter((entry) => entry.width < minTarget || entry.height < minTarget);

        const buttonLike = interactive.filter((element) =>
            element.tagName === "BUTTON" || element.getAttribute("role") === "button",
        );

        const unlabeledButtons = buttonLike
            .map((element) => {
                const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
                return {
                    tag: element.tagName.toLowerCase(),
                    className: (element as HTMLElement).className,
                    ariaLabel: element.getAttribute("aria-label"),
                    ariaLabelledBy: element.getAttribute("aria-labelledby"),
                    title: element.getAttribute("title"),
                    testId: element.getAttribute("data-testid"),
                    text,
                };
            })
            .filter((entry) => !entry.ariaLabel && !entry.ariaLabelledBy && !entry.title && entry.text.length === 0);

        const hasHorizontalOverflow = scope.scrollWidth > scope.clientWidth + 1;

        return {
            smallTargets,
            unlabeledButtons,
            hasHorizontalOverflow,
        };
    }, { minTarget: minTargetSize, selector: scopeSelector });
}

async function collectRouteSpecificMetrics(page: Page, routePath: string): Promise<RouteSpecificMetrics> {
    return await page.evaluate((path) => {
        const isVisible = (element: Element | null) => {
            if (!(element instanceof HTMLElement)) return false;
            const style = window.getComputedStyle(element);
            if (style.visibility === "hidden" || style.display === "none") return false;
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        };

        const countInteractiveControls = (root: Element | null) => {
            if (!root) return 0;
            const selector = [
                "button",
                "a[href]",
                "input:not([type=hidden])",
                "select",
                "textarea",
                "[role='button']",
                "[role='combobox']",
                "[tabindex]:not([tabindex='-1'])",
            ].join(", ");

            return Array.from(root.querySelectorAll(selector))
                .filter((element) => isVisible(element))
                .length;
        };

        if (path === "/tasks") {
            const toolbar = document.querySelector("[data-testid='tasks-primary-toolbar']");
            const telemetrySummary = document.querySelector("[data-testid='tasks-time-to-task-summary']");
            const telemetryText = (telemetrySummary?.textContent ?? "").toLowerCase();

            return {
                tasksPrimaryControlCount: countInteractiveControls(toolbar),
                tasksTelemetryHasIntentLabel: telemetryText.includes("intent completion"),
                tasksTelemetryHasPassiveExitLabel: telemetryText.includes("passive exits"),
            };
        }

        if (path === "/settings/policy") {
            const controlsBar = document.querySelector("[data-testid='rbac-controls-bar']");
            const basicMode = document.querySelector("[data-testid='rbac-mobile-basic-mode']");
            const advancedToggle = document.querySelector("[data-testid='rbac-mobile-close-matrix-button']");
            const matrixScroll = document.querySelector("[data-testid='rbac-matrix-scroll']");

            const matrixVisible = isVisible(matrixScroll);
            const matrixHasHorizontalOverflow = matrixVisible
                ? (matrixScroll instanceof HTMLElement && matrixScroll.scrollWidth > matrixScroll.clientWidth + 1)
                : false;

            return {
                rbacControlCount: countInteractiveControls(controlsBar),
                rbacBasicModeVisible: isVisible(basicMode),
                rbacAdvancedMatrixVisible: isVisible(advancedToggle),
                rbacMatrixHasHorizontalOverflow: matrixHasHorizontalOverflow,
            };
        }

        return {};
    }, routePath);
}

async function auditMenuSearchSurface(
    page: Page,
    route: { path: string; label: string },
    theme: UiAuditTheme,
    viewport: UiAuditViewport,
    minTargetSize: number,
) {
    const isMobile = viewport === "mobile";
    let openedSurfaceTestId: "mobile-menu-search-sheet" | "global-menu-search-dialog" | null = null;

    if (isMobile) {
        const mobileTrigger = page.getByTestId("bottom-nav-search-trigger").first();
        if (await mobileTrigger.count()) {
            await mobileTrigger.click().catch(() => undefined);
            const mobileSheet = page.getByTestId("mobile-menu-search-sheet").first();
            const mobileVisible = await mobileSheet.isVisible().catch(() => false);
            if (mobileVisible) {
                openedSurfaceTestId = "mobile-menu-search-sheet";
            }
        }
    } else {
        const desktopTrigger = page.getByTestId("global-menu-search-trigger").first();
        if (await desktopTrigger.count()) {
            await desktopTrigger.click().catch(() => undefined);
            const globalDialog = page.getByTestId("global-menu-search-dialog").first();
            const globalVisible = await globalDialog.isVisible().catch(() => false);
            if (globalVisible) {
                openedSurfaceTestId = "global-menu-search-dialog";
            }
        }
    }

    if (!openedSurfaceTestId) {
        await page.evaluate(() => {
            window.dispatchEvent(new Event("scurve:open-menu-search"));
        }).catch(() => undefined);
        const globalDialog = page.getByTestId("global-menu-search-dialog").first();
        const globalVisible = await globalDialog.isVisible().catch(() => false);
        if (globalVisible) {
            openedSurfaceTestId = "global-menu-search-dialog";
        }
    }

    if (!openedSurfaceTestId) {
        const bodyPreview = await page.locator("body").innerText()
            .then((text) => text.replace(/\s+/g, " ").trim().slice(0, 220))
            .catch(() => "");
        return {
            smallTargetCount: 0,
            unlabeledButtonCount: 0,
            hasHorizontalOverflow: false,
            opened: false,
            debug: {
                viewport,
                url: page.url(),
                bodyPreview,
            },
        };
    }

    const surface = page.getByTestId(openedSurfaceTestId).first();
    await surface.waitFor({ state: "visible", timeout: 3000 }).catch(() => undefined);

    const scopedMetrics = await collectScopedMetrics(page, minTargetSize, `[data-testid="${openedSurfaceTestId}"]`);
    if (!scopedMetrics) {
        return {
            smallTargetCount: 0,
            unlabeledButtonCount: 0,
            hasHorizontalOverflow: false,
            opened: false,
            debug: {
                viewport,
                url: page.url(),
                bodyPreview: "scope selector not found",
            },
        };
    }

    const searchState = openedSurfaceTestId === "mobile-menu-search-sheet" ? "search-sheet" : "search-dialog";
    const searchPath = await screenshotPathFor(route.label, theme, viewport, searchState);
    await page.screenshot({ path: searchPath, fullPage: true });
    screenshotCounter += 1;

    scopedMetrics.smallTargets.slice(0, 25).forEach((target) => {
        findings.push({
            id: nextFindingId(),
            source: "runtime",
            ruleId: "a11y.target-size",
            severity: "P1",
            route: route.path,
            theme,
            viewport,
            file: null,
            line: null,
            message: "Search menu surface has an interaction target below minimum size threshold.",
            evidence: {
                surface: searchState,
                ...target,
            },
        });
    });

    if (scopedMetrics.unlabeledButtons.length > 0) {
        findings.push({
            id: nextFindingId(),
            source: "runtime",
            ruleId: "a11y.control-name",
            severity: "P1",
            route: route.path,
            theme,
            viewport,
            file: null,
            line: null,
            message: "Search menu surface contains button-like controls without accessible names.",
            evidence: {
                surface: searchState,
                count: scopedMetrics.unlabeledButtons.length,
                samples: scopedMetrics.unlabeledButtons.slice(0, 15),
            },
        });
    }

    if (scopedMetrics.hasHorizontalOverflow) {
        findings.push({
            id: nextFindingId(),
            source: "runtime",
            ruleId: "layout.no-horizontal-overflow",
            severity: "P1",
            route: route.path,
            theme,
            viewport,
            file: null,
            line: null,
            message: "Search menu surface has horizontal overflow.",
            evidence: {
                surface: searchState,
            },
        });
    }

    await page.keyboard.press("Escape").catch(() => undefined);
    await surface.waitFor({ state: "hidden", timeout: 1500 }).catch(() => undefined);

    return {
        smallTargetCount: scopedMetrics.smallTargets.length,
        unlabeledButtonCount: scopedMetrics.unlabeledButtons.length,
        hasHorizontalOverflow: scopedMetrics.hasHorizontalOverflow,
        opened: true,
        debug: null,
    };
}

async function maybeCaptureHoverFocusState(page: Page, routeLabel: string, theme: UiAuditTheme, viewport: UiAuditViewport) {
    const firstInteractive = page.locator("button:visible, a:visible, input:visible, [role='button']:visible").first();
    if (await firstInteractive.count()) {
        await firstInteractive.hover({ force: true }).catch(() => undefined);
    }
    const focus = await captureFocusState(page);
    const hoverPath = await screenshotPathFor(routeLabel, theme, viewport, "hover-focus");
    await page.screenshot({ path: hoverPath, fullPage: true });
    screenshotCounter += 1;
    return focus;
}

async function auditRoute(page: Page, route: UiAuditRoute, theme: UiAuditTheme, viewport: UiAuditViewport) {
    const minTargetSize = getViewportTargetSize(viewport);

    await applyTheme(page, theme);
    await page.waitForTimeout(80);

    const defaultPath = await screenshotPathFor(route.label, theme, viewport, "default");
    await page.screenshot({ path: defaultPath, fullPage: true });
    screenshotCounter += 1;

    const focusState = await maybeCaptureHoverFocusState(page, route.label, theme, viewport);
    const runtimeMetrics = await collectRuntimeMetrics(page, minTargetSize);
    const routeSpecificMetrics = await collectRouteSpecificMetrics(page, route.path);

    if (route.requiresAuth && runtimeMetrics.errorVisible) {
        findings.push({
            id: nextFindingId(),
            source: "runtime",
            ruleId: "audit.route-error-state",
            severity: "P1",
            route: route.path,
            theme,
            viewport,
            file: null,
            line: null,
            message: "Authenticated route rendered with generic error-state copy during baseline audit.",
            evidence: {
                route: route.path,
                viewport,
            },
        });
    }

    if (runtimeMetrics.hasHorizontalOverflow) {
        findings.push({
            id: nextFindingId(),
            source: "runtime",
            ruleId: "layout.no-horizontal-overflow",
            severity: "P1",
            route: route.path,
            theme,
            viewport,
            file: null,
            line: null,
            message: "Horizontal overflow detected in viewport.",
            evidence: { viewport },
        });
    }

    runtimeMetrics.smallTargets.slice(0, 25).forEach((target) => {
        findings.push({
            id: nextFindingId(),
            source: "runtime",
            ruleId: "a11y.target-size",
            severity: "P1",
            route: route.path,
            theme,
            viewport,
            file: null,
            line: null,
            message: "Interactive target is below minimum size threshold.",
            evidence: target,
        });
    });

    if (runtimeMetrics.unlabeledButtons.length > 0) {
        findings.push({
            id: nextFindingId(),
            source: "runtime",
            ruleId: "a11y.control-name",
            severity: "P1",
            route: route.path,
            theme,
            viewport,
            file: null,
            line: null,
            message: "Button-like controls without accessible names detected.",
            evidence: {
                count: runtimeMetrics.unlabeledButtons.length,
                samples: runtimeMetrics.unlabeledButtons.slice(0, 15),
            },
        });
    }

    if (focusState.hasVisibleRing === false) {
        findings.push({
            id: nextFindingId(),
            source: "runtime",
            ruleId: "a11y.focus-visible",
            severity: "P1",
            route: route.path,
            theme,
            viewport,
            file: null,
            line: null,
            message: "Keyboard focus indicator not clearly visible.",
            evidence: focusState,
        });
    }

    runtimeMetrics.truncationRisks.slice(0, 25).forEach((risk) => {
        findings.push({
            id: nextFindingId(),
            source: "runtime",
            ruleId: "content.intentional-truncation",
            severity: "P2",
            route: route.path,
            theme,
            viewport,
            file: null,
            line: null,
            message: "Truncated text without title/aria fallback detected.",
            evidence: risk,
        });
    });

    if (viewport === "mobile" && route.path === "/tasks" && runtimeMetrics.overflowingTables.length > 0) {
        findings.push({
            id: nextFindingId(),
            source: "runtime",
            ruleId: "layout.mobile-primary-content-overflow",
            severity: "P1",
            route: route.path,
            theme,
            viewport,
            file: null,
            line: null,
            message: "Primary mobile task list requires horizontal table panning.",
            evidence: {
                tableCount: runtimeMetrics.overflowingTables.length,
                samples: runtimeMetrics.overflowingTables.slice(0, 10),
            },
        });
    }

    if (
        route.path === "/tasks"
        && viewport === "desktop"
        && typeof routeSpecificMetrics.tasksPrimaryControlCount === "number"
        && routeSpecificMetrics.tasksPrimaryControlCount > 5
    ) {
        findings.push({
            id: nextFindingId(),
            source: "runtime",
            ruleId: "friction.control-density",
            severity: "P1",
            route: route.path,
            theme,
            viewport,
            file: null,
            line: null,
            message: "Tasks primary toolbar exceeds expected control density for the default workflow.",
            evidence: {
                controlCount: routeSpecificMetrics.tasksPrimaryControlCount,
                maxRecommended: 5,
            },
        });
    }

    if (
        route.path === "/tasks"
        && (
            routeSpecificMetrics.tasksTelemetryHasIntentLabel === false
            || routeSpecificMetrics.tasksTelemetryHasPassiveExitLabel === false
        )
    ) {
        findings.push({
            id: nextFindingId(),
            source: "runtime",
            ruleId: "friction.telemetry-signal-quality",
            severity: "P1",
            route: route.path,
            theme,
            viewport,
            file: null,
            line: null,
            message: "Time-to-task summary is missing intent-qualified metric labels.",
            evidence: {
                hasIntentLabel: routeSpecificMetrics.tasksTelemetryHasIntentLabel,
                hasPassiveExitLabel: routeSpecificMetrics.tasksTelemetryHasPassiveExitLabel,
            },
        });
    }

    if (route.path === "/settings/policy" && viewport === "mobile") {
        if (routeSpecificMetrics.rbacBasicModeVisible === false) {
            findings.push({
                id: nextFindingId(),
                source: "runtime",
                ruleId: "friction.control-density",
                severity: "P1",
                route: route.path,
                theme,
                viewport,
                file: null,
                line: null,
                message: "Policy mobile view no longer defaults to basic mode.",
                evidence: {
                    basicModeVisible: routeSpecificMetrics.rbacBasicModeVisible,
                },
            });
        }

        if (routeSpecificMetrics.rbacAdvancedMatrixVisible === true) {
            findings.push({
                id: nextFindingId(),
                source: "runtime",
                ruleId: "friction.control-density",
                severity: "P1",
                route: route.path,
                theme,
                viewport,
                file: null,
                line: null,
                message: "Policy advanced matrix is open by default on mobile.",
                evidence: {
                    advancedMatrixVisible: routeSpecificMetrics.rbacAdvancedMatrixVisible,
                },
            });
        }

        if (routeSpecificMetrics.rbacMatrixHasHorizontalOverflow === true) {
            findings.push({
                id: nextFindingId(),
                source: "runtime",
                ruleId: "layout.mobile-primary-content-overflow",
                severity: "P1",
                route: route.path,
                theme,
                viewport,
                file: null,
                line: null,
                message: "Policy matrix is horizontally overflowing while visible on mobile.",
                evidence: {
                    matrixHasHorizontalOverflow: routeSpecificMetrics.rbacMatrixHasHorizontalOverflow,
                },
            });
        }

        if (
            typeof routeSpecificMetrics.rbacControlCount === "number"
            && routeSpecificMetrics.rbacControlCount > 8
        ) {
            findings.push({
                id: nextFindingId(),
                source: "runtime",
                ruleId: "friction.control-density",
                severity: "P2",
                route: route.path,
                theme,
                viewport,
                file: null,
                line: null,
                message: "Policy controls bar has high control density for mobile.",
                evidence: {
                    controlCount: routeSpecificMetrics.rbacControlCount,
                    maxRecommended: 8,
                },
            });
        }
    }

    let searchSurfaceMetrics = {
        opened: false,
        smallTargetCount: 0,
        unlabeledButtonCount: 0,
        hasHorizontalOverflow: false,
    };

    if (route.path === "/tasks") {
        searchSurfaceMetrics = await auditMenuSearchSurface(
            page,
            route,
            theme,
            viewport,
            minTargetSize,
        );
    }

    observations.push({
        route: route.path,
        theme,
        viewport,
        states: {
            loadingVisible: runtimeMetrics.loadingVisible,
            emptyVisible: runtimeMetrics.emptyVisible,
            errorVisible: runtimeMetrics.errorVisible,
        },
        metrics: {
            hasHorizontalOverflow: runtimeMetrics.hasHorizontalOverflow,
            smallTargetCount: runtimeMetrics.smallTargets.length,
            unlabeledButtonCount: runtimeMetrics.unlabeledButtons.length,
            overflowingTableCount: runtimeMetrics.overflowingTables.length,
            truncationRiskCount: runtimeMetrics.truncationRisks.length,
            focusedElementHasVisibleRing: focusState.hasVisibleRing,
            searchSurfaceOpened: searchSurfaceMetrics.opened,
            searchSurfaceSmallTargetCount: searchSurfaceMetrics.smallTargetCount,
            searchSurfaceUnlabeledButtonCount: searchSurfaceMetrics.unlabeledButtonCount,
            searchSurfaceHasHorizontalOverflow: searchSurfaceMetrics.hasHorizontalOverflow,
            tasksPrimaryControlCount: routeSpecificMetrics.tasksPrimaryControlCount,
            tasksTelemetryHasIntentLabel: routeSpecificMetrics.tasksTelemetryHasIntentLabel,
            tasksTelemetryHasPassiveExitLabel: routeSpecificMetrics.tasksTelemetryHasPassiveExitLabel,
            rbacControlCount: routeSpecificMetrics.rbacControlCount,
            rbacBasicModeVisible: routeSpecificMetrics.rbacBasicModeVisible,
            rbacAdvancedMatrixVisible: routeSpecificMetrics.rbacAdvancedMatrixVisible,
            rbacMatrixHasHorizontalOverflow: routeSpecificMetrics.rbacMatrixHasHorizontalOverflow,
        },
    });

    if (runtimeMode === "visual") {
        return;
    }

    const axeResults = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();

    axeResults.violations
        .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
        .forEach((violation) => {
            findings.push({
                id: nextFindingId(),
                source: "runtime",
                ruleId: "a11y.contrast",
                severity: "P0",
                route: route.path,
                theme,
                viewport,
                file: null,
                line: null,
                message: `A11y violation (${violation.id}): ${violation.help}`,
                evidence: {
                    impact: violation.impact,
                    nodes: violation.nodes.slice(0, 5).map((node) => ({
                        target: node.target,
                        failureSummary: node.failureSummary,
                    })),
                },
            });
        });
}

async function gotoWithRetry(page: Page, routePath: string, attempts = 4) {
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            await page.goto(routePath, { waitUntil: "domcontentloaded" });
            return;
        } catch (error) {
            lastError = error;
            const message = error instanceof Error ? error.message : String(error);
            if (!/connection[_ ]refused|ERR_CONNECTION_REFUSED|NS_ERROR_CONNECTION_REFUSED/i.test(message)) {
                throw error;
            }
            if (attempt === attempts) {
                throw error;
            }
            await page.waitForTimeout(1000 * attempt);
        }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

test.describe.configure({ mode: "serial" });

test("UI audit matrix (authenticated routes)", async ({ page }) => {
    test.setTimeout(20 * 60 * 1000);
    await setAuthSession(page);
    await installAuditApiMocks(page);

    const routes = UI_AUDIT_CONFIG.routes.filter((route) => route.requiresAuth);
    for (const [viewportName, viewportSize] of Object.entries(UI_AUDIT_CONFIG.viewports) as Array<[UiAuditViewport, { width: number; height: number }]>) {
        await page.setViewportSize(viewportSize);
        for (const route of routes) {
            await gotoWithRetry(page, route.path);
            await page.waitForLoadState("networkidle").catch(() => undefined);

            for (const theme of UI_AUDIT_CONFIG.themes) {
                await auditRoute(page, route, theme, viewportName);
            }
        }
    }
});

test("UI audit matrix (public auth routes)", async ({ page }) => {
    test.setTimeout(20 * 60 * 1000);
    const routes = UI_AUDIT_CONFIG.routes.filter((route) => !route.requiresAuth);
    for (const [viewportName, viewportSize] of Object.entries(UI_AUDIT_CONFIG.viewports) as Array<[UiAuditViewport, { width: number; height: number }]>) {
        await page.setViewportSize(viewportSize);
        for (const route of routes) {
            await gotoWithRetry(page, route.path);
            await page.waitForLoadState("networkidle").catch(() => undefined);

            for (const theme of UI_AUDIT_CONFIG.themes) {
                await auditRoute(page, route, theme, viewportName);
            }
        }
    }
});

test("UI audit menu-search surfaces (targeted regression)", async ({ page }) => {
    test.setTimeout(10 * 60 * 1000);
    await setAuthSession(page);
    await installAuditApiMocks(page);

    const route = { path: "/tasks", label: "tasks" };

    for (const [viewportName, viewportSize] of Object.entries(UI_AUDIT_CONFIG.viewports) as Array<[UiAuditViewport, { width: number; height: number }]>) {
        await page.setViewportSize(viewportSize);
        await gotoWithRetry(page, route.path);
        await page.waitForLoadState("networkidle").catch(() => undefined);

        for (const theme of UI_AUDIT_CONFIG.themes) {
            await applyTheme(page, theme);
            await page.waitForTimeout(80);
            const minTargetSize = getViewportTargetSize(viewportName);

            const searchSurfaceMetrics = await auditMenuSearchSurface(
                page,
                route,
                theme,
                viewportName,
                minTargetSize,
            );

            expect(
                searchSurfaceMetrics.opened,
                `Search surface failed to open: ${JSON.stringify(searchSurfaceMetrics.debug ?? {})}`,
            ).toBeTruthy();
        }
    }
});

test.afterAll(async () => {
    await ensureDir(artifactsDir);
    const payload = {
        generatedAt: new Date().toISOString(),
        runId: auditRunId,
        source: "runtime",
        mode: runtimeMode,
        screenshotCount: screenshotCounter,
        findings,
        observations,
        counts: {
            total: findings.length,
            bySeverity: findings.reduce((acc, finding) => {
                acc[finding.severity] = (acc[finding.severity] ?? 0) + 1;
                return acc;
            }, {} as Record<string, number>),
        },
    };
    await fs.writeFile(outputFile, JSON.stringify(payload, null, 2));
    console.log(`[ui-audit] runtime findings written: ${outputFile}`);
    console.log(`[ui-audit] runtime screenshots captured: ${screenshotCounter}`);
});
