import { expect, test, type Page, type Request } from "@playwright/test";

import { getOrCreateAuthSessionForCredentials, seedAuthState, type AuthSession } from "./support/auth-session";

const AUTH_BROWSER_ALLOWLIST = (process.env.PLAYWRIGHT_AUTH_E2E_BROWSERS ?? "chromium")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

const OWNER_EMAIL = "demo.project.owner@example.com";
const JIMMY_EMAIL = "jimmy@dwp.co.id";
const SHARED_PASSWORD = process.env.TEST_PASSWORD ?? "password123";

let ownerSession: AuthSession | null = null;
let jimmySession: AuthSession | null = null;

async function openTasks(page: Page) {
    await page.goto("/tasks", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("tasks-project-combobox")).toBeVisible({ timeout: 15_000 });
}

function isTelemetryRequest(request: Request) {
    return request.method() === "POST" && request.url().includes("/api/telemetry/events");
}

test.describe("tasks telemetry auth switch", () => {
    test.skip(
        ({ browserName }) => !AUTH_BROWSER_ALLOWLIST.includes(browserName),
        "Auth-heavy e2e runs only on: " + AUTH_BROWSER_ALLOWLIST.join(", "),
    );

    test.beforeAll(async ({ request }) => {
        ownerSession = await getOrCreateAuthSessionForCredentials(
            request,
            OWNER_EMAIL,
            SHARED_PASSWORD,
            {
                cacheKey: "tasks-auth-switch-owner",
                purpose: "tasks auth switch owner",
            },
        );

        jimmySession = await getOrCreateAuthSessionForCredentials(
            request,
            JIMMY_EMAIL,
            SHARED_PASSWORD,
            {
                cacheKey: "tasks-auth-switch-jimmy",
                purpose: "tasks auth switch jimmy",
            },
        );
    });

    test("switching users does not send stale-user telemetry batches when Tasks opens", async ({ page }) => {
        if (!ownerSession || !jimmySession) {
            throw new Error("Auth sessions were not initialized.");
        }

        await seedAuthState(page, ownerSession);
        await openTasks(page);

        await seedAuthState(page, jimmySession);

        const telemetryStatuses: number[] = [];
        const telemetryRequests: Array<{ status: number | null; body: string | null }> = [];

        const requestHandler = (request: Request) => {
            if (!isTelemetryRequest(request)) return;
            telemetryRequests.push({
                status: null,
                body: request.postData(),
            });
        };

        const responseHandler = async (response: { url(): string; request(): Request; status(): number }) => {
            if (!isTelemetryRequest(response.request())) return;
            const status = response.status();
            telemetryStatuses.push(status);
            const matchingRequest = telemetryRequests.find(
                (entry) => entry.body === response.request().postData() && entry.status === null,
            );
            if (matchingRequest) {
                matchingRequest.status = status;
            }
        };

        page.on("request", requestHandler);
        page.on("response", responseHandler);

        try {
            await openTasks(page);
            await page.waitForTimeout(2500);
        } finally {
            page.off("request", requestHandler);
            page.off("response", responseHandler);
        }

        expect(telemetryStatuses.length).toBeGreaterThan(0);
        expect(telemetryStatuses).toEqual(
            expect.not.arrayContaining([400, 401, 403, 422]),
        );

        const telemetryUserSets = telemetryRequests.map((entry) => {
            if (!entry.body) return [];
            const parsed = JSON.parse(entry.body) as {
                events?: Array<{ user_id?: string }>;
            };
            return (parsed.events ?? [])
                .map((event) => event.user_id)
                .filter((userId): userId is string => typeof userId === "string" && userId.length > 0);
        });

        expect(telemetryUserSets.flat().length).toBeGreaterThan(0);
        telemetryUserSets.forEach((userIds) => {
            expect(new Set(userIds).size).toBeLessThanOrEqual(1);
        });
        expect(
            telemetryUserSets.some((userIds) => userIds.includes(jimmySession.user.id)),
        ).toBeTruthy();
    });
});
