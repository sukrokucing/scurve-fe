import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import https from "node:https";
import { existsSync, readFileSync } from "node:fs";
import axios from "axios";

const root = process.cwd();
const USER_PER_PAGE = 100;

function loadEnvFiles() {
    const nodeEnv = process.env.NODE_ENV ?? "development";
    const envFiles = [
        ".env",
        `.env.${nodeEnv}`,
        ".env.local",
        `.env.${nodeEnv}.local`,
    ];

    for (const file of envFiles) {
        const filePath = path.resolve(root, file);
        if (!existsSync(filePath)) continue;

        const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
        for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line || line.startsWith("#")) continue;
            const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
            const splitIndex = normalized.indexOf("=");
            if (splitIndex <= 0) continue;

            const key = normalized.slice(0, splitIndex).trim();
            if (!key || process.env[key] !== undefined) continue;

            let value = normalized.slice(splitIndex + 1).trim();
            if (
                (value.startsWith('"') && value.endsWith('"'))
                || (value.startsWith("'") && value.endsWith("'"))
            ) {
                value = value.slice(1, -1);
            }
            process.env[key] = value.replace(/\\n/g, "\n");
        }
    }
}

function ensureTrailingSlash(url) {
    return url.endsWith("/") ? url : `${url}/`;
}

