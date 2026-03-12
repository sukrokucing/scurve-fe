import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { parse } from "yaml";

const DEFAULT_INPUT = "business_flow.yaml";
const DEFAULT_OUTPUT = "e2e/generated/business-flow.generated.spec.ts";
const DEFAULT_BASE_URL = "http://localhost:3001";

function toArray(value) {
    if (Array.isArray(value)) return value;
    if (value == null) return [];
    return [value];
}

function hasValue(value) {
    return value !== undefined && value !== null;
}

function deepMerge(base, override) {
    if (typeof base !== "object" || base == null) return override;
    if (typeof override !== "object" || override == null) return override ?? base;
    const merged = { ...base };
    for (const [key, value] of Object.entries(override)) {
        if (Array.isArray(value)) {
            merged[key] = value;
            continue;
        }
        if (typeof value === "object" && value != null && typeof merged[key] === "object" && merged[key] != null) {
            merged[key] = deepMerge(merged[key], value);
            continue;
        }
        merged[key] = value;
    }
    return merged;
}

function resolveStep(rawStep, actionLibrary) {
    const key = rawStep.use ?? rawStep.action;
    if (!key) {
        return { step: rawStep, key: null, unresolved: null };
    }
    const template = actionLibrary[key];
    if (!template) {
        return { step: rawStep, key, unresolved: `Unknown action template "${key}"` };
    }
    const merged = deepMerge(template, rawStep);
    return { step: merged, key, unresolved: null };
}

function js(value) {
    return JSON.stringify(value);
}

