import fs from "node:fs/promises";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { UI_AUDIT_CONFIG, getViewportTargetSize, type UiAuditTheme, type UiAuditViewport } from "../scripts/ui-audit/config";

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
        focusedElementHasVisibleRing: boolean;
        searchSurfaceOpened?: boolean;
        searchSurfaceSmallTargetCount?: number;
        searchSurfaceUnlabeledButtonCount?: number;
        searchSurfaceHasHorizontalOverflow?: boolean;
    };
};

const artifactsDir = path.resolve(process.cwd(), "artifacts", "ui-audit");
const screenshotsDir = path.join(artifactsDir, "screenshots");
const outputFile = path.join(artifactsDir, "findings.runtime.json");
const runtimeMode = process.env.UI_AUDIT_MODE ?? "full";

const SESSION = {
    token: process.env.PLAYWRIGHT_AUTH_TOKEN ?? "ui-audit-token",
    user: {
        id: process.env.PLAYWRIGHT_USER_ID ?? "ui-audit-user",
        name: process.env.PLAYWRIGHT_USER_NAME ?? "UI Audit User",
        email: process.env.PLAYWRIGHT_USER_EMAIL ?? "ui-audit@example.com",
    },
    permissions: ["progress.view", "user.manage", "role.manage", "permission.manage"],
};

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
            return json([]);
        }

        if (/^\/api\/projects\/[^/]+\/tasks$/.test(pathname) && method === "GET") {
            return json([]);
        }

        if (/^\/api\/projects\/[^/]+\/dependencies$/.test(pathname) && method === "GET") {
            return json([]);
        }

        if (/^\/api\/projects\/[^/]+\/critical-path$/.test(pathname) && method === "GET") {
            return json({ task_ids: [] });
        }

        if (pathname === "/api/users" && method === "GET") {
            return json([], 200, { "x-total-count": "0" });
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
    await page.keyboard.press("Tab");
    return await page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null;
        if (!active || active === document.body || active === document.documentElement) {
            return {
                hasVisibleRing: false,
                tagName: active?.tagName ?? null,
                className: active?.className ?? "",
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
        };
    });
}

async function collectRuntimeMetrics(page: Page, minTargetSize: number) {
    return await page.evaluate((minTarget) => {
        const isVisible = (element: Element) => {
            if (!(element instanceof HTMLElement)) return false;
            const style = window.getComputedStyle(element);
            if (style.visibility === "hidden" || style.display === "none") return false;
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
        const errorVisible = /(error|failed|unable to)/.test(text);

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
        return {
            smallTargetCount: 0,
            unlabeledButtonCount: 0,
            hasHorizontalOverflow: false,
            opened: false,
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

async function auditRoute(page: Page, route: { path: string; label: string }, theme: UiAuditTheme, viewport: UiAuditViewport) {
    const minTargetSize = getViewportTargetSize(viewport);

    await applyTheme(page, theme);
    await page.waitForTimeout(80);

    const defaultPath = await screenshotPathFor(route.label, theme, viewport, "default");
    await page.screenshot({ path: defaultPath, fullPage: true });
    screenshotCounter += 1;

    const focusState = await maybeCaptureHoverFocusState(page, route.label, theme, viewport);
    const runtimeMetrics = await collectRuntimeMetrics(page, minTargetSize);

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

    if (!focusState.hasVisibleRing) {
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

test.describe.configure({ mode: "serial" });

test("UI audit matrix (authenticated routes)", async ({ page }) => {
    test.setTimeout(20 * 60 * 1000);
    await setAuthSession(page);

    const routes = UI_AUDIT_CONFIG.routes.filter((route) => route.requiresAuth);
    for (const [viewportName, viewportSize] of Object.entries(UI_AUDIT_CONFIG.viewports) as Array<[UiAuditViewport, { width: number; height: number }]>) {
        await page.setViewportSize(viewportSize);
        for (const route of routes) {
            await page.goto(route.path, { waitUntil: "domcontentloaded" });
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
            await page.goto(route.path, { waitUntil: "domcontentloaded" });
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
        await page.goto(route.path, { waitUntil: "domcontentloaded" });
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

            expect(searchSurfaceMetrics.opened).toBeTruthy();
        }
    }
});

test.afterAll(async () => {
    await ensureDir(artifactsDir);
    const payload = {
        generatedAt: new Date().toISOString(),
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
