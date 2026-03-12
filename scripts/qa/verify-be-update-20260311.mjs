import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import https from "node:https";
import { spawnSync } from "node:child_process";
import axios from "axios";

class SkipError extends Error {
    constructor(message) {
        super(message);
        this.name = "SkipError";
    }
}

const QA_RUN_AT = new Date().toISOString();
const ROOT = process.cwd();
const QA_ARTIFACT_DIR = path.join(ROOT, "artifacts", "qa");
const QA_JSON_PATH = path.join(QA_ARTIFACT_DIR, "fe-qa-checklist-2026-03-11.json");
const QA_MD_PATH = path.join(QA_ARTIFACT_DIR, "fe-qa-checklist-2026-03-11.md");

const TMP = {
    projectId: null,
    taskId: null,
    progressId: null,
    workLogIdForCleanup: null,
    workLogIdForMetrics: null,
    createdResourceRoleId: null,
    addedMemberUserIds: [],
};

function loadEnvFiles() {
    const nodeEnv = process.env.NODE_ENV ?? "development";
    const envFiles = [
        ".env",
        `.env.${nodeEnv}`,
        ".env.local",
        `.env.${nodeEnv}.local`,
    ];

    for (const file of envFiles) {
        const envPath = path.resolve(ROOT, file);
        if (!fs.existsSync(envPath)) continue;
        const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
        for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line || line.startsWith("#")) continue;
            const withoutExport = line.startsWith("export ") ? line.slice(7).trim() : line;
            const separatorIndex = withoutExport.indexOf("=");
            if (separatorIndex <= 0) continue;
            const key = withoutExport.slice(0, separatorIndex).trim();
            if (!key || process.env[key] !== undefined) continue;
            let value = withoutExport.slice(separatorIndex + 1).trim();
            if (
                (value.startsWith("\"") && value.endsWith("\""))
                || (value.startsWith("'") && value.endsWith("'"))
            ) {
                value = value.slice(1, -1);
            }
            process.env[key] = value.replace(/\\n/g, "\n");
        }
    }
}