function renderStepCode(step, index) {
    const kind = step.kind;
    const stepName = step.description || step.title || `step_${index + 1}`;
    const header = `await test.step(${js(stepName)}, async () => {`;
    const footer = "});";

    const lines = [];
    if (kind === "goto") {
        if (!step.url) throw new Error(`Step "${stepName}" missing "url"`);
        lines.push(`await page.goto(resolveUrl(interpolateString(${js(step.url)}, FLOW_VARS)));`);
    } else if (kind === "click") {
        if (!step.locator) throw new Error(`Step "${stepName}" missing "locator"`);
        lines.push(`await locatorFrom(page, interpolateData(${js(step.locator)}, FLOW_VARS)).click();`);
    } else if (kind === "fill") {
        if (!step.locator) throw new Error(`Step "${stepName}" missing "locator"`);
        if (
            !hasValue(step.value) &&
            !hasValue(step.value_template) &&
            !step.value_from_credential &&
            !step.value_from_env &&
            !step.value_from_variable
        ) {
            throw new Error(
                `Step "${stepName}" requires "value", "value_template", ` +
                `"value_from_variable", "value_from_credential", or "value_from_env"`,
            );
        }
        if (step.value_from_credential) {
            lines.push(
                `await locatorFrom(page, interpolateData(${js(step.locator)}, FLOW_VARS)).fill(` +
                `credential(${js(step.value_from_credential)}));`,
            );
        } else if (step.value_from_env) {
            const envKeys = toArray(step.value_from_env);
            lines.push(
                `await locatorFrom(page, interpolateData(${js(step.locator)}, FLOW_VARS)).fill(` +
                `pickEnv(${js(envKeys)}, ${js(stepName)}));`,
            );
        } else if (step.value_from_variable) {
            lines.push(
                `await locatorFrom(page, interpolateData(${js(step.locator)}, FLOW_VARS)).fill(` +
                `variableValue(${js(step.value_from_variable)}, FLOW_VARS));`,
            );
        } else if (hasValue(step.value_template)) {
            lines.push(
                `await locatorFrom(page, interpolateData(${js(step.locator)}, FLOW_VARS)).fill(` +
                `interpolateString(${js(step.value_template)}, FLOW_VARS));`,
            );
        } else {
            lines.push(
                `await locatorFrom(page, interpolateData(${js(step.locator)}, FLOW_VARS)).fill(` +
                `String(interpolateData(${js(step.value)}, FLOW_VARS)));`,
            );
        }
    } else if (kind === "press") {
        if (!step.locator || !step.key) throw new Error(`Step "${stepName}" requires "locator" and "key"`);
        lines.push(
            `await locatorFrom(page, interpolateData(${js(step.locator)}, FLOW_VARS)).press(` +
            `interpolateString(${js(step.key)}, FLOW_VARS));`,
        );
    } else if (kind === "wait") {
        lines.push(`await page.waitForTimeout(${Number(step.ms ?? 300)});`);
    } else if (kind === "expect_visible") {
        if (!step.locator) throw new Error(`Step "${stepName}" missing "locator"`);
        if (hasValue(step.timeout_ms)) {
            lines.push(
                `await expect(locatorFrom(page, interpolateData(${js(step.locator)}, FLOW_VARS))).toBeVisible(` +
                `{ timeout: ${Number(step.timeout_ms)} });`,
            );
        } else {
            lines.push(`await expect(locatorFrom(page, interpolateData(${js(step.locator)}, FLOW_VARS))).toBeVisible();`);
        }
    } else if (kind === "expect_hidden") {
        if (!step.locator) throw new Error(`Step "${stepName}" missing "locator"`);
        if (hasValue(step.timeout_ms)) {
            lines.push(
                `await expect(locatorFrom(page, interpolateData(${js(step.locator)}, FLOW_VARS))).toBeHidden(` +
                `{ timeout: ${Number(step.timeout_ms)} });`,
            );
        } else {
            lines.push(`await expect(locatorFrom(page, interpolateData(${js(step.locator)}, FLOW_VARS))).toBeHidden();`);
        }
    } else if (kind === "click_if_visible") {
        if (!step.locator) throw new Error(`Step "${stepName}" missing "locator"`);
        lines.push(`const optionalTarget = locatorFrom(page, interpolateData(${js(step.locator)}, FLOW_VARS));`);
        lines.push(
            `if (await optionalTarget.isVisible({ timeout: ${Number(step.timeout_ms ?? 1000)} }).catch(() => false)) {`,
        );
        lines.push("    await optionalTarget.click();");
        lines.push("}");
    } else if (kind === "ensure_visible") {
        if (!step.locator) throw new Error(`Step "${stepName}" missing "locator"`);
        const timeoutMs = Number(step.timeout_ms ?? 1500);
        lines.push(`const ensuredTarget = locatorFrom(page, interpolateData(${js(step.locator)}, FLOW_VARS));`);
        lines.push(
            `if (!(await ensuredTarget.isVisible({ timeout: ${timeoutMs} }).catch(() => false))) {`,
        );
        if (step.open_locator) {
            lines.push(`    await locatorFrom(page, interpolateData(${js(step.open_locator)}, FLOW_VARS)).click();`);
        }
        lines.push("}");
        lines.push(`await expect(ensuredTarget).toBeVisible({ timeout: ${timeoutMs} });`);
    } else if (kind === "ensure_authenticated") {
        lines.push("await ensureAuthenticated(page, request, FLOW_VARS);");
    } else if (kind === "expect_text") {
        if (!step.locator || step.text == null) throw new Error(`Step "${stepName}" requires "locator" and "text"`);
        lines.push(
            `await expect(locatorFrom(page, interpolateData(${js(step.locator)}, FLOW_VARS))).toContainText(` +
            `interpolateData(${js(step.text)}, FLOW_VARS));`,
        );
    } else if (kind === "expect_url") {
        if (step.url_regex) {
            lines.push(`await expect(page).toHaveURL(new RegExp(interpolateString(${js(step.url_regex)}, FLOW_VARS)));`);
        } else if (step.url) {
            lines.push(`await expect(page).toHaveURL(resolveUrl(interpolateString(${js(step.url)}, FLOW_VARS)));`);
        } else {
            throw new Error(`Step "${stepName}" requires "url" or "url_regex"`);
        }
    } else if (kind === "select_option") {
        if (!step.locator || step.value == null) throw new Error(`Step "${stepName}" requires "locator" and "value"`);
        lines.push(
            `await locatorFrom(page, interpolateData(${js(step.locator)}, FLOW_VARS)).selectOption(` +
            `interpolateData(${js(step.value)}, FLOW_VARS));`,
        );
    } else if (kind === "accept_dialog_next") {
        lines.push("page.once('dialog', (dialog) => dialog.accept());");
    } else if (kind === "dismiss_dialog_next") {
        lines.push("page.once('dialog', (dialog) => dialog.dismiss());");
    } else {
        throw new Error(`Unsupported step kind "${kind}" in "${stepName}"`);
    }

    return [header, ...lines.map((line) => `    ${line}`), footer].join("\n");
}

