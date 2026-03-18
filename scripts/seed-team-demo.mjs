import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import https from "node:https";
import { existsSync, readFileSync } from "node:fs";
import axios from "axios";

const root = process.cwd();
const sessionPath = path.join(root, ".playwright", "auth", "session-default.json");
const reportPath = path.join(root, "artifacts", "team-demo-seed.json");

function loadEnv() {
  for (const file of [".env", ".env.development", ".env.local", ".env.development.local"]) {
    const filePath = path.join(root, file);
    if (!existsSync(filePath)) continue;
    for (const raw of readFileSync(filePath, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
      const idx = normalized.indexOf("=");
      if (idx <= 0) continue;
      const key = normalized.slice(0, idx).trim();
      if (!key || process.env[key] !== undefined) continue;
      let value = normalized.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value.replace(/\\n/g, "\n");
    }
  }
}

function makeClient(baseUrl) {
  const url = new URL(baseUrl);
  return axios.create({
    baseURL: baseUrl.replace(/\/+$/, ""),
    headers: { "Content-Type": "application/json" },
    httpsAgent: url.protocol === "https:"
      ? new https.Agent({ rejectUnauthorized: false })
      : undefined,
  });
}

async function login(client, email, password) {
  const response = await client.post("/auth/login", { email, password });
  const token = response.data?.token;
  if (!token) throw new Error("Authentication succeeded but token was missing in response.");
  client.defaults.headers.Authorization = `Bearer ${token}`;
}

async function authenticate(client) {
  const email = process.env.DEMO_ADMIN_EMAIL ?? process.env.TEST_EMAIL;
  const password = process.env.DEMO_ADMIN_PASSWORD ?? process.env.TEST_PASSWORD;
  if (email && password) {
    await login(client, email, password);
    return { source: "env-login", identity: email };
  }
  if (!existsSync(sessionPath)) throw new Error("Missing admin credentials and session-default.json.");
  const session = JSON.parse(await fs.readFile(sessionPath, "utf8"));
  client.defaults.headers.Authorization = `Bearer ${session.token}`;
  return { source: "session-token", identity: session?.user?.email ?? null };
}

async function getRoles(client) {
  const { data } = await client.get("/rbac/roles");
  return Array.isArray(data) ? data : [];
}

async function ensureRole(client, payload) {
  const existing = (await getRoles(client)).find((role) => role.name === payload.name);
  if (existing) return { item: existing, created: false };
  const { data } = await client.post("/rbac/roles", payload);
  return { item: data, created: true };
}

async function ensureRolePermissions(client, roleId, permissionNames) {
  const [{ data: available }, { data: assigned }] = await Promise.all([
    client.get("/rbac/permissions"),
    client.get(`/rbac/roles/${roleId}/permissions`),
  ]);
  const availableList = Array.isArray(available) ? available : [];
  const assignedIds = new Set((Array.isArray(assigned) ? assigned : []).map((item) => item.id));
  let added = 0;
  for (const permission of availableList.filter((item) => permissionNames.includes(item.name))) {
    if (assignedIds.has(permission.id)) continue;
    await client.post(`/rbac/roles/${roleId}/permissions`, { permission_id: permission.id });
    added += 1;
  }
  return added;
}

async function ensureUser(client, payload) {
  try {
    const { data } = await client.post("/users", payload);
    return { item: data, created: true };
  } catch (error) {
    if (error?.response?.status !== 409) throw error;
    const { data } = await client.get("/users", { params: { q: payload.email, page: 1, per_page: 100 } });
    const users = Array.isArray(data) ? data : [];
    const existing = users.find((item) => String(item.email).toLowerCase() === payload.email.toLowerCase());
    if (!existing) throw error;
    return { item: existing, created: false };
  }
}

async function ensureRoleAssignment(client, userId, roleId) {
  const { data } = await client.get(`/rbac/users/${userId}/roles`);
  const roles = Array.isArray(data) ? data : [];
  if (roles.some((role) => role.id === roleId)) return false;
  await client.post(`/rbac/users/${userId}/roles`, { role_id: roleId });
  return true;
}

async function ensureResourceRole(client, payload) {
  const { data } = await client.get("/resource-roles");
  const roles = Array.isArray(data) ? data : [];
  const existing = roles.find((item) => item.name.toLowerCase() === payload.name.toLowerCase());
  if (!existing) {
    const created = await client.post("/resource-roles", payload);
    return { item: created.data, created: true, updated: false };
  }
  const changed = existing.description !== payload.description
    || Number(existing.default_hourly_rate) !== Number(payload.default_hourly_rate)
    || String(existing.currency) !== String(payload.currency);
  if (!changed) return { item: existing, created: false, updated: false };
  const updated = await client.put(`/resource-roles/${existing.id}`, payload);
  return { item: updated.data, created: false, updated: true };
}

async function ensureProject(client, payload) {
  const { data } = await client.get("/projects");
  const projects = Array.isArray(data) ? data : [];
  const existing = projects.find((item) => item.name === payload.name);
  if (existing) return { item: existing, created: false };
  const created = await client.post("/projects", payload);
  return { item: created.data, created: true };
}

async function ensureProjectMember(client, projectId, payload) {
  const { data } = await client.get(`/projects/${projectId}/members`);
  const members = Array.isArray(data) ? data : [];
  const existing = members.find((item) => item.user_id === payload.user_id);
  const existingResourceIds = Array.isArray(existing?.resource_roles) ? existing.resource_roles.map((item) => item.id).sort() : [];
  const targetResourceIds = [...payload.resource_role_ids].sort();
  if (existing && existing.access_role_id === payload.access_role_id && JSON.stringify(existingResourceIds) === JSON.stringify(targetResourceIds)) {
    return false;
  }
  await client.post(`/projects/${projectId}/members`, payload);
  return true;
}

async function pruneProjectMembers(client, projectId, allowedUserIds) {
  const { data } = await client.get(`/projects/${projectId}/members`);
  const members = Array.isArray(data) ? data : [];
  let removed = 0;
  for (const member of members) {
    if (allowedUserIds.has(member.user_id)) continue;
    await client.delete(`/projects/${projectId}/members/${member.user_id}`);
    removed += 1;
  }
  return removed;
}

async function listProjectTasks(client, projectId) {
  const { data } = await client.get(`/projects/${projectId}/tasks`, {
    params: { page: 1, per_page: 100, sort_by: "title", sort_dir: "asc" },
  });
  return Array.isArray(data) ? data : (Array.isArray(data?.tasks) ? data.tasks : []);
}

async function upsertTask(client, projectId, payload) {
  const existing = (await listProjectTasks(client, projectId)).find((item) => item.title === payload.title);
  if (!existing) {
    const created = await client.post(`/projects/${projectId}/tasks`, payload);
    return { item: created.data, created: true, updated: false };
  }
  const updated = await client.put(`/projects/${projectId}/tasks/${existing.id}`, payload);
  return { item: updated.data, created: false, updated: true };
}

function atDay(offset, hour) {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + offset);
  value.setUTCHours(hour, 0, 0, 0);
  return value.toISOString();
}