function normalizeBaseUrl(raw) {
    if (!raw) return "https://localhost:8800";
    return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

function nowStamp() {
    return Date.now().toString(36);
}

function truncate(value, max = 480) {
    const asString = typeof value === "string" ? value : JSON.stringify(value);
    if (!asString) return "";
    return asString.length > max ? `${asString.slice(0, max)}...` : asString;
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function is2xx(status) {
    return status >= 200 && status < 300;
}

function selectTokenFromCache() {
    const cachePath = path.join(ROOT, ".playwright", "auth", "session-default.json");
    if (!fs.existsSync(cachePath)) return null;
    try {
        const parsed = JSON.parse(fs.readFileSync(cachePath, "utf8"));
        if (typeof parsed?.token === "string" && parsed.token.length > 0) {
            return parsed.token;
        }
        return null;
    } catch {
        return null;
    }
}

function buildClient(baseURL) {
    return axios.create({
        baseURL,
        timeout: 30_000,
        validateStatus: () => true,
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    });
}

async function apiCall(client, method, url, options = {}) {
    const headers = {
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        ...(options.headers ?? {}),
    };
    return await client.request({
        method,
        url,
        headers,
        params: options.params,
        data: options.data,
    });
}

async function ensureAuthSession(client) {
    const envToken = process.env.PLAYWRIGHT_AUTH_TOKEN?.trim();
    const cacheToken = selectTokenFromCache();
    const loginEmail = process.env.PLAYWRIGHT_USERNAME?.trim() || process.env.TEST_EMAIL?.trim();
    const loginPassword = process.env.PLAYWRIGHT_PASSWORD?.trim() || process.env.TEST_PASSWORD?.trim();

    const candidates = [envToken, cacheToken].filter(Boolean);
    for (const token of candidates) {
        const me = await apiCall(client, "get", "/auth/me", { token });
        if (is2xx(me.status) && me.data?.id) {
            return { token, user: me.data };
        }
    }

    assert(loginEmail && loginPassword, "Unable to authenticate: missing token and login credentials.");
    const login = await apiCall(client, "post", "/auth/login", {
        data: { email: loginEmail, password: loginPassword },
    });
    assert(is2xx(login.status), `Login failed. status=${login.status} body=${truncate(login.data)}`);
    const token = login.data?.token || login.data?.access_token;
    assert(typeof token === "string" && token.length > 0, "Login response does not include a token.");
    const me = await apiCall(client, "get", "/auth/me", { token });
    assert(is2xx(me.status) && me.data?.id, `Unable to resolve /auth/me for authenticated session. status=${me.status}`);
    return { token, user: me.data };
}

async function registerAndLogin(client, purposePrefix = "qa") {
    const suffix = `${purposePrefix}-${nowStamp()}-${Math.random().toString(36).slice(2, 7)}`;
    const email = `${suffix}@example.com`;
    const password = `Qa!${nowStamp()}Ab1`;
    const name = `QA ${suffix}`;

    const register = await apiCall(client, "post", "/auth/register", {
        data: { email, name, password },
    });
    assert(
        is2xx(register.status) || register.status === 400,
        `Register user failed unexpectedly. status=${register.status} body=${truncate(register.data)}`,
    );

    const login = await apiCall(client, "post", "/auth/login", {
        data: { email, password },
    });
    assert(is2xx(login.status), `Login temp user failed. status=${login.status} body=${truncate(login.data)}`);
    const token = login.data?.token || login.data?.access_token;
    assert(typeof token === "string" && token.length > 0, "Temp login does not include token.");
    const me = await apiCall(client, "get", "/auth/me", { token });
    assert(is2xx(me.status) && me.data?.id, `Temp /auth/me failed. status=${me.status}`);
    return { token, user: me.data, email, password, name };
}

async function listRolesWithPermissions(client, token) {
    const rolesRes = await apiCall(client, "get", "/rbac/roles", { token });
    assert(is2xx(rolesRes.status), `GET /rbac/roles failed. status=${rolesRes.status}`);
    const roles = Array.isArray(rolesRes.data) ? rolesRes.data : [];
    const withPermissions = [];
    for (const role of roles) {
        const permsRes = await apiCall(client, "get", `/rbac/roles/${role.id}/permissions`, { token });
        if (!is2xx(permsRes.status)) continue;
        const permissions = Array.isArray(permsRes.data) ? permsRes.data.map((perm) => perm.name) : [];
        withPermissions.push({ role, permissions });
    }
    return withPermissions;
}

function extractErrorMessage(error) {
    if (!error) return "unknown error";
    if (error instanceof SkipError) return error.message;
    if (error instanceof Error) return error.message;
    return String(error);
}

function toMarkdown(report) {
    const lines = [];
    lines.push("# FE QA Checklist Report (BE update: March 11, 2026)");
    lines.push("");
    lines.push(`- Generated at: ${report.generatedAt}`);
    lines.push(`- Base URL: ${report.baseUrl}`);
    lines.push(`- Overall: ${report.summary.passed}/${report.summary.total} passed, ${report.summary.failed} failed, ${report.summary.skipped} skipped`);
    lines.push("");
    for (const check of report.checks) {
        lines.push(`## ${check.id}. ${check.title}`);
        lines.push(`- Status: **${check.status.toUpperCase()}**`);
        lines.push(`- Duration: ${check.durationMs} ms`);
        if (check.details) {
            lines.push("- Details:");
            if (Array.isArray(check.details)) {
                for (const detail of check.details) lines.push(`  - ${detail}`);
            } else if (typeof check.details === "object") {
                for (const [key, value] of Object.entries(check.details)) {
                    lines.push(`  - ${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`);
                }
            } else {
                lines.push(`  - ${String(check.details)}`);
            }
        }
        if (check.error) {
            lines.push(`- Error: ${check.error}`);
        }
        lines.push("");
    }
    return `${lines.join("\n")}\n`;
}

async function main() {
    loadEnvFiles();
    const baseUrl = normalizeBaseUrl(process.env.VITE_API_URL ?? "https://localhost:8800");
    const client = buildClient(baseUrl);
    const checks = [];
    const cleanupTasks = [];
    const cleanupErrors = [];

    const registerCleanup = (label, fn) => {
        cleanupTasks.push({ label, fn });
    };

    const runCheck = async (id, title, fn) => {
        const startedAt = Date.now();
        try {
            const details = await fn();
            checks.push({
                id,
                title,
                status: "pass",
                durationMs: Date.now() - startedAt,
                details,
            });
        } catch (error) {
            const isSkip = error instanceof SkipError;
            checks.push({
                id,
                title,
                status: isSkip ? "skip" : "fail",
                durationMs: Date.now() - startedAt,
                error: extractErrorMessage(error),
            });
        }
    };

    let session = null;
    let myProjectScopes = [];
    let assignedRoleIds = [];
    let assignedRoleId = null;
    let selectedProjectRoleId = null;
    let selectedProjectRoleDefaultRate = null;
    let selectedProjectRoleCurrency = "USD";
    let accessRolesWithPermissions = [];
    let rateEndpointStatuses = [];
    const workLogEndpointStatuses = [];

    await runCheck("1", "Regenerate client from latest OpenAPI and verify progress payload cleanup", async () => {
        const regen = process.platform === "win32"
            ? spawnSync("cmd.exe", ["/d", "/s", "/c", "npm run -s generate:schemas:remote"], {
                cwd: ROOT,
                encoding: "utf8",
            })
            : spawnSync("npm", ["run", "-s", "generate:schemas:remote"], {
                cwd: ROOT,
                encoding: "utf8",
            });
        assert(
            regen.status === 0,
            `generate:schemas:remote failed (code=${regen.status}, error=${truncate(regen.error?.message ?? "")}). stdout=${truncate(regen.stdout)} stderr=${truncate(regen.stderr)}`,
        );

        const typeFile = await fsp.readFile(path.join(ROOT, "src", "types", "api.d.ts"), "utf8");
        const zodFile = await fsp.readFile(path.join(ROOT, "src", "schemas", "generated", "api-schemas.ts"), "utf8");
        const forbidden = ["actual_hours", "actual_cost"];
        const hits = forbidden.filter((token) => typeFile.includes(token) || zodFile.includes(token));
        assert(hits.length === 0, `Deprecated progress fields still found: ${hits.join(", ")}`);

        return {
            command: "npm run -s generate:schemas:remote",
            forbiddenFieldMatches: hits.length,
        };
    });

    await runCheck("2", "Auth smoke", async () => {
        const health = await apiCall(client, "get", "/api/health");
        assert(health.status === 200, `GET /api/health expected 200, got ${health.status}`);

        const noToken = await apiCall(client, "get", "/projects");
        assert(noToken.status === 401, `GET /projects without token expected 401, got ${noToken.status}`);

        session = await ensureAuthSession(client);
        const withToken = await apiCall(client, "get", "/projects", { token: session.token });
        assert(withToken.status !== 401, "GET /projects with token returned 401 unexpectedly");

        return {
            health: health.status,
            protectedWithoutToken: noToken.status,
            protectedWithToken: withToken.status,
            userId: session.user.id,
        };
    });

    await runCheck("3", "Membership contract update", async () => {
        assert(session?.token, "Missing auth session.");
        const projectsRes = await apiCall(client, "get", "/projects", { token: session.token });
        assert(is2xx(projectsRes.status), `GET /projects failed. status=${projectsRes.status}`);
        const projects = Array.isArray(projectsRes.data) ? projectsRes.data : [];
        assert(projects.length > 0, "No accessible projects found.");
        TMP.projectId = projects[0].id;

        const resourceRolesRes = await apiCall(client, "get", "/resource-roles", { token: session.token });
        assert(is2xx(resourceRolesRes.status), `GET /resource-roles failed. status=${resourceRolesRes.status}`);
        const resourceRoles = Array.isArray(resourceRolesRes.data) ? resourceRolesRes.data : [];
        assert(resourceRoles.length > 0, "No resource roles available.");

        const rolesWithPermissions = await listRolesWithPermissions(client, session.token);
        accessRolesWithPermissions = rolesWithPermissions;
        const teamLikeRole = rolesWithPermissions.find((entry) => /team|member|developer/i.test(entry.role.name))
            ?? rolesWithPermissions[0];
        assert(teamLikeRole?.role?.id, "No access role available for membership contract validation.");

        const tempMember = await registerAndLogin(client, "member-contract");
        const createMemberRes = await apiCall(client, "post", `/projects/${TMP.projectId}/members`, {
            token: session.token,
            data: {
                user_id: tempMember.user.id,
                access_role_id: teamLikeRole.role.id,
                resource_role_ids: [resourceRoles[0].id],
            },
        });
        assert(is2xx(createMemberRes.status), `POST /projects/{project_id}/members failed. status=${createMemberRes.status}`);
        TMP.addedMemberUserIds.push(tempMember.user.id);
        registerCleanup(`remove member ${tempMember.user.id}`, async () => {
            await apiCall(client, "delete", `/projects/${TMP.projectId}/members/${tempMember.user.id}`, { token: session.token });
        });

        const createMemberBody = createMemberRes.data ?? {};
        for (const key of ["access_role_id", "access_role_name", "resource_roles"]) {
            assert(key in createMemberBody, `POST /projects/{id}/members response missing ${key}`);
        }

        const membersRes = await apiCall(client, "get", `/projects/${TMP.projectId}/members`, { token: session.token });
        assert(is2xx(membersRes.status), `GET /projects/{project_id}/members failed. status=${membersRes.status}`);
        const members = Array.isArray(membersRes.data) ? membersRes.data : [];
        const insertedMember = members.find((member) => member.user_id === tempMember.user.id);
        assert(insertedMember, "Created member not found in list members response.");
        for (const key of ["access_role_id", "access_role_name", "resource_roles"]) {
            assert(key in insertedMember, `GET /projects/{id}/members item missing ${key}`);
        }

        const myScopesRes = await apiCall(client, "get", "/users/me/projects", { token: session.token });
        assert(is2xx(myScopesRes.status), `GET /users/me/projects failed. status=${myScopesRes.status}`);
        myProjectScopes = Array.isArray(myScopesRes.data) ? myScopesRes.data : [];
        assert(myProjectScopes.length > 0, "/users/me/projects returned empty list.");
        const firstScope = myProjectScopes[0];
        for (const key of ["access_role_id", "access_role_name", "resource_roles", "permissions"]) {
            assert(key in firstScope, `/users/me/projects item missing ${key}`);
        }

        const invalidMember = await registerAndLogin(client, "member-invalid-contract");
        const invalidLegacyPayloadRes = await apiCall(client, "post", `/projects/${TMP.projectId}/members`, {
            token: session.token,
            data: {
                user_id: invalidMember.user.id,
                role_id: teamLikeRole.role.id,
            },
        });
        assert(
            invalidLegacyPayloadRes.status >= 400,
            `Legacy role_id payload unexpectedly accepted. status=${invalidLegacyPayloadRes.status}`,
        );

        const selectedScope = myProjectScopes.find((scope) => scope.project_id === TMP.projectId) ?? null;
        assignedRoleIds = (selectedScope?.resource_roles ?? []).map((role) => role.id);
        assignedRoleId = assignedRoleIds[0] ?? null;

        return {
            projectId: TMP.projectId,
            createdMemberStatus: createMemberRes.status,
            membersCount: members.length,
            myScopesCount: myProjectScopes.length,
            legacyPayloadStatus: invalidLegacyPayloadRes.status,
            assignedResourceRoleIds: assignedRoleIds,
        };
    });

    await runCheck("4", "Resource role catalog CRUD", async () => {
        assert(session?.token, "Missing auth session.");
        const suffix = `qa-role-${nowStamp()}`;
        const createRes = await apiCall(client, "post", "/resource-roles", {
            token: session.token,
            data: {
                name: suffix,
                description: "FE QA temporary resource role",
                default_hourly_rate: 123.45,
                currency: "USD",
            },
        });
        assert(is2xx(createRes.status), `POST /resource-roles failed. status=${createRes.status}`);
        TMP.createdResourceRoleId = createRes.data?.id;
        registerCleanup(`delete resource role ${TMP.createdResourceRoleId}`, async () => {
            if (!TMP.createdResourceRoleId) return;
            await apiCall(client, "delete", `/resource-roles/${TMP.createdResourceRoleId}`, { token: session.token });
        });

        const listAfterCreate = await apiCall(client, "get", "/resource-roles", { token: session.token });
        assert(is2xx(listAfterCreate.status), `GET /resource-roles failed. status=${listAfterCreate.status}`);
        const createdExists = (listAfterCreate.data ?? []).some((role) => role.id === TMP.createdResourceRoleId);
        assert(createdExists, "Created resource role not visible in list.");

        const updateRes = await apiCall(client, "put", `/resource-roles/${TMP.createdResourceRoleId}`, {
            token: session.token,
            data: {
                name: `${suffix}-updated`,
                description: "Updated by FE QA",
                default_hourly_rate: 150.5,
                currency: "USD",
            },
        });
        assert(is2xx(updateRes.status), `PUT /resource-roles/{id} failed. status=${updateRes.status}`);

        const deleteRes = await apiCall(client, "delete", `/resource-roles/${TMP.createdResourceRoleId}`, {
            token: session.token,
        });
        assert(is2xx(deleteRes.status), `DELETE /resource-roles/{id} failed. status=${deleteRes.status}`);
        TMP.createdResourceRoleId = null;

        const listAfterDelete = await apiCall(client, "get", "/resource-roles", { token: session.token });
        assert(is2xx(listAfterDelete.status), `GET /resource-roles after delete failed. status=${listAfterDelete.status}`);
        const stillExists = (listAfterDelete.data ?? []).some((role) => role.id === updateRes.data?.id);
        assert(!stillExists, "Deleted resource role still appears in list.");

        return {
            createStatus: createRes.status,
            updateStatus: updateRes.status,
            deleteStatus: deleteRes.status,
        };
    });

    await runCheck("5", "Project role rate overrides", async () => {
        assert(session?.token, "Missing auth session.");
        assert(TMP.projectId, "Missing selected project.");
        const globalRolesRes = await apiCall(client, "get", "/resource-roles", { token: session.token });
        assert(is2xx(globalRolesRes.status), `GET /resource-roles failed. status=${globalRolesRes.status}`);
        const globalRoles = Array.isArray(globalRolesRes.data) ? globalRolesRes.data : [];
        assert(globalRoles.length > 0, "No global resource roles found.");

        const projectRoleRatesRes = await apiCall(client, "get", `/projects/${TMP.projectId}/resource-roles`, {
            token: session.token,
        });
        assert(is2xx(projectRoleRatesRes.status), `GET /projects/{id}/resource-roles failed. status=${projectRoleRatesRes.status}`);
        const projectRoleRates = Array.isArray(projectRoleRatesRes.data) ? projectRoleRatesRes.data : [];
        assert(projectRoleRates.length > 0, "No project resource roles found.");

        const preferred = projectRoleRates.find((role) => role.resource_role_name === "unclassified")
            ?? projectRoleRates[0];
        selectedProjectRoleId = preferred.resource_role_id;
        selectedProjectRoleCurrency = preferred.currency;
        const globalMatch = globalRoles.find((role) => role.id === selectedProjectRoleId) ?? null;
        selectedProjectRoleDefaultRate = globalMatch?.default_hourly_rate ?? preferred.hourly_rate;

        const overrideRate = Number((selectedProjectRoleDefaultRate + 17.25).toFixed(2));
        const putRes = await apiCall(client, "put", `/projects/${TMP.projectId}/resource-roles/${selectedProjectRoleId}/rate`, {
            token: session.token,
            data: {
                hourly_rate: overrideRate,
                currency: selectedProjectRoleCurrency,
            },
        });
        rateEndpointStatuses.push(putRes.status);
        assert(is2xx(putRes.status), `PUT /projects/{id}/resource-roles/{role}/rate failed. status=${putRes.status}`);

        const afterPutRes = await apiCall(client, "get", `/projects/${TMP.projectId}/resource-roles`, {
            token: session.token,
        });
        assert(is2xx(afterPutRes.status), `GET project roles after override failed. status=${afterPutRes.status}`);
        const afterPutRole = (afterPutRes.data ?? []).find((role) => role.resource_role_id === selectedProjectRoleId);
        assert(afterPutRole, "Role not found after override update.");
        assert(Number(afterPutRole.hourly_rate) === overrideRate, `Override rate mismatch. expected=${overrideRate}, got=${afterPutRole.hourly_rate}`);
        assert(afterPutRole.is_override === true, "Expected is_override=true after PUT override.");

        const deleteRes = await apiCall(client, "delete", `/projects/${TMP.projectId}/resource-roles/${selectedProjectRoleId}/rate`, {
            token: session.token,
        });
        rateEndpointStatuses.push(deleteRes.status);
        assert(is2xx(deleteRes.status), `DELETE override failed. status=${deleteRes.status}`);

        const afterDeleteRes = await apiCall(client, "get", `/projects/${TMP.projectId}/resource-roles`, {
            token: session.token,
        });
        assert(is2xx(afterDeleteRes.status), `GET project roles after delete override failed. status=${afterDeleteRes.status}`);
        const afterDeleteRole = (afterDeleteRes.data ?? []).find((role) => role.resource_role_id === selectedProjectRoleId);
        assert(afterDeleteRole, "Role not found after deleting override.");
        assert(
            Number(afterDeleteRole.hourly_rate) === Number(selectedProjectRoleDefaultRate),
            `Expected fallback default rate ${selectedProjectRoleDefaultRate}, got ${afterDeleteRole.hourly_rate}`,
        );
        assert(afterDeleteRole.is_override === false, "Expected is_override=false after deleting override.");

        return {
            roleId: selectedProjectRoleId,
            defaultRate: selectedProjectRoleDefaultRate,
            overrideRate,
            putStatus: putRes.status,
            deleteStatus: deleteRes.status,
        };
    });

    await runCheck("6", "Work logs CRUD (economic source of truth)", async () => {
        assert(session?.token, "Missing auth session.");
        assert(TMP.projectId, "Missing selected project.");

        const createdTaskRes = await apiCall(client, "post", `/projects/${TMP.projectId}/tasks`, {
            token: session.token,
            data: {
                title: `QA Work Log Task ${nowStamp()}`,
                description: "Temporary task for FE QA checklist validation.",
                status: "pending",
                progress: 0,
            },
        });

        if (is2xx(createdTaskRes.status) && createdTaskRes.data?.id) {
            TMP.taskId = createdTaskRes.data.id;
            registerCleanup(`delete task ${TMP.taskId}`, async () => {
                if (!TMP.projectId || !TMP.taskId || !session?.token) return;
                await apiCall(client, "delete", `/projects/${TMP.projectId}/tasks/${TMP.taskId}`, { token: session.token });
            });
        } else {
            const listTasksRes = await apiCall(client, "get", `/projects/${TMP.projectId}/tasks`, {
                token: session.token,
            });
            assert(is2xx(listTasksRes.status), `Unable to create/list task for work-log QA. status=${listTasksRes.status}`);
            const tasks = Array.isArray(listTasksRes.data) ? listTasksRes.data : [];
            assert(tasks.length > 0, "No task available for work-log QA.");
            TMP.taskId = tasks[0].id;
        }

        if (!assignedRoleId) {
            const membersRes = await apiCall(client, "get", `/projects/${TMP.projectId}/members`, { token: session.token });
            if (is2xx(membersRes.status)) {
                const mine = (Array.isArray(membersRes.data) ? membersRes.data : []).find((m) => m.user_id === session.user.id);
                assignedRoleId = mine?.resource_roles?.[0]?.id ?? null;
            }
        }
        assert(assignedRoleId, "Missing assigned resource role for work-log create.");

        const workDate = new Date().toISOString().slice(0, 10);
        const createRes = await apiCall(client, "post", `/projects/${TMP.projectId}/tasks/${TMP.taskId}/work-logs`, {
            token: session.token,
            data: {
                hours: 2.5,
                note: `QA create ${nowStamp()}`,
                resource_role_id: assignedRoleId,
                user_id: session.user.id,
                work_date: workDate,
            },
        });
        workLogEndpointStatuses.push(createRes.status);
        assert(is2xx(createRes.status), `POST work-log failed. status=${createRes.status} body=${truncate(createRes.data)}`);
        assert(createRes.data?.id, "Created work-log id missing.");
        TMP.workLogIdForCleanup = createRes.data.id;

        for (const key of ["hourly_rate_snapshot", "currency_snapshot", "cost_amount"]) {
            assert(key in (createRes.data ?? {}), `Work-log create response missing ${key}`);
        }

        const listRes = await apiCall(client, "get", `/projects/${TMP.projectId}/tasks/${TMP.taskId}/work-logs`, {
            token: session.token,
        });
        workLogEndpointStatuses.push(listRes.status);
        assert(is2xx(listRes.status), `GET work-logs failed. status=${listRes.status}`);
        const listed = Array.isArray(listRes.data) ? listRes.data : [];
        const createdListed = listed.find((entry) => entry.id === TMP.workLogIdForCleanup);
        assert(createdListed, "Created work-log not found in list response.");

        const updateRes = await apiCall(client, "put", `/projects/${TMP.projectId}/tasks/${TMP.taskId}/work-logs/${TMP.workLogIdForCleanup}`, {
            token: session.token,
            data: {
                hours: 3.75,
                note: `QA update ${nowStamp()}`,
                resource_role_id: assignedRoleId,
                work_date: workDate,
            },
        });
        workLogEndpointStatuses.push(updateRes.status);
        assert(is2xx(updateRes.status), `PUT work-log failed. status=${updateRes.status} body=${truncate(updateRes.data)}`);
        assert(Number(updateRes.data?.hours) === 3.75, "Updated work-log hours mismatch.");
        assert(Number(updateRes.data?.cost_amount) >= 0, "Updated work-log cost not returned.");

        const deleteRes = await apiCall(client, "delete", `/projects/${TMP.projectId}/tasks/${TMP.taskId}/work-logs/${TMP.workLogIdForCleanup}`, {
            token: session.token,
        });
        workLogEndpointStatuses.push(deleteRes.status);
        assert(is2xx(deleteRes.status), `DELETE work-log failed. status=${deleteRes.status}`);

        const listAfterDeleteRes = await apiCall(client, "get", `/projects/${TMP.projectId}/tasks/${TMP.taskId}/work-logs`, {
            token: session.token,
        });
        workLogEndpointStatuses.push(listAfterDeleteRes.status);
        assert(is2xx(listAfterDeleteRes.status), `GET work-logs after delete failed. status=${listAfterDeleteRes.status}`);
        const stillExists = (Array.isArray(listAfterDeleteRes.data) ? listAfterDeleteRes.data : []).some((entry) => entry.id === TMP.workLogIdForCleanup);
        assert(!stillExists, "Deleted work-log still appears in list.");
        TMP.workLogIdForCleanup = null;

        const metricsLogRes = await apiCall(client, "post", `/projects/${TMP.projectId}/tasks/${TMP.taskId}/work-logs`, {
            token: session.token,
            data: {
                hours: 4.25,
                note: `QA metrics log ${nowStamp()}`,
                resource_role_id: assignedRoleId,
                user_id: session.user.id,
                work_date: workDate,
            },
        });
        workLogEndpointStatuses.push(metricsLogRes.status);
        assert(is2xx(metricsLogRes.status), `Failed to create persistent metrics work-log. status=${metricsLogRes.status}`);
        TMP.workLogIdForMetrics = metricsLogRes.data?.id ?? null;
        registerCleanup(`delete work-log ${TMP.workLogIdForMetrics}`, async () => {
            if (!TMP.projectId || !TMP.taskId || !TMP.workLogIdForMetrics || !session?.token) return;
            await apiCall(client, "delete", `/projects/${TMP.projectId}/tasks/${TMP.taskId}/work-logs/${TMP.workLogIdForMetrics}`, {
                token: session.token,
            });
        });

        return {
            projectId: TMP.projectId,
            taskId: TMP.taskId,
            createdStatus: createRes.status,
            updatedStatus: updateRes.status,
            deletedStatus: deleteRes.status,
            metricLogStatus: metricsLogRes.status,
            metricLogId: TMP.workLogIdForMetrics,
        };
    });

    await runCheck("7", "Work-log authorization rules", async () => {
        assert(session?.token, "Missing auth session.");
        assert(TMP.projectId, "Missing selected project.");
        assert(TMP.taskId, "Missing task for authorization checks.");

        const outsider = await registerAndLogin(client, "worklog-outsider");
        const outsiderList = await apiCall(client, "get", `/projects/${TMP.projectId}/tasks/${TMP.taskId}/work-logs`, {
            token: outsider.token,
        });
        workLogEndpointStatuses.push(outsiderList.status);
        assert(
            outsiderList.status === 403 || outsiderList.status === 404,
            `Outsider GET work-logs expected 403/404, got ${outsiderList.status}`,
        );
        const outsiderCreate = await apiCall(client, "post", `/projects/${TMP.projectId}/tasks/${TMP.taskId}/work-logs`, {
            token: outsider.token,
            data: {
                hours: 1.25,
                note: "outsider-write-attempt",
                resource_role_id: assignedRoleId,
                work_date: new Date().toISOString().slice(0, 10),
            },
        });
        workLogEndpointStatuses.push(outsiderCreate.status);
        assert(
            outsiderCreate.status === 403 || outsiderCreate.status === 404,
            `Outsider POST work-log expected 403/404, got ${outsiderCreate.status}`,
        );

        const rolesForProjectRes = await apiCall(client, "get", `/projects/${TMP.projectId}/resource-roles`, {
            token: session.token,
        });
        assert(is2xx(rolesForProjectRes.status), `GET project resource roles failed. status=${rolesForProjectRes.status}`);
        const projectRoles = Array.isArray(rolesForProjectRes.data) ? rolesForProjectRes.data : [];
        assert(projectRoles.length > 0, "No project roles available for authorization check.");

        const assignedRole = assignedRoleId ?? projectRoles[0].resource_role_id;
        const unassignedRole = projectRoles.find((role) => role.resource_role_id !== assignedRole)?.resource_role_id
            ?? projectRoles[0].resource_role_id;

        const limitedRole = accessRolesWithPermissions.find((entry) => {
            const roleName = String(entry.role?.name ?? "").toLowerCase();
            const looksAdmin = /admin|owner|super/.test(roleName);
            const hasProjectWrite = entry.permissions.some((perm) => /project\.(update|manage|delete|admin|owner)/.test(perm));
            return !looksAdmin && !hasProjectWrite;
        }) ?? accessRolesWithPermissions.find((entry) => {
            const roleName = String(entry.role?.name ?? "").toLowerCase();
            return !/admin|owner|super/.test(roleName);
        }) ?? null;
        if (!limitedRole?.role?.id) {
            throw new SkipError("No non-admin access role available to validate user_id override authorization.");
        }

        const restrictedMember = await registerAndLogin(client, "worklog-member");
        const addMemberRes = await apiCall(client, "post", `/projects/${TMP.projectId}/members`, {
            token: session.token,
            data: {
                user_id: restrictedMember.user.id,
                access_role_id: limitedRole.role.id,
                resource_role_ids: [assignedRole],
            },
        });
        assert(is2xx(addMemberRes.status), `Unable to create restricted project member. status=${addMemberRes.status}`);
        TMP.addedMemberUserIds.push(restrictedMember.user.id);
        registerCleanup(`remove member ${restrictedMember.user.id}`, async () => {
            if (!session?.token || !TMP.projectId) return;
            await apiCall(client, "delete", `/projects/${TMP.projectId}/members/${restrictedMember.user.id}`, {
                token: session.token,
            });
        });

        const unassignedRoleAttempt = await apiCall(client, "post", `/projects/${TMP.projectId}/tasks/${TMP.taskId}/work-logs`, {
            token: restrictedMember.token,
            data: {
                hours: 1.1,
                note: "unassigned-role-attempt",
                resource_role_id: unassignedRole,
                work_date: new Date().toISOString().slice(0, 10),
            },
        });
        workLogEndpointStatuses.push(unassignedRoleAttempt.status);
        assert(
            unassignedRoleAttempt.status === 403 || unassignedRoleAttempt.status === 400,
            `Unassigned role work-log should be blocked (403/400), got ${unassignedRoleAttempt.status}`,
        );

        const otherUserAttempt = await apiCall(client, "post", `/projects/${TMP.projectId}/tasks/${TMP.taskId}/work-logs`, {
            token: restrictedMember.token,
            data: {
                hours: 1.1,
                note: "other-user-attempt",
                resource_role_id: assignedRole,
                user_id: session.user.id,
                work_date: new Date().toISOString().slice(0, 10),
            },
        });
        workLogEndpointStatuses.push(otherUserAttempt.status);
        assert(otherUserAttempt.status === 403, `Expected 403 when logging for another user, got ${otherUserAttempt.status}`);

        return {
            outsiderReadStatus: outsiderList.status,
            outsiderWriteStatus: outsiderCreate.status,
            unassignedRoleStatus: unassignedRoleAttempt.status,
            otherUserStatus: otherUserAttempt.status,
            restrictedAccessRole: limitedRole.role.name,
        };
    });

    await runCheck("8", "Progress contract breaking change", async () => {
        assert(session?.token, "Missing auth session.");
        assert(TMP.projectId, "Missing selected project.");
        assert(TMP.taskId, "Missing selected task.");

        const createRes = await apiCall(client, "post", `/projects/${TMP.projectId}/tasks/${TMP.taskId}/progress`, {
            token: session.token,
            data: {
                progress: 42,
                note: "QA progress create",
            },
        });
        assert(is2xx(createRes.status), `POST progress with new contract failed. status=${createRes.status}`);
        TMP.progressId = createRes.data?.id ?? null;
        registerCleanup(`delete progress ${TMP.progressId}`, async () => {
            if (!session?.token || !TMP.projectId || !TMP.taskId || !TMP.progressId) return;
            await apiCall(client, "delete", `/projects/${TMP.projectId}/tasks/${TMP.taskId}/progress/${TMP.progressId}`, {
                token: session.token,
            });
        });

        const updateRes = await apiCall(client, "put", `/projects/${TMP.projectId}/tasks/${TMP.taskId}/progress/${TMP.progressId}`, {
            token: session.token,
            data: {
                progress: 55,
                note: "QA progress update",
            },
        });
        assert(is2xx(updateRes.status), `PUT progress with new contract failed. status=${updateRes.status}`);

        const invalidPostRes = await apiCall(client, "post", `/projects/${TMP.projectId}/tasks/${TMP.taskId}/progress`, {
            token: session.token,
            data: {
                progress: 60,
                note: "legacy fields validation",
                actual_hours: 2.25,
            },
        });
        const invalidPutRes = await apiCall(client, "put", `/projects/${TMP.projectId}/tasks/${TMP.taskId}/progress/${TMP.progressId}`, {
            token: session.token,
            data: {
                progress: 60,
                note: "legacy fields validation",
                actual_cost: 180,
            },
        });
        assert(
            invalidPostRes.status === 422,
            `Legacy progress POST payload with actual_hours expected 422, got ${invalidPostRes.status}`,
        );
        assert(
            invalidPutRes.status === 422,
            `Legacy progress PUT payload with actual_cost expected 422, got ${invalidPutRes.status}`,
        );

        return {
            createStatus: createRes.status,
            updateStatus: updateRes.status,
            invalidLegacyPostStatus: invalidPostRes.status,
            invalidLegacyPutStatus: invalidPutRes.status,
            progressId: TMP.progressId,
        };
    });

    await runCheck("9", "Dashboard + S-curve metrics contract", async () => {
        assert(session?.token, "Missing auth session.");
        assert(TMP.projectId, "Missing selected project.");
        assert(TMP.taskId, "Missing selected task.");

        const now = new Date();
        const dayMs = 24 * 60 * 60 * 1000;
        const planPayload = [
            {
                date: new Date(now.getTime() - (7 * dayMs)).toISOString(),
                planned_progress: 40,
                planned_hours: 48,
                planned_cost: 4800,
                currency: "USD",
            },
            {
                date: new Date(now.getTime() + (7 * dayMs)).toISOString(),
                planned_progress: 100,
                planned_hours: 120,
                planned_cost: 12000,
                currency: "USD",
            },
        ];
        const planRes = await apiCall(client, "post", `/projects/${TMP.projectId}/plan`, {
            token: session.token,
            data: planPayload,
        });
        assert(is2xx(planRes.status), `POST /projects/{id}/plan failed. status=${planRes.status}`);

        if (!TMP.workLogIdForMetrics) {
            assert(assignedRoleId, "Missing assigned role for metrics work-log.");
            const ensureLogRes = await apiCall(client, "post", `/projects/${TMP.projectId}/tasks/${TMP.taskId}/work-logs`, {
                token: session.token,
                data: {
                    hours: 3,
                    note: "ensure metrics",
                    resource_role_id: assignedRoleId,
                    user_id: session.user.id,
                    work_date: now.toISOString().slice(0, 10),
                },
            });
            workLogEndpointStatuses.push(ensureLogRes.status);
            assert(is2xx(ensureLogRes.status), `Failed to create metrics work-log. status=${ensureLogRes.status}`);
            TMP.workLogIdForMetrics = ensureLogRes.data?.id ?? null;
            registerCleanup(`delete work-log ${TMP.workLogIdForMetrics}`, async () => {
                if (!TMP.projectId || !TMP.taskId || !TMP.workLogIdForMetrics || !session?.token) return;
                await apiCall(client, "delete", `/projects/${TMP.projectId}/tasks/${TMP.taskId}/work-logs/${TMP.workLogIdForMetrics}`, {
                    token: session.token,
                });
            });
        }

        const metrics = ["progress", "hours", "cost"];
        const metricSummaries = [];
        for (const metric of metrics) {
            const dashboardRes = await apiCall(client, "get", `/projects/${TMP.projectId}/dashboard`, {
                token: session.token,
                params: { metric },
            });
            assert(is2xx(dashboardRes.status), `GET dashboard metric=${metric} failed. status=${dashboardRes.status}`);
            for (const key of ["metric_supported", "data_status", "metric_actual", "metric_plan"]) {
                assert(key in (dashboardRes.data ?? {}), `Dashboard response metric=${metric} missing ${key}`);
            }

            const healthRes = await apiCall(client, "get", `/projects/${TMP.projectId}/s-curve/health`, {
                token: session.token,
                params: { metric },
            });
            assert(is2xx(healthRes.status), `GET s-curve health metric=${metric} failed. status=${healthRes.status}`);
            for (const key of ["metric_supported", "data_status", "stage", "rule_50_70_status"]) {
                assert(key in (healthRes.data ?? {}), `Health response metric=${metric} missing ${key}`);
            }

            const portfolioRes = await apiCall(client, "get", "/portfolio/s-curve/summary", {
                token: session.token,
                params: { metric },
            });
            assert(is2xx(portfolioRes.status), `GET portfolio summary metric=${metric} failed. status=${portfolioRes.status}`);
            for (const key of ["metric_supported", "data_status", "projects"]) {
                assert(key in (portfolioRes.data ?? {}), `Portfolio response metric=${metric} missing ${key}`);
            }

            if (metric === "hours" || metric === "cost") {
                assert(healthRes.data?.metric_supported === true, `${metric} health metric_supported expected true.`);
                assert(healthRes.data?.data_status !== "unsupported_metric", `${metric} health data_status should not be unsupported_metric.`);

                const dashboardActual = Array.isArray(dashboardRes.data?.metric_actual) ? dashboardRes.data.metric_actual : [];
                const hasDashboardActual = dashboardActual.some((point) => typeof point?.value === "number" && Number(point.value) > 0);
                const portfolioProject = (Array.isArray(portfolioRes.data?.projects) ? portfolioRes.data.projects : [])
                    .find((project) => project.project_id === TMP.projectId);
                const hasPortfolioActual = typeof portfolioProject?.actual_pct === "number";
                const hasHealthActual = typeof healthRes.data?.actual_pct === "number";
                assert(
                    hasDashboardActual || hasPortfolioActual || hasHealthActual,
                    `${metric} metric did not return any non-null computed actual values with work-logs present.`,
                );
            }

            metricSummaries.push({
                metric,
                dashboardStatus: dashboardRes.status,
                dashboardDataStatus: dashboardRes.data?.data_status,
                healthStatus: healthRes.status,
                healthDataStatus: healthRes.data?.data_status,
                portfolioStatus: portfolioRes.status,
                portfolioDataStatus: portfolioRes.data?.data_status,
            });
        }

        return {
            projectId: TMP.projectId,
            metrics: metricSummaries,
        };
    });

    await runCheck("10", "Regression checks + strict route coverage", async () => {
        assert(session?.token, "Missing auth session.");
        assert(TMP.projectId, "Missing selected project.");
        assert(TMP.taskId, "Missing selected task.");

        const updateTaskRes = await apiCall(client, "put", `/projects/${TMP.projectId}/tasks/${TMP.taskId}`, {
            token: session.token,
            data: {
                title: `QA regression task ${nowStamp()}`,
                description: "Regression update with description.",
                progress: 63,
                status: "in_progress",
            },
        });
        assert(is2xx(updateTaskRes.status), `Task update regression failed. status=${updateTaskRes.status}`);

        const listProgressRes = await apiCall(client, "get", `/projects/${TMP.projectId}/tasks/${TMP.taskId}/progress`, {
            token: session.token,
        });
        assert(is2xx(listProgressRes.status), `Progress list regression failed. status=${listProgressRes.status}`);

        const strictPaths = [
            "/projects/{project_id}/resource-roles/{resource_role_id}/rate",
            "/projects/{project_id}/tasks/{task_id}/work-logs",
            "/projects/{project_id}/tasks/{task_id}/work-logs/{id}",
        ];
        const typesFile = await fsp.readFile(path.join(ROOT, "src", "types", "api.d.ts"), "utf8");
        const openapiSnapshot = await fsp.readFile(path.join(ROOT, "src", "openapi.json"), "utf8");
        for (const endpoint of strictPaths) {
            assert(typesFile.includes(`"${endpoint}"`), `types route missing: ${endpoint}`);
            assert(openapiSnapshot.includes(`"${endpoint}"`), `openapi snapshot route missing: ${endpoint}`);
        }

        const hasRateRoute404 = rateEndpointStatuses.some((status) => status === 404);
        const hasWorkLogRoute404 = workLogEndpointStatuses.some((status) => status === 404);
        assert(!hasRateRoute404, "Detected 404 on project resource-role rate route in runtime checks.");
        assert(
            !hasWorkLogRoute404 || workLogEndpointStatuses.some((status) => status === 403),
            "Unexpected 404 on work-log routes outside no-access scenarios.",
        );

        return {
            taskUpdateStatus: updateTaskRes.status,
            progressListStatus: listProgressRes.status,
            checkedStrictPaths: strictPaths,
            rateEndpointStatuses,
            workLogEndpointStatuses,
        };
    });

    for (const task of cleanupTasks.reverse()) {
        try {
            await task.fn();
        } catch (error) {
            cleanupErrors.push({
                label: task.label,
                error: extractErrorMessage(error),
            });
        }
    }

    const summary = checks.reduce(
        (acc, check) => {
            acc.total += 1;
            if (check.status === "pass") acc.passed += 1;
            if (check.status === "fail") acc.failed += 1;
            if (check.status === "skip") acc.skipped += 1;
            return acc;
        },
        { total: 0, passed: 0, failed: 0, skipped: 0 },
    );

    const report = {
        generatedAt: QA_RUN_AT,
        baseUrl,
        summary,
        checks,
        cleanupErrors,
    };

    await fsp.mkdir(QA_ARTIFACT_DIR, { recursive: true });
    await fsp.writeFile(QA_JSON_PATH, JSON.stringify(report, null, 2), "utf8");
    await fsp.writeFile(QA_MD_PATH, toMarkdown(report), "utf8");

    if (summary.failed > 0) {
        process.exitCode = 1;
    }
}

main().catch(async (error) => {
    const fallback = {
        generatedAt: QA_RUN_AT,
        baseUrl: normalizeBaseUrl(process.env.VITE_API_URL ?? "https://localhost:8800"),
        summary: { total: 0, passed: 0, failed: 1, skipped: 0 },
        checks: [],
        fatalError: extractErrorMessage(error),
    };
    try {
        await fsp.mkdir(QA_ARTIFACT_DIR, { recursive: true });
        await fsp.writeFile(QA_JSON_PATH, JSON.stringify(fallback, null, 2), "utf8");
        await fsp.writeFile(QA_MD_PATH, `# FE QA Checklist Report\n\nFatal error: ${fallback.fatalError}\n`, "utf8");
    } catch {
        // ignore write failures on fatal path
    }
    console.error("[qa] fatal:", extractErrorMessage(error));
    process.exitCode = 1;
});
