import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";

function loadEnvFiles() {
    const nodeEnv = process.env.NODE_ENV ?? "development";
    const envFiles = [
        ".env",
        `.env.${nodeEnv}`,
        ".env.local",
        `.env.${nodeEnv}.local`,
    ];

    for (const file of envFiles) {
        const path = resolve(process.cwd(), file);
        if (!existsSync(path)) continue;

        const lines = readFileSync(path, "utf8").split(/\r?\n/);
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
                (value.startsWith('"') && value.endsWith('"'))
                || (value.startsWith("'") && value.endsWith("'"))
            ) {
                value = value.slice(1, -1);
            }
            process.env[key] = value.replace(/\\n/g, "\n");
        }
    }
}

loadEnvFiles();
const baseURL = process.env.BASE_URL || process.env.VITE_BASE_URL || "http://localhost:3001";

export default defineConfig({
    testDir: './e2e',
    timeout: 30 * 1000,
    expect: { timeout: 5000 },
    fullyParallel: true,
    reporter: [['list'], ['html', { open: 'never' }]],
    webServer: {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
        env: {
            ...process.env,
            VITE_API_CONCURRENCY: process.env.VITE_API_CONCURRENCY ?? "1",
            VITE_API_MIN_INTERVAL_MS: process.env.VITE_API_MIN_INTERVAL_MS ?? "250",
        },
    },
    use: {
        // BASE_URL overrides VITE_BASE_URL when both are present.
        baseURL,
        trace: 'retain-on-failure',
        headless: true,
        viewport: { width: 1280, height: 800 }
    },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
        { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    ],
});