function renderFlowTest(flow, steps, unresolvedReasons) {
    const testName = `${flow.id} ${flow.title || "untitled_flow"}`;
    const needsAuth = flow.module !== "authentication" && flow.require_auth !== false;
    const isAuthFlow = flow.module === "authentication";
    if (unresolvedReasons.length > 0) {
        return [
            `test(${js(testName)}, async ({ page }, testInfo) => {`,
            "    const FLOW_VARS = flowVars(testInfo);",
            `    test.skip(true, ${js(`Flow is not executable yet: ${unresolvedReasons.join("; ")}`)});`,
            `    await page.goto(resolveUrl(interpolateString(${js(flow.route || "/")}, FLOW_VARS)));`,
            "});",
        ].join("\n");
    }

    const lines = [`test(${js(testName)}, async ({ page, request }, testInfo) => {`];
    lines.push("    const FLOW_VARS = flowVars(testInfo);");
    if (isAuthFlow) {
        lines.push("    test.setTimeout(180_000);");
    }
    if (needsAuth) {
        lines.push("    await test.step(\"Ensure authenticated\", async () => {");
        lines.push("        await ensureAuthenticated(page, request, FLOW_VARS);");
        lines.push("    });");
    }
    for (const [index, step] of steps.entries()) {
        const rendered = renderStepCode(step, index).split("\n").map((line) => `    ${line}`);
        lines.push(...rendered);
    }
    if (isAuthFlow) {
        lines.push("    await test.step(\"Cache authenticated session\", async () => {");
        lines.push("        CACHED_AUTH_LOCAL_STORAGE = await captureLocalStorage(page);");
        lines.push("    });");
    }
    lines.push("});");
    return lines.join("\n");
}