function normalizeSuffix(rawSuffix) {
    if (!rawSuffix) return "";
    return rawSuffix
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function withSuffix(label, suffix) {
    if (!suffix) return label;
    return `${label} (${suffix})`;
}

function withSuffixSlug(label, suffix) {
    if (!suffix) return label;
    return `${label}_${suffix.replace(/-/g, "_")}`;
}

function withEmailSuffix(localPart, suffix) {
    if (!suffix) return `${localPart}@example.com`;
    return `${localPart}.${suffix}@example.com`;
}

function roleMatchersByKey() {
    return {
        project_owner: [
            /^project\./,
            /^task\./,
            /^progress\./,
            /^dependency\./,
            /^dashboard\./,
            /^member\./,
            /^user\./,
            /^role\./,
            /^permission\./,
        ],
        system_analyst: [
            /^project\.(view|create|update|manage)/,
            /^task\.(view|create|update|manage)/,
            /^progress\.(view|create|update|manage)/,
            /^dependency\.(view|create|delete|manage)/,
        ],
        backend_developer: [
            /^project\.view$/,
            /^task\.(view|create|update|manage)/,
            /^progress\.(view|create|update|manage)/,
            /^dependency\.(view|create|delete|manage)/,
        ],
        frontend_developer: [
            /^project\.view$/,
            /^task\.(view|create|update|manage)/,
            /^progress\.(view|create|update|manage)/,
            /^dependency\.(view|create|delete|manage)/,
        ],
        fullstack_developer: [
            /^project\.(view|update)/,
            /^task\.(view|create|update|manage)/,
            /^progress\.(view|create|update|manage)/,
            /^dependency\.(view|create|delete|manage)/,
        ],
        data_analyst: [
            /^project\.view$/,
            /^task\.view$/,
            /^progress\.view$/,
            /^dashboard\.(view|read)/,
        ],
    };
}

function pickPermissionNames(allPermissions, roleKey) {
    const matchers = roleMatchersByKey()[roleKey] ?? [];
    const selected = new Set();

    for (const permission of allPermissions) {
        if (matchers.some((matcher) => matcher.test(permission.name))) {
            selected.add(permission.name);
        }
    }

    if (selected.size === 0) {
        for (const permission of allPermissions) {
            if (permission.name.endsWith(".view")) {
                selected.add(permission.name);
            }
        }
    }

    return Array.from(selected.values());
}

function resourceRoleMatchersByKey() {
    return {
        project_owner: ["project_manager", "system_analyst", "unclassified"],
        system_analyst: ["system_analyst", "unclassified"],
        backend_developer: ["backend_engineer", "unclassified"],
        frontend_developer: ["frontend_engineer", "unclassified"],
        fullstack_developer: ["backend_engineer", "frontend_engineer", "unclassified"],
        data_analyst: ["system_analyst", "unclassified"],
    };
}

function normalizeNameForMatch(value) {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

function pickResourceRoleIdsForPersona(resourceRoles, personaKey) {
    const candidates = resourceRoleMatchersByKey()[personaKey] ?? [];
    if (!Array.isArray(resourceRoles) || resourceRoles.length === 0) return [];

    const byName = new Map(
        resourceRoles.map((role) => [normalizeNameForMatch(role.name), role.id]),
    );
    const ids = [];
    for (const candidate of candidates.map(normalizeNameForMatch)) {
        const id = byName.get(candidate);
        if (id && !ids.includes(id)) ids.push(id);
    }

    if (ids.length > 0) return ids;

    const unclassifiedId = byName.get("unclassified");
    if (unclassifiedId) return [unclassifiedId];
    return resourceRoles[0]?.id ? [resourceRoles[0].id] : [];
}

function buildTemplates(suffix) {
    const personas = [
        {
            key: "project_owner",
            roleName: withSuffixSlug("project_owner", suffix),
            roleDescription: "Can own projects, assign members, and govern delivery.",
            userName: withSuffix("Demo Project Owner", suffix),
            userEmail: withEmailSuffix("demo.project.owner", suffix),
        },
        {
            key: "system_analyst",
            roleName: withSuffixSlug("system_analyst", suffix),
            roleDescription: "Can analyze requirements and coordinate delivery scope.",
            userName: withSuffix("Demo System Analyst", suffix),
            userEmail: withEmailSuffix("demo.system.analyst", suffix),
        },
        {
            key: "backend_developer",
            roleName: withSuffixSlug("backend_developer", suffix),
            roleDescription: "Can implement API and business logic tasks.",
            userName: withSuffix("Demo Backend Developer", suffix),
            userEmail: withEmailSuffix("demo.backend.developer", suffix),
        },
        {
            key: "frontend_developer",
            roleName: withSuffixSlug("frontend_developer", suffix),
            roleDescription: "Can implement UI workflows and interactions.",
            userName: withSuffix("Demo Frontend Developer", suffix),
            userEmail: withEmailSuffix("demo.frontend.developer", suffix),
        },
        {
            key: "fullstack_developer",
            roleName: withSuffixSlug("fullstack_developer", suffix),
            roleDescription: "Can work across frontend and backend task streams.",
            userName: withSuffix("Demo Fullstack Developer", suffix),
            userEmail: withEmailSuffix("demo.fullstack.developer", suffix),
        },
        {
            key: "data_analyst",
            roleName: withSuffixSlug("data_analyst", suffix),
            roleDescription: "Can track S-curve and reporting insights.",
            userName: withSuffix("Demo Data Analyst", suffix),
            userEmail: withEmailSuffix("demo.data.analyst", suffix),
        },
    ];

    const projects = [
        {
            key: "platform_revamp",
            name: withSuffix("Demo Platform Revamp", suffix),
            description: "Cross-team migration and performance hardening initiative.",
            theme_color: "#0EA5A4",
            members: ["project_owner", "system_analyst", "backend_developer", "frontend_developer", "fullstack_developer"],
            tasks: [
                { title: "Define platform scope baseline", roleKey: "system_analyst", status: "in_progress", progress: 35 },
                { title: "Implement auth and member APIs", roleKey: "backend_developer", status: "pending", progress: 10 },
                { title: "Build role-aware dashboard widgets", roleKey: "frontend_developer", status: "pending", progress: 15 },
                { title: "Integrate task quick-create flow", roleKey: "fullstack_developer", status: "in_progress", progress: 55 },
                { title: "Approve milestone acceptance criteria", roleKey: "project_owner", status: "pending", progress: 5 },
            ],
        },
        {
            key: "workflow_acceleration",
            name: withSuffix("Demo Workflow Acceleration", suffix),
            description: "Improve lead time and reduce friction in task management.",
            theme_color: "#14B8A6",
            members: ["project_owner", "system_analyst", "frontend_developer", "fullstack_developer", "data_analyst"],
            tasks: [
                { title: "Map low-learning-curve UX journey", roleKey: "system_analyst", status: "in_progress", progress: 45 },
                { title: "Optimize mobile task mode switching", roleKey: "frontend_developer", status: "pending", progress: 20 },
                { title: "Implement telemetry event aggregation", roleKey: "fullstack_developer", status: "pending", progress: 15 },
                { title: "Build dashboard trend consistency checks", roleKey: "data_analyst", status: "pending", progress: 5 },
                { title: "Sign off workflow optimization scope", roleKey: "project_owner", status: "pending", progress: 0 },
            ],
        },
        {
            key: "delivery_governance",
            name: withSuffix("Demo Delivery Governance", suffix),
            description: "S-curve governance and portfolio-level oversight improvements.",
            theme_color: "#0F766E",
            members: ["project_owner", "system_analyst", "backend_developer", "fullstack_developer", "data_analyst"],
            tasks: [
                { title: "Draft 50/70 governance checklist", roleKey: "system_analyst", status: "done", progress: 100 },
                { title: "Expose project health API contracts", roleKey: "backend_developer", status: "in_progress", progress: 65 },
                { title: "Wire governance cards in dashboard", roleKey: "fullstack_developer", status: "in_progress", progress: 60 },
                { title: "Validate portfolio health KPIs", roleKey: "data_analyst", status: "pending", progress: 25 },
                { title: "Approve governance release criteria", roleKey: "project_owner", status: "pending", progress: 10 },
            ],
        },
    ];

    return { personas, projects };
}

function createClient(baseUrl) {
    const url = new URL(baseUrl);
    const allowInsecure = (
        process.env.DEMO_ALLOW_INSECURE === "1"
        || (url.protocol === "https:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1"))
    );

    return axios.create({
        baseURL: baseUrl.replace(/\/+$/, ""),
        headers: { "Content-Type": "application/json" },
        httpsAgent: url.protocol === "https:"
            ? new https.Agent({ rejectUnauthorized: !allowInsecure })
            : undefined,
    });
}

async function runWithContext(context, task) {
    try {
        return await task();
    } catch (error) {
        if (error && typeof error === "object") {
            error.seedContext = context;
        }
        throw error;
    }
}

async function login(client, email, password) {
    const response = await client.post("/auth/login", { email, password });
    const token = response.data?.token;
    if (!token) {
        throw new Error("Authentication succeeded but token was missing in response.");
    }
    client.defaults.headers.Authorization = `Bearer ${token}`;
}

async function listAllUsers(client) {
    let page = 1;
    let total = Number.POSITIVE_INFINITY;
    const users = [];

    while (users.length < total) {
        const response = await client.get("/users", {
            params: { page, per_page: USER_PER_PAGE },
        });
        const pageUsers = Array.isArray(response.data) ? response.data : [];
        users.push(...pageUsers);
        const headerTotal = Number(response.headers["x-total-count"] ?? response.headers["X-Total-Count"] ?? pageUsers.length);
        total = Number.isFinite(headerTotal) ? headerTotal : users.length;
        if (pageUsers.length < USER_PER_PAGE) break;
        page += 1;
    }

    return users;
}

async function findUserByEmail(client, email) {
    const response = await client.get("/users", {
        params: { q: email, page: 1, per_page: USER_PER_PAGE },
    });
    const users = Array.isArray(response.data) ? response.data : [];
    const exact = users.find((user) => String(user.email).toLowerCase() === email.toLowerCase());
    if (exact) return exact;

    const allUsers = await listAllUsers(client);
    return allUsers.find((user) => String(user.email).toLowerCase() === email.toLowerCase()) ?? null;
}

async function ensureUser(client, { email, name, password }) {
    try {
        const response = await client.post("/users", { email, name, password });
        return { user: response.data, created: true };
    } catch (error) {
        if (error?.response?.status === 409) {
            const existing = await findUserByEmail(client, email);
            if (!existing) throw new Error(`User conflict detected but existing user not found: ${email}`);
            return { user: existing, created: false };
        }
        throw error;
    }
}

async function ensureRole(client, { name, description }) {
    const rolesResponse = await client.get("/rbac/roles");
    const roles = Array.isArray(rolesResponse.data) ? rolesResponse.data : [];
    const existing = roles.find((role) => role.name === name);
    if (existing) return { role: existing, created: false };

    try {
        const response = await client.post("/rbac/roles", { name, description });
        return { role: response.data, created: true };
    } catch (error) {
        if (error?.response?.status === 409) {
            const retryRoles = (await client.get("/rbac/roles")).data ?? [];
            const retryFound = retryRoles.find((role) => role.name === name);
            if (!retryFound) throw new Error(`Role conflict detected but existing role not found: ${name}`);
            return { role: retryFound, created: false };
        }
        throw error;
    }
}

async function ensureRoleHasPermissions(client, roleId, allPermissions, roleKey) {
    const selectedPermissionNames = pickPermissionNames(allPermissions, roleKey);
    if (selectedPermissionNames.length === 0) return { assigned: 0, selectedPermissionNames };

    const selectedPermissions = allPermissions.filter((permission) => selectedPermissionNames.includes(permission.name));
    const rolePermissionsResponse = await client.get(`/rbac/roles/${roleId}/permissions`);
    const assignedRolePermissions = Array.isArray(rolePermissionsResponse.data) ? rolePermissionsResponse.data : [];
    const assignedIds = new Set(assignedRolePermissions.map((permission) => permission.id));

    let assigned = 0;
    for (const permission of selectedPermissions) {
        if (assignedIds.has(permission.id)) continue;
        await client.post(`/rbac/roles/${roleId}/permissions`, { permission_id: permission.id });
        assigned += 1;
    }

    return { assigned, selectedPermissionNames };
}

async function ensureRoleAssignedToUser(client, userId, roleId) {
    const response = await client.get(`/rbac/users/${userId}/roles`);
    const roles = Array.isArray(response.data) ? response.data : [];
    const alreadyAssigned = roles.some((role) => role.id === roleId);
    if (alreadyAssigned) return false;

    await client.post(`/rbac/users/${userId}/roles`, { role_id: roleId });
    return true;
}

async function ensureProject(client, payload) {
    const response = await client.get("/projects");
    const projects = Array.isArray(response.data) ? response.data : [];
    const existing = projects.find((project) => project.name === payload.name);
    if (existing) return { project: existing, created: false };

    const createResponse = await client.post("/projects", payload);
    return { project: createResponse.data, created: true };
}

async function ensureProjectMember(client, projectId, userId, accessRoleId, resourceRoleIds = []) {
    const normalizedResourceRoleIds = Array.from(
        new Set((Array.isArray(resourceRoleIds) ? resourceRoleIds : []).filter(Boolean)),
    ).sort();
    const response = await client.get(`/projects/${projectId}/members`);
    const members = Array.isArray(response.data) ? response.data : [];
    const existing = members.find((member) => member.user_id === userId);
    const existingResourceRoleIds = Array.isArray(existing?.resource_roles)
        ? existing.resource_roles
            .map((role) => role?.id)
            .filter(Boolean)
            .sort()
        : [];
    if (
        existing
        && existing.access_role_id === accessRoleId
        && JSON.stringify(existingResourceRoleIds) === JSON.stringify(normalizedResourceRoleIds)
    ) {
        return false;
    }
    await client.post(`/projects/${projectId}/members`, {
        user_id: userId,
        access_role_id: accessRoleId,
        resource_role_ids: normalizedResourceRoleIds,
    });
    return true;
}

async function ensureTask(client, projectId, taskPayload) {
    const response = await client.get(`/projects/${projectId}/tasks`, {
        params: {
            q: taskPayload.title,
            page: 1,
            per_page: 100,
        },
    });
    const tasks = Array.isArray(response.data) ? response.data : [];
    const existing = tasks.find((task) => task.title === taskPayload.title);
    if (existing) return { task: existing, created: false };

    const createResponse = await client.post(`/projects/${projectId}/tasks`, taskPayload);
    return { task: createResponse.data, created: true };
}

async function checkDashboardConsistency(client, projectIds) {
    const projectChecks = [];

    for (const projectId of projectIds) {
        const projectDashboard = (await client.get(`/projects/${projectId}/dashboard`)).data;
        const projectHealth = (await client.get(`/projects/${projectId}/s-curve/health`, {
            params: { metric: "progress" },
        })).data;

        const issues = [];
        if (projectDashboard?.project?.id !== projectId) {
            issues.push("dashboard.project.id mismatch");
        }
        if (!Array.isArray(projectDashboard?.actual)) {
            issues.push("dashboard.actual is not an array");
        }
        if (!Array.isArray(projectDashboard?.plan)) {
            issues.push("dashboard.plan is not an array");
        }
        if (typeof projectHealth?.rule_50_70_status !== "string") {
            issues.push("health.rule_50_70_status missing");
        }
        if (!projectHealth?.last_updated_at) {
            issues.push("health.last_updated_at missing");
        }

        projectChecks.push({
            project_id: projectId,
            actual_points: Array.isArray(projectDashboard?.actual) ? projectDashboard.actual.length : 0,
            plan_points: Array.isArray(projectDashboard?.plan) ? projectDashboard.plan.length : 0,
            stage: projectHealth?.stage ?? null,
            rule_50_70_status: projectHealth?.rule_50_70_status ?? null,
            variance_pct: projectHealth?.variance_pct ?? null,
            ok: issues.length === 0,
            issues,
        });
    }

    const portfolio = (await client.get("/portfolio/s-curve/summary", {
        params: { metric: "progress" },
    })).data;
    const portfolioProjects = Array.isArray(portfolio?.projects) ? portfolio.projects : [];
    const portfolioProjectIds = new Set(portfolioProjects.map((project) => project.project_id));
    const missingFromPortfolio = projectIds.filter((id) => !portfolioProjectIds.has(id));

    return {
        projects: projectChecks,
        portfolio: {
            project_count: portfolio?.project_count ?? 0,
            lag_count: portfolio?.lag_count ?? 0,
            log_count: portfolio?.log_count ?? 0,
            maturity_count: portfolio?.maturity_count ?? 0,
            decline_count: portfolio?.decline_count ?? 0,
            missing_seeded_project_ids: missingFromPortfolio,
            metric: portfolio?.metric ?? "progress",
        },
    };
}

async function main() {
    loadEnvFiles();

    const suffix = normalizeSuffix(process.env.DEMO_PERSONA_SUFFIX ?? "");
    const baseUrl = process.env.VITE_API_URL ?? "https://localhost:8800";
    const adminEmail = process.env.DEMO_ADMIN_EMAIL ?? process.env.TEST_EMAIL;
    const adminPassword = process.env.DEMO_ADMIN_PASSWORD ?? process.env.TEST_PASSWORD;
    const defaultUserPassword = process.env.DEMO_PERSONA_PASSWORD ?? process.env.TEST_PASSWORD ?? "password123";

    if (!adminEmail || !adminPassword) {
        throw new Error("Missing admin credentials. Set DEMO_ADMIN_EMAIL/DEMO_ADMIN_PASSWORD or TEST_EMAIL/TEST_PASSWORD.");
    }

    const client = createClient(baseUrl);
    await login(client, adminEmail, adminPassword);

    const { personas, projects } = buildTemplates(suffix);
    const allPermissions = (await client.get("/rbac/permissions")).data ?? [];
    let resourceRoles = [];
    try {
        resourceRoles = (await client.get("/resource-roles")).data ?? [];
    } catch {
        resourceRoles = [];
    }

    const roleByKey = new Map();
    const resourceRoleByKey = new Map();
    const userByKey = new Map();
    const warnings = [];
    let skipProjectMemberships = false;
    const stats = {
        rolesCreated: 0,
        usersCreated: 0,
        projectCreated: 0,
        rolePermissionsAssigned: 0,
        roleAssignmentsCreated: 0,
        projectMembershipsCreated: 0,
        tasksCreated: 0,
    };

    for (const persona of personas) {
        const ensuredRole = await runWithContext(
            `ensureRole:${persona.roleName}`,
            () => ensureRole(client, {
                name: persona.roleName,
                description: persona.roleDescription,
            }),
        );
        roleByKey.set(persona.key, ensuredRole.role);
        resourceRoleByKey.set(persona.key, pickResourceRoleIdsForPersona(resourceRoles, persona.key));
        if (ensuredRole.created) stats.rolesCreated += 1;

        const ensuredUser = await runWithContext(
            `ensureUser:${persona.userEmail}`,
            () => ensureUser(client, {
                email: persona.userEmail,
                name: persona.userName,
                password: defaultUserPassword,
            }),
        );
        userByKey.set(persona.key, ensuredUser.user);
        if (ensuredUser.created) stats.usersCreated += 1;

        const permissionResult = await runWithContext(
            `ensureRoleHasPermissions:${persona.roleName}`,
            () => ensureRoleHasPermissions(client, ensuredRole.role.id, allPermissions, persona.key),
        );
        stats.rolePermissionsAssigned += permissionResult.assigned;

        const roleAssigned = await runWithContext(
            `ensureRoleAssignedToUser:${persona.userEmail}->${persona.roleName}`,
            () => ensureRoleAssignedToUser(client, ensuredUser.user.id, ensuredRole.role.id),
        );
        if (roleAssigned) stats.roleAssignmentsCreated += 1;
    }

    const seededProjects = [];
    for (const projectTemplate of projects) {
        let ensuredProject;
        try {
            ensuredProject = await runWithContext(
                `ensureProject:${projectTemplate.name}`,
                () => ensureProject(client, {
                    name: projectTemplate.name,
                    description: projectTemplate.description,
                    theme_color: projectTemplate.theme_color,
                }),
            );
        } catch (error) {
            const status = error?.response?.status ?? null;
            const message = error?.response?.data?.message ?? error?.message ?? "Unknown project creation error";
            warnings.push({
                scope: "project-create",
                project: projectTemplate.name,
                status,
                message,
            });
            continue;
        }
        if (ensuredProject.created) stats.projectCreated += 1;
        seededProjects.push(ensuredProject.project);

        for (const personaKey of projectTemplate.members) {
            if (skipProjectMemberships) break;
            const user = userByKey.get(personaKey);
            const role = roleByKey.get(personaKey);
            if (!user || !role) continue;
            try {
                const membershipCreated = await runWithContext(
                    `ensureProjectMember:project=${projectTemplate.name},user=${user.email},role=${role.name}`,
                    () => ensureProjectMember(
                        client,
                        ensuredProject.project.id,
                        user.id,
                        role.id,
                        resourceRoleByKey.get(personaKey) ?? [],
                    ),
                );
                if (membershipCreated) stats.projectMembershipsCreated += 1;
            } catch (error) {
                const status = error?.response?.status ?? null;
                const message = error?.response?.data?.message ?? error?.message ?? "Unknown project membership error";
                warnings.push({
                    scope: "project-membership",
                    project: projectTemplate.name,
                    user: user.email,
                    access_role: role.name,
                    resource_role_ids: resourceRoleByKey.get(personaKey) ?? [],
                    status,
                    message,
                });
                if (status === 500) {
                    skipProjectMemberships = true;
                }
            }
        }

        for (const taskTemplate of projectTemplate.tasks) {
            const assignee = userByKey.get(taskTemplate.roleKey);
            const taskTitle = `[${projectTemplate.key}] ${taskTemplate.title}`;
            const taskDescription = `Dummy task for ${taskTemplate.roleKey.replaceAll("_", " ")} persona in ${projectTemplate.name}.`;
            const ensuredTask = await runWithContext(
                `ensureTask:project=${projectTemplate.name},task=${taskTitle},assignee=${assignee?.email ?? "none"}`,
                () => ensureTask(client, ensuredProject.project.id, {
                    title: taskTitle,
                    description: taskDescription,
                    status: taskTemplate.status,
                    progress: taskTemplate.progress,
                    assignee: assignee?.id ?? null,
                }),
            );
            if (ensuredTask.created) stats.tasksCreated += 1;
        }
    }

    const consistency = await runWithContext(
        "checkDashboardConsistency",
        () => checkDashboardConsistency(
            client,
            seededProjects.map((project) => project.id),
        ),
    );

    const report = {
        generated_at: new Date().toISOString(),
        base_url: ensureTrailingSlash(baseUrl),
        seed_suffix: suffix || null,
        admin_email: adminEmail,
        persona_password_source: process.env.DEMO_PERSONA_PASSWORD ? "DEMO_PERSONA_PASSWORD" : "TEST_PASSWORD",
        personas: personas.map((persona) => ({
            key: persona.key,
            role_name: persona.roleName,
            user_email: persona.userEmail,
            user_id: userByKey.get(persona.key)?.id ?? null,
            access_role_id: roleByKey.get(persona.key)?.id ?? null,
            resource_role_ids: resourceRoleByKey.get(persona.key) ?? [],
        })),
        projects: seededProjects.map((project) => ({
            id: project.id,
            name: project.name,
        })),
        stats,
        consistency,
        warnings,
    };

    const reportPath = path.join(root, "artifacts", "demo-persona-seed.json");
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

    console.log("[seed:demo-personas] Completed.");
    console.log(`[seed:demo-personas] Base URL: ${baseUrl}`);
    console.log(`[seed:demo-personas] Roles created: ${stats.rolesCreated}`);
    console.log(`[seed:demo-personas] Users created: ${stats.usersCreated}`);
    console.log(`[seed:demo-personas] Projects created: ${stats.projectCreated}`);
    console.log(`[seed:demo-personas] Tasks created: ${stats.tasksCreated}`);
    console.log(`[seed:demo-personas] Dashboard checks ok: ${consistency.projects.filter((entry) => entry.ok).length}/${consistency.projects.length}`);
    if (warnings.length > 0) {
        console.log(`[seed:demo-personas] warnings=${warnings.length} (see artifacts/demo-persona-seed.json)`);
    }
    console.log(`[seed:demo-personas] Report: ${reportPath}`);
}

main().catch((error) => {
    console.error("[seed:demo-personas] failed");
    if (error?.seedContext) {
        console.error(`context=${error.seedContext}`);
    }
    if (error?.response?.status) {
        console.error(`status=${error.response.status}`);
    }
    if (error?.response?.data) {
        console.error(error.response.data);
    } else {
        console.error(error);
    }
    process.exit(1);
});