function permissionNamesByRole() {
  return {
    project_owner: [/^project\./, /^task\./, /^progress\./, /^dependency\./, /^dashboard\./, /^member\./, /^user\./, /^role\./, /^permission\./],
    system_analyst: [/^project\.(view|create|update|manage)/, /^task\.(view|create|update|manage)/, /^progress\.(view|create|update|manage)/, /^dependency\.(view|create|delete|manage)/, /^dashboard\.(view|read)/],
    backend_developer: [/^project\.view$/, /^task\.(view|create|update|manage)/, /^progress\.(view|create|update|manage)/, /^dependency\.(view|create|delete|manage)/],
    frontend_developer: [/^project\.view$/, /^task\.(view|create|update|manage)/, /^progress\.(view|create|update|manage)/, /^dependency\.(view|create|delete|manage)/],
    backend_developer_intern: [/^project\.view$/, /^task\.(view|create|update)/, /^progress\.(view|create)/],
  };
}

function buildSpec() {
  const roles = [
    ["project_owner", "Demo Project Owner", "demo.project.owner@example.com", "Project Owner", 300000],
    ["system_analyst", "Demo System Analyst", "demo.system.analyst@example.com", "System Analyst", 220000],
    ["backend_developer", "Demo Backend Developer", "demo.backend.developer@example.com", "Backend Developer", 200000],
    ["frontend_developer", "Demo Frontend Developer", "demo.frontend.developer@example.com", "Frontend Developer", 190000],
    ["backend_developer_intern", "Demo Backend Developer Intern", "demo.backend.intern@example.com", "Backend Developer Intern", 90000],
  ].map(([key, userName, userEmail, resourceRoleName, rate]) => ({
    key,
    accessRole: { name: key, description: `${userName} access role for demo team project.` },
    user: { name: userName, email: userEmail },
    resourceRole: { name: resourceRoleName, description: `${userName} resource role.`, default_hourly_rate: rate, currency: "IDR" },
  }));

  const tasks = [
    ["[team-demo] Requirements baseline review", "Validate business scope and lock the first baseline.", "system_analyst", "in_progress", 45, 1, atDay(-3, 9), atDay(4, 17), atDay(4, 17), "on_time"],
    ["[team-demo] Member API contract update", "Deliver the backend membership contract update and keep task endpoints aligned.", "backend_developer", "in_progress", 65, 1, atDay(-10, 9), atDay(-2, 17), atDay(-2, 17), "overdue"],
    ["[team-demo] Tasks responsive polish", "Refine mobile quick controls and task edit flow spacing.", "frontend_developer", "pending", 15, 1, atDay(-1, 9), atDay(7, 17), atDay(7, 17), "on_time"],
    ["[team-demo] Intern bugfix support bundle", "Handle guided backend cleanups under supervision.", "backend_developer_intern", "done", 100, 1, atDay(-1, 9), atDay(2, 17), atDay(2, 17), "finished_early"],
    ["[team-demo] Project sign-off checkpoint", "Project owner approval gate before wider rollout. No date yet because scope is still waiting on review.", "project_owner", "blocked", 0, 1, null, null, null, "not_specified"],
  ].map(([title, description, assigneeKey, status, progress, task_weight, start_date, due_date, end_date, expectedScheduleStatus]) => ({
    title,
    description,
    assigneeKey,
    status,
    progress,
    task_weight,
    progress_method: "manual_percent_legacy",
    start_date,
    baseline_start_at: null,
    due_date,
    end_date,
    baseline_end_at: null,
    expectedScheduleStatus,
  }));

  return {
    project: {
      name: "Demo Team Visibility Project",
      description: "A demo project for project owner, system analyst, backend, frontend, and backend intern visibility in Tasks.",
      theme_color: "#0EA5A4",
    },
    roles,
    tasks,
  };
}