function generateSpec({
    sourcePath,
    baseUrl,
    credentialMap,
    variableDefs,
    flows,
    actionLibrary,
}) {
    const tests = [];
    for (const flow of flows) {
        const unresolved = [];
        const resolvedSteps = [];
        for (const rawStep of toArray(flow.steps)) {
            const { step, unresolved: unresolvedReason } = resolveStep(rawStep, actionLibrary);
            if (unresolvedReason) {
                unresolved.push(unresolvedReason);
                continue;
            }
            resolvedSteps.push(step);
        }
        tests.push(renderFlowTest(flow, resolvedSteps, unresolved));
    }

    return `/**
 * AUTO-GENERATED FILE
 * Source: ${sourcePath}
 * Generated by: scripts/generate-scenario-tests.mjs
 */
import { expect, test } from "@playwright/test";
import { getOrCreateAuthSession, seedAuthState as seedSharedAuthState } from "../support/auth-session";

const BASE_URL = process.env.BASE_URL ?? ${js(baseUrl)};
const CREDENTIAL_MAP = ${js(credentialMap)};
const VARIABLE_DEFS = ${js(variableDefs)};

const RUNTIME_VARS = createRuntimeVars();
const SCENARIO_VARS = resolveScenarioVars(VARIABLE_DEFS, RUNTIME_VARS);
let CACHED_AUTH_LOCAL_STORAGE = null;

function createRuntimeVars() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    const runDate = \`\${now.getUTCFullYear()}\${pad(now.getUTCMonth() + 1)}\${pad(now.getUTCDate())}\`;
    const runTime = \`\${pad(now.getUTCHours())}\${pad(now.getUTCMinutes())}\${pad(now.getUTCSeconds())}\`;
    const runTs = String(now.getTime());
    const random = Math.random().toString(36).slice(2, 8);
    return {
        RUN_DATE: runDate,
        RUN_TIME: runTime,
        RUN_TS: runTs,
        RUN_ID: \`\${runDate}\${runTime}-\${random}\`,
    };
}

function resolveScenarioVars(defs, runtimeVars) {
    if (!defs || typeof defs !== "object") return {};

    const resolved = {};
    const resolving = new Set();

    const resolveOne = (name) => {
        if (Object.prototype.hasOwnProperty.call(resolved, name)) {
            return resolved[name];
        }
        if (Object.prototype.hasOwnProperty.call(runtimeVars, name)) {
            return String(runtimeVars[name]);
        }

        const envValue = process.env[name];
        if (envValue != null) {
            return envValue;
        }

        if (!Object.prototype.hasOwnProperty.call(defs, name)) {
            return "\${" + name + "}";
        }
        if (resolving.has(name)) {
            throw new Error(\`Circular variable reference detected at "\${name}"\`);
        }

        resolving.add(name);
        const raw = defs[name];
        let value = "";

        if (typeof raw === "string") {
            value = raw.replace(/\\$\\{([A-Za-z_][A-Za-z0-9_]*)\\}/g, (_, key) => resolveOne(key));
        } else if (raw != null) {
            value = String(raw);
        }

        resolving.delete(name);
        resolved[name] = value;
        return value;
    };

    for (const name of Object.keys(defs)) {
        resolveOne(name);
    }

    return resolved;
}

function variableValue(name, localVars = {}) {
    if (Object.prototype.hasOwnProperty.call(localVars, name)) {
        return String(localVars[name]);
    }
    if (Object.prototype.hasOwnProperty.call(SCENARIO_VARS, name)) {
        return String(SCENARIO_VARS[name]);
    }
    if (Object.prototype.hasOwnProperty.call(RUNTIME_VARS, name)) {
        return String(RUNTIME_VARS[name]);
    }
    const envValue = process.env[name];
    if (envValue != null) return envValue;
    throw new Error(\`Unknown template variable "\${name}"\`);
}

function flowVars(testInfo) {
    const sanitize = (value) =>
        String(value ?? "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "") || "default";
    return {
        PW_PROJECT: sanitize(testInfo?.project?.name),
        PW_WORKER: String(testInfo?.workerIndex ?? "0"),
        PW_RETRY: String(testInfo?.retry ?? "0"),
    };
}

function parseRetryAfter(headers) {
    const raw = headers?.["retry-after"];
    const seconds = Number.parseInt(raw ?? "", 10);
    if (!Number.isFinite(seconds) || seconds <= 0) return null;
    return seconds * 1000;
}

function normalizeSessionUser(rawUser, fallback = {}) {
    const id = typeof rawUser?.id === "string" && rawUser.id
        ? rawUser.id
        : (typeof fallback.id === "string" && fallback.id ? fallback.id : null);
    if (!id) return null;
    const name = typeof rawUser?.name === "string" && rawUser.name
        ? rawUser.name
        : (typeof fallback.name === "string" && fallback.name ? fallback.name : "Playwright User");
    const email = typeof rawUser?.email === "string" && rawUser.email
        ? rawUser.email
        : (typeof fallback.email === "string" && fallback.email ? fallback.email : (id + "@example.local"));
    return { id, name, email };
}

async function seedAuthFromEnvToken(page, request) {
    const envToken = process.env.PLAYWRIGHT_AUTH_TOKEN?.trim();
    if (!envToken) return false;

    const fallbackUser = {
        id: process.env.PLAYWRIGHT_USER_ID,
        name: process.env.PLAYWRIGHT_USER_NAME,
        email: process.env.PLAYWRIGHT_USER_EMAIL,
    };

    let userPayload = null;
    for (let attempt = 1; attempt <= 8; attempt += 1) {
        const meResponse = await request.get("/api/auth/me", {
            headers: { Authorization: "Bearer " + envToken },
        });
        if (meResponse.ok()) {
            userPayload = await meResponse.json();
            break;
        }
        if (meResponse.status() === 401) {
            break;
        }
        const retryAfter = parseRetryAfter(meResponse.headers());
        await page.waitForTimeout(retryAfter ?? 750 * attempt);
    }

    const user = normalizeSessionUser(userPayload, fallbackUser);
    if (!user) return false;

    let permissions = [];
    for (let attempt = 1; attempt <= 6; attempt += 1) {
        const permissionResponse = await request.get("/api/rbac/users/" + user.id + "/effective-permissions", {
            headers: { Authorization: "Bearer " + envToken },
        });
        if (permissionResponse.ok()) {
            const payload = await permissionResponse.json();
            permissions = Array.isArray(payload?.permissions) ? payload.permissions : [];
            break;
        }
        if (permissionResponse.status() === 404 || permissionResponse.status() === 403) {
            break;
        }
        const retryAfter = parseRetryAfter(permissionResponse.headers());
        await page.waitForTimeout(retryAfter ?? 500 * attempt);
    }

    await page.addInitScript((session) => {
        window.localStorage.setItem("token", session.token);
        window.localStorage.setItem("user", JSON.stringify(session.user));
        window.localStorage.setItem("permissions", JSON.stringify(session.permissions));
    }, {
        token: envToken,
        user,
        permissions,
    });
    return true;
}

async function ensureAuthenticated(page, request) {
    if (!CACHED_AUTH_LOCAL_STORAGE) {
        try {
            const sharedSession = await getOrCreateAuthSession(request, "generated flow");
            await seedSharedAuthState(page, sharedSession);
            CACHED_AUTH_LOCAL_STORAGE = {
                token: sharedSession.token,
                user: JSON.stringify(sharedSession.user),
                permissions: JSON.stringify(sharedSession.permissions),
            };
        } catch {
            // Continue with token/env/UI fallbacks below.
        }
    }

    await seedAuthFromEnvToken(page, request);

    if (CACHED_AUTH_LOCAL_STORAGE) {
        await page.addInitScript((entries) => {
            for (const [key, value] of Object.entries(entries)) {
                window.localStorage.setItem(key, String(value));
            }
        }, CACHED_AUTH_LOCAL_STORAGE);
    }

    await page.goto(resolveUrl("/"));

    const email = page.getByRole("textbox", { name: "Email" });
    const password = page.getByRole("textbox", { name: "Password" });
    const submit = page.getByRole("button", { name: "Sign in" });
    const signOutButton = page.getByRole("button", { name: /Sign out/i });
    const dashboardHeading = page.getByRole("heading", { name: /Dashboard/i });
    for (let attempt = 0; attempt < 30; attempt += 1) {
        if (await signOutButton.isVisible({ timeout: 1000 }).catch(() => false)) {
            return;
        }
        if (await dashboardHeading.isVisible({ timeout: 1000 }).catch(() => false)) {
            return;
        }
        if (await email.isVisible({ timeout: 1000 }).catch(() => false)) {
            break;
        }
        await page.waitForTimeout(1000);
    }
    if (!await email.isVisible({ timeout: 1000 }).catch(() => false)) {
        throw new Error("Unable to detect login or authenticated shell state.");
    }

    const rateLimitMessage = page.getByText(/moving too fast|cool down|paused requests temporarily/i);
    for (let attempt = 1; attempt <= 8; attempt += 1) {
        if (await signOutButton.isVisible({ timeout: 1000 }).catch(() => false)) {
            CACHED_AUTH_LOCAL_STORAGE = await captureLocalStorage(page);
            return;
        }
        if (await dashboardHeading.isVisible({ timeout: 1000 }).catch(() => false)) {
            CACHED_AUTH_LOCAL_STORAGE = await captureLocalStorage(page);
            return;
        }

        const submitVisible = await submit.isVisible({ timeout: 1000 }).catch(() => false);
        if (!submitVisible) {
            await page.waitForTimeout(1000 * attempt);
            continue;
        }

        await email.fill(credential("username"));
        await password.fill(credential("password"));
        await submit.click({ timeout: 5000 }).catch(() => {});

        if (await signOutButton.isVisible({ timeout: 15000 }).catch(() => false)) {
            CACHED_AUTH_LOCAL_STORAGE = await captureLocalStorage(page);
            return;
        }
        if (await dashboardHeading.isVisible({ timeout: 15000 }).catch(() => false)) {
            CACHED_AUTH_LOCAL_STORAGE = await captureLocalStorage(page);
            return;
        }

        const isRateLimited = await rateLimitMessage.isVisible({ timeout: 1000 }).catch(() => false);
        if (isRateLimited) {
            await page.waitForTimeout(2500 * attempt);
            continue;
        }
        await page.waitForTimeout(1000 * attempt);
    }

    throw new Error("Unable to authenticate after retries.");
}

async function captureLocalStorage(page) {
    return await page.evaluate(() => {
        const entries = {};
        for (let index = 0; index < window.localStorage.length; index += 1) {
            const key = window.localStorage.key(index);
            if (!key) continue;
            const value = window.localStorage.getItem(key);
            if (value != null) {
                entries[key] = value;
            }
        }
        return entries;
    });
}

function interpolateString(value, localVars = {}) {
    if (typeof value !== "string") return value;
    return value.replace(/\\$\\{([A-Za-z_][A-Za-z0-9_]*)\\}/g, (_, key) => variableValue(key, localVars));
}

function interpolateData(value, localVars = {}) {
    if (typeof value === "string") return interpolateString(value, localVars);
    if (Array.isArray(value)) return value.map((item) => interpolateData(item, localVars));
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value).map(([key, item]) => [key, interpolateData(item, localVars)]),
        );
    }
    return value;
}

function resolveUrl(urlPath) {
    if (!urlPath) return BASE_URL;
    if (/^https?:\\/\\//.test(urlPath)) return urlPath;
    return new URL(urlPath, BASE_URL).toString();
}

function pickEnv(names, label) {
    for (const name of names) {
        const value = process.env[name];
        if (value) return value;
    }
    throw new Error(\`Missing env for \${label}. Tried: \${names.join(", ")}\`);
}

function credential(name) {
    const envNames = CREDENTIAL_MAP[name];
    if (!envNames || !envNames.length) {
        throw new Error(\`Credential mapping not found for "\${name}"\`);
    }
    return pickEnv(envNames, \`credential:\${name}\`);
}

function locatorFrom(page, locator) {
    if (!locator || !locator.by) {
        throw new Error("Invalid locator definition");
    }
    let target;
    switch (locator.by) {
        case "role":
            target = page.getByRole(locator.role, {
                name: locator.name_regex ? new RegExp(locator.name_regex) : locator.name,
                exact: locator.exact,
            });
            break;
        case "label":
            target = page.getByLabel(locator.name);
            break;
        case "text":
            target = page.getByText(locator.text);
            break;
        case "placeholder":
            target = page.getByPlaceholder(locator.text);
            break;
        case "testid":
            target = page.getByTestId(locator.testid);
            break;
        case "css":
            target = page.locator(locator.selector);
            break;
        default:
            throw new Error(\`Unsupported locator.by "\${locator.by}"\`);
    }
    if (locator.first) {
        target = target.first();
    }
    if (typeof locator.nth === "number") {
        target = target.nth(locator.nth);
    }
    return target;
}

const FLOW_BROWSER_ALLOWLIST = (process.env.PLAYWRIGHT_SCENARIO_BROWSERS ?? "chromium")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

test.describe.configure({ mode: "serial" });
test.describe("business_flow_generated", () => {
    test.skip(
        ({ browserName }) => !FLOW_BROWSER_ALLOWLIST.includes(browserName),
        "Scenario flow runs only on: " + FLOW_BROWSER_ALLOWLIST.join(", "),
    );
${tests
    .map((testBlock) =>
        testBlock
            .split("\n")
            .map((line) => `    ${line}`)
            .join("\n"))
    .join("\n\n")}
});
`;
}

