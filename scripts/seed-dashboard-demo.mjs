import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import https from "node:https";
import { existsSync, readFileSync } from "node:fs";
import axios from "axios";

const root = process.cwd();

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

function normalizeBaseUrl(baseUrl) {
    return baseUrl.replace(/\/+$/, "");
}

function createClient(baseUrl) {
    const parsed = new URL(baseUrl);
    const allowInsecure = (
        process.env.DEMO_ALLOW_INSECURE === "1"
        || (parsed.protocol === "https:" && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1"))
    );

    return axios.create({
        baseURL: normalizeBaseUrl(baseUrl),
        headers: { "Content-Type": "application/json" },
        httpsAgent: parsed.protocol === "https:"
            ? new https.Agent({ rejectUnauthorized: !allowInsecure })
            : undefined,
    });
}

function isoOffsetDays(days, hour = 9) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + days);
    date.setUTCHours(hour, 0, 0, 0);
    return date.toISOString();
}

function buildDemoPlanPoints() {
    const offsets = [-14, -10, -6, -2, 2, 6, 10, 14];
    const percentages = [5, 15, 30, 45, 60, 75, 90, 100];
    return offsets.map((offset, index) => ({
        date: isoOffsetDays(offset, 9),
        planned_progress: percentages[index],
    }));
}

function buildDemoTasks() {
    return [
        {
            title: "Kickoff and baseline scope",
            description: "Finalize scope and baseline assumptions for the project dashboard.",
            status: "done",
            progress: 100,
            start_date: isoOffsetDays(-14, 9),
            end_date: isoOffsetDays(-10, 17),
            due_date: isoOffsetDays(-10, 17),
            progressHistory: [30, 65, 100],
        },
        {
            title: "Backend API integration",
            description: "Integrate API data fetches for dashboard KPIs and timeline.",
            status: "in_progress",
            progress: 65,
            start_date: isoOffsetDays(-9, 9),
            end_date: isoOffsetDays(-1, 17),
            due_date: isoOffsetDays(2, 17),
            progressHistory: [20, 45, 65],
        },
        {
            title: "Frontend visualization polish",
            description: "Refine chart behavior and visual hierarchy for dashboard widgets.",
            status: "in_progress",
            progress: 45,
            start_date: isoOffsetDays(-7, 9),
            end_date: isoOffsetDays(4, 17),
            due_date: isoOffsetDays(6, 17),
            progressHistory: [10, 28, 45],
        },
        {
            title: "Cross-browser QA pass",
            description: "Validate dashboard behavior in Chromium and Firefox.",
            status: "pending",
            progress: 10,
            start_date: isoOffsetDays(-3, 9),
            end_date: isoOffsetDays(8, 17),
            due_date: isoOffsetDays(10, 17),
            progressHistory: [0, 10],
        },
        {
            title: "Telemetry verification",
            description: "Verify time-to-task and dashboard telemetry emission and aggregation.",
            status: "blocked",
            progress: 30,
            start_date: isoOffsetDays(-5, 9),
            end_date: isoOffsetDays(3, 17),
            due_date: isoOffsetDays(5, 17),
            progressHistory: [12, 24, 30],
        },
        {
            title: "Release readiness review",
            description: "Prepare release notes and governance review summary.",
            status: "pending",
            progress: 0,
            start_date: isoOffsetDays(1, 9),
            end_date: isoOffsetDays(12, 17),
            due_date: isoOffsetDays(13, 17),
            progressHistory: [0],
        },
    ];
}

async function login(client, email, password) {
    const response = await client.post("/auth/login", { email, password });
    const token = response.data?.token;
    if (!token) throw new Error("Login succeeded but token is missing.");
    client.defaults.headers.Authorization = `Bearer ${token}`;
    return token;
}

async function createProject(client, projectPayload) {
    const response = await client.post("/projects", projectPayload);
    return response.data;
}

async function createTask(client, projectId, taskPayload) {
    const response = await client.post(`/projects/${projectId}/tasks`, taskPayload);
    return response.data;
}

async function createProgressEntry(client, projectId, taskId, progress, note) {
    const response = await client.post(`/projects/${projectId}/tasks/${taskId}/progress`, {
        progress,
        note,
    });
    return response.data;
}