function summarizeCounts(items, key) {
  const counts = {};
  for (const item of items) {
    const value = item?.[key] ?? "unknown";
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

async function verify(client, projectId, spec, usersByKey, accessRolesByKey, resourceRolesByKey) {
  const [membersRes, tasks, dashboardRes, healthRes] = await Promise.all([
    client.get(`/projects/${projectId}/members`),
    listProjectTasks(client, projectId),
    client.get(`/projects/${projectId}/dashboard`, { params: { metric: "progress" } }),
    client.get(`/projects/${projectId}/s-curve/health`, { params: { metric: "progress" } }),
  ]);
  const members = Array.isArray(membersRes.data) ? membersRes.data : [];
  const dashboard = dashboardRes.data ?? {};
  const health = healthRes.data ?? {};
  const issues = [];
  const taskByTitle = new Map(tasks.map((item) => [item.title, item]));

  if (members.length !== spec.roles.length) issues.push(`expected ${spec.roles.length} members, found ${members.length}`);
  for (const role of spec.roles) {
    const user = usersByKey.get(role.key);
    const member = members.find((item) => item.user_id === user?.id);
    if (!member) {
      issues.push(`missing member for ${role.key}`);
      continue;
    }
    if (member.access_role_id !== accessRolesByKey.get(role.key)?.id) issues.push(`access role mismatch for ${role.key}`);
    const actualResourceIds = Array.isArray(member.resource_roles) ? member.resource_roles.map((item) => item.id) : [];
    if (!actualResourceIds.includes(resourceRolesByKey.get(role.key)?.id)) issues.push(`resource role mismatch for ${role.key}`);
  }

  for (const taskSpec of spec.tasks) {
    const task = taskByTitle.get(taskSpec.title);
    const assignee = usersByKey.get(taskSpec.assigneeKey);
    if (!task) {
      issues.push(`missing task ${taskSpec.title}`);
      continue;
    }
    if (task.assignee !== assignee?.id) issues.push(`assignee mismatch for ${taskSpec.title}`);
    if ((task.actual_progress_pct ?? task.progress ?? 0) !== taskSpec.progress) issues.push(`progress mismatch for ${taskSpec.title}`);
    if (task.schedule_status !== taskSpec.expectedScheduleStatus) issues.push(`schedule status mismatch for ${taskSpec.title}: ${task.schedule_status}`);
  }

  const workload = Array.isArray(dashboard.workload_distribution) ? dashboard.workload_distribution : [];
  for (const role of spec.roles) {
    const user = usersByKey.get(role.key);
    const entry = workload.find((item) => item.user_id === user?.id);
    if (!entry) issues.push(`missing workload entry for ${role.key}`);
  }

  return {
    ok: issues.length === 0,
    issues,
    members: members.map((item) => ({
      user_name: item.user_name,
      user_email: item.user_email,
      access_role_name: item.access_role_name,
      resource_roles: Array.isArray(item.resource_roles) ? item.resource_roles.map((role) => role.name) : [],
    })),
    tasks: spec.tasks.map((taskSpec) => {
      const task = taskByTitle.get(taskSpec.title);
      return {
        title: taskSpec.title,
        assignee_email: usersByKey.get(taskSpec.assigneeKey)?.email ?? null,
        actual_progress_pct: task?.actual_progress_pct ?? null,
        expected_progress_pct: task?.expected_progress_pct ?? null,
        variance_pct: task?.variance_pct ?? null,
        health_status: task?.health_status ?? null,
        schedule_status: task?.schedule_status ?? null,
        execution_status: task?.execution_status ?? null,
        completed_at: task?.completed_at ?? null,
        completed_at_is_backfilled: task?.completed_at_is_backfilled ?? null,
      };
    }),
    actual_schedule_counts: summarizeCounts(tasks, "schedule_status"),
    task_status_counts: dashboard.task_status_counts ?? null,
    workload_distribution: workload,
    overall_progress_pct: dashboard.overall_progress_pct ?? null,
    assignment_coverage_pct: dashboard.assignment_coverage_pct ?? null,
    due_date_coverage_pct: dashboard.due_date_coverage_pct ?? null,
    project_health: {
      data_status: health.data_status ?? null,
      metric_supported: health.metric_supported ?? null,
      planned_pct: health.planned_pct ?? null,
      actual_pct: health.actual_pct ?? null,
      variance_pct: health.variance_pct ?? null,
      stage: health.stage ?? null,
      rule_50_70_status: health.rule_50_70_status ?? null,
      rule_50_70_pass: health.rule_50_70_pass ?? null,
    },
  };
}

loadEnv();
const spec = buildSpec();
const client = makeClient(process.env.VITE_API_URL ?? "https://localhost:8800");
const auth = await authenticate(client);
const demoPassword = process.env.DEMO_PERSONA_PASSWORD ?? process.env.TEST_PASSWORD ?? "password123";
const permissions = Array.isArray((await client.get("/rbac/permissions")).data) ? (await client.get("/rbac/permissions")).data : [];
const stats = { rolesCreated: 0, usersCreated: 0, resourceRolesCreated: 0, resourceRolesUpdated: 0, projectCreated: 0, membershipsChanged: 0, tasksCreated: 0, tasksUpdated: 0, permissionsAdded: 0, globalRoleAssignments: 0 };
const accessRolesByKey = new Map();
const resourceRolesByKey = new Map();
const usersByKey = new Map();

for (const role of spec.roles) {
  const accessRole = await ensureRole(client, role.accessRole);
  if (accessRole.created) stats.rolesCreated += 1;
  accessRolesByKey.set(role.key, accessRole.item);
  const patterns = permissionNamesByRole()[role.key] ?? [];
  const permissionNames = permissions.filter((item) => patterns.some((re) => re.test(item.name))).map((item) => item.name);
  stats.permissionsAdded += await ensureRolePermissions(client, accessRole.item.id, permissionNames);

  const resourceRole = await ensureResourceRole(client, role.resourceRole);
  if (resourceRole.created) stats.resourceRolesCreated += 1;
  if (resourceRole.updated) stats.resourceRolesUpdated += 1;
  resourceRolesByKey.set(role.key, resourceRole.item);

  const user = await ensureUser(client, { ...role.user, password: demoPassword });
  if (user.created) stats.usersCreated += 1;
  usersByKey.set(role.key, user.item);
  if (await ensureRoleAssignment(client, user.item.id, accessRole.item.id)) stats.globalRoleAssignments += 1;
}

const project = await ensureProject(client, spec.project);
if (project.created) stats.projectCreated += 1;

for (const role of spec.roles) {
  const changed = await ensureProjectMember(client, project.item.id, {
    user_id: usersByKey.get(role.key).id,
    access_role_id: accessRolesByKey.get(role.key).id,
    resource_role_ids: [resourceRolesByKey.get(role.key).id],
  });
  if (changed) stats.membershipsChanged += 1;
}
stats.membershipsChanged += await pruneProjectMembers(
  client,
  project.item.id,
  new Set(spec.roles.map((role) => usersByKey.get(role.key).id)),
);

for (const task of spec.tasks) {
  const result = await upsertTask(client, project.item.id, {
    title: task.title,
    description: task.description,
    assignee: usersByKey.get(task.assigneeKey)?.id ?? null,
    status: task.status,
    progress: task.progress,
    progress_method: task.progress_method,
    start_date: task.start_date,
    due_date: task.due_date,
    end_date: task.end_date,
  });
  if (result.created) stats.tasksCreated += 1;
  if (result.updated) stats.tasksUpdated += 1;
}

const ownerClient = makeClient(process.env.VITE_API_URL ?? "https://localhost:8800");
await login(ownerClient, spec.roles.find((role) => role.key === "project_owner").user.email, demoPassword);
const verification = await verify(ownerClient, project.item.id, spec, usersByKey, accessRolesByKey, resourceRolesByKey);
const report = {
  generated_at: new Date().toISOString(),
  base_url: client.defaults.baseURL,
  auth_source: auth.source,
  auth_identity: auth.identity,
  project: { id: project.item.id, name: project.item.name },
  stats,
  verification,
};

await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log("[seed:team-demo] Completed.");
console.log(`[seed:team-demo] Project: ${project.item.name} (${project.item.id})`);
console.log(`[seed:team-demo] Verification: ${verification.ok ? "ok" : "issues found"}`);
console.log(`[seed:team-demo] Report: ${reportPath}`);

if (!verification.ok) {
  for (const issue of verification.issues) console.error(`- ${issue}`);
  process.exitCode = 1;
}