async function main() {
    const inputPath = process.argv[2] ?? DEFAULT_INPUT;
    const explicitOutputPath = process.argv[3];
    const sourcePath = path.resolve(process.cwd(), inputPath);
    const raw = await fs.readFile(sourcePath, "utf8");
    const data = parse(raw);

    if (!data || typeof data !== "object") {
        throw new Error("Invalid YAML content.");
    }
    if (!Array.isArray(data.flows)) {
        throw new Error(`"${inputPath}" must contain a top-level "flows" array.`);
    }

    const config = data.config ?? {};
    const outputPath = path.resolve(
        process.cwd(),
        explicitOutputPath ?? config.generated_spec ?? DEFAULT_OUTPUT,
    );
    const baseUrl = config.base_url ?? DEFAULT_BASE_URL;
    const actionLibrary = data.action_library ?? {};
    const variableDefs = data.variables ?? {};

    const credentialsConfig = data.credentials ?? {};
    const credentialMap = Object.fromEntries(
        Object.entries(credentialsConfig).map(([key, value]) => [key, toArray(value.env ?? value)]),
    );

    const generated = generateSpec({
        sourcePath: inputPath,
        baseUrl,
        credentialMap,
        variableDefs,
        flows: data.flows,
        actionLibrary,
    });

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, generated, "utf8");

    console.log(`Generated ${outputPath}`);
    console.log(`Flows: ${data.flows.length}`);
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