async function seedDashboardDemo() {
    loadEnvFiles();

    const baseUrl = process.env.VITE_API_URL ?? "https://localhost:8800";
    const appUrl = process.env.VITE_BASE_URL ?? "http://localhost:3001";
    const adminEmail = process.env.DEMO_ADMIN_EMAIL ?? process.env.TEST_EMAIL;
    const adminPassword = process.env.DEMO_ADMIN_PASSWORD ?? process.env.TEST_PASSWORD;

    if (!adminEmail || !adminPassword) {
        throw new Error("Missing admin credentials. Set TEST_EMAIL/TEST_PASSWORD (or DEMO_ADMIN_EMAIL/DEMO_ADMIN_PASSWORD).");
    }

    const client = createClient(baseUrl);
    await login(client, adminEmail, adminPassword);

    const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
    const projectName = `Dashboard Demo ${timestamp}`;
    const createdProject = await createProject(client, {
        name: projectName,
        description: "Dummy project for dashboard functionality trials (plan + task progress).",
        theme_color: "#0EA5A4",
    });

    const planPoints = buildDemoPlanPoints();
    await client.post(`/projects/${createdProject.id}/plan`, planPoints);

    const demoTasks = buildDemoTasks();
    const createdTasks = [];
    let createdProgressEntries = 0;

    for (const task of demoTasks) {
        const createdTask = await createTask(client, createdProject.id, {
            title: task.title,
            description: task.description,
            status: task.status,
            progress: task.progress,
            start_date: task.start_date,
            end_date: task.end_date,
            due_date: task.due_date,
        });
        createdTasks.push({
            id: createdTask.id,
            title: createdTask.title,
            status: createdTask.status,
            progress: createdTask.progress,
        });

        for (const progressValue of task.progressHistory) {
            await createProgressEntry(
                client,
                createdProject.id,
                createdTask.id,
                progressValue,
                `Dashboard demo snapshot: ${progressValue}%`,
            );
            createdProgressEntries += 1;
        }
    }

    const dashboard = (await client.get(`/projects/${createdProject.id}/dashboard`, {
        params: { metric: "progress" },
    })).data;
    const healthProgress = (await client.get(`/projects/${createdProject.id}/s-curve/health`, {
        params: { metric: "progress" },
    })).data;
    const healthHours = (await client.get(`/projects/${createdProject.id}/s-curve/health`, {
        params: { metric: "hours" },
    })).data;
    const healthCost = (await client.get(`/projects/${createdProject.id}/s-curve/health`, {
        params: { metric: "cost" },
    })).data;
    const portfolio = (await client.get("/portfolio/s-curve/summary", {
        params: { metric: "progress" },
    })).data;

    const report = {
        generated_at: new Date().toISOString(),
        base_url: normalizeBaseUrl(baseUrl),
        app_url: normalizeBaseUrl(appUrl),
        seeded_project: {
            id: createdProject.id,
            name: createdProject.name,
        },
        created_counts: {
            tasks: createdTasks.length,
            progress_entries: createdProgressEntries,
            plan_points: planPoints.length,
        },
        verification: {
            dashboard: {
                plan_points: Array.isArray(dashboard?.plan) ? dashboard.plan.length : 0,
                actual_points: Array.isArray(dashboard?.actual) ? dashboard.actual.length : 0,
            },
            s_curve_health_progress: {
                rule_50_70_status: healthProgress?.rule_50_70_status ?? null,
                rule_50_70_pass: healthProgress?.rule_50_70_pass ?? null,
                stage: healthProgress?.stage ?? null,
                actual_pct: healthProgress?.actual_pct ?? null,
                planned_pct: healthProgress?.planned_pct ?? null,
                variance_pct: healthProgress?.variance_pct ?? null,
            },
            s_curve_health_hours: {
                rule_50_70_status: healthHours?.rule_50_70_status ?? null,
                actual_pct: healthHours?.actual_pct ?? null,
                planned_pct: healthHours?.planned_pct ?? null,
            },
            s_curve_health_cost: {
                rule_50_70_status: healthCost?.rule_50_70_status ?? null,
                actual_pct: healthCost?.actual_pct ?? null,
                planned_pct: healthCost?.planned_pct ?? null,
            },
            portfolio: {
                metric: portfolio?.metric ?? null,
                project_count: portfolio?.project_count ?? null,
            },
        },
        quick_open_routes: [
            `${normalizeBaseUrl(appUrl)}/`,
            `${normalizeBaseUrl(appUrl)}/projects/${createdProject.id}/dashboard`,
            `${normalizeBaseUrl(appUrl)}/tasks`,
        ],
    };

    const reportPath = path.join(root, "artifacts", "dashboard-demo-seed.json");
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

    console.log("[seed:dashboard-demo] Completed.");
    console.log(`[seed:dashboard-demo] Project: ${createdProject.name} (${createdProject.id})`);
    console.log(`[seed:dashboard-demo] Created tasks: ${createdTasks.length}`);
    console.log(`[seed:dashboard-demo] Created progress entries: ${createdProgressEntries}`);
    console.log(`[seed:dashboard-demo] Dashboard points: plan=${report.verification.dashboard.plan_points}, actual=${report.verification.dashboard.actual_points}`);
    console.log(`[seed:dashboard-demo] Report: ${reportPath}`);
    console.log(`[seed:dashboard-demo] Open: ${normalizeBaseUrl(appUrl)}/projects/${createdProject.id}/dashboard`);
}

seedDashboardDemo().catch((error) => {
    console.error("[seed:dashboard-demo] failed");
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
