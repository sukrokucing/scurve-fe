import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { spawn, spawnSync } from "node:child_process";

export const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

export function runCommand(command, args, options = {}) {
    const resolvedCommand = (
        command === npmCommand && typeof process.env.npm_execpath === "string"
    )
        ? process.execPath
        : command;

    const resolvedArgs = (
        command === npmCommand && typeof process.env.npm_execpath === "string"
    )
        ? [process.env.npm_execpath, ...args]
        : args;

    const result = spawnSync(resolvedCommand, resolvedArgs, {
        cwd: options.cwd ?? process.cwd(),
        stdio: options.stdio ?? "inherit",
        env: {
            ...process.env,
            ...(options.env ?? {}),
        },
    });
    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        const commandText = `${resolvedCommand} ${resolvedArgs.join(" ")}`;
        throw new Error(`Command failed (${result.status}): ${commandText}`);
    }
}

export function timedRun(command, args, options = {}) {
    const startedAt = performance.now();
    runCommand(command, args, options);
    return Math.round(performance.now() - startedAt);
}

export async function ensureDir(dirPath) {
    await fs.mkdir(dirPath, { recursive: true });
}

export async function readJson(filePath) {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
}

export async function writeJson(filePath, value) {
    await ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function median(values) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 1) return sorted[middle];
    return Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

export async function walkFiles(rootDir) {
    const entries = await fs.readdir(rootDir, { withFileTypes: true });
    const nested = await Promise.all(
        entries.map(async (entry) => {
            const fullPath = path.join(rootDir, entry.name);
            if (entry.isDirectory()) {
                return walkFiles(fullPath);
            }
            return fullPath;
        }),
    );
    return nested.flat();
}

export async function hashFile(filePath) {
    const content = await fs.readFile(filePath);
    return crypto.createHash("sha256").update(content).digest("hex");
}

export function toPosixPath(filePath) {
    return filePath.split(path.sep).join("/");
}

function parseBaseUrl(value) {
    try {
        return new URL(value);
    } catch {
        return new URL("http://localhost:3001");
    }
}

export async function getAvailablePort(preferredPort = 3001) {
    async function probe(port) {
        return new Promise((resolve, reject) => {
            const server = net.createServer();
            server.unref();
            server.on("error", reject);
            server.listen(port, "127.0.0.1", () => {
                const address = server.address();
                const resolvedPort = typeof address === "object" && address ? address.port : port;
                server.close(() => resolve(resolvedPort));
            });
        });
    }

    try {
        return await probe(preferredPort);
    } catch {
        return probe(0);
    }
}

export async function waitForServer(url, timeoutMs = 120000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        try {
            const response = await fetch(url.toString(), { method: "GET" });
            if (response.status >= 200 && response.status < 500) {
                return;
            }
        } catch {
            // Continue polling until timeout.
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error(`Timed out waiting for dev server at ${url.toString()}`);
}

export async function startDevServer(cwd, overrides = {}) {
    const baseUrl = parseBaseUrl(overrides.baseUrl ?? process.env.BASE_URL ?? process.env.VITE_BASE_URL ?? "http://localhost:3001");
    const preferredPort = Number.parseInt(baseUrl.port || (baseUrl.protocol === "https:" ? "443" : "80"), 10);
    const port = Number.isFinite(preferredPort) ? await getAvailablePort(preferredPort) : await getAvailablePort(3001);
    const host = overrides.host ?? "127.0.0.1";
    const resolvedBaseUrl = new URL(baseUrl.toString());
    resolvedBaseUrl.hostname = host;
    resolvedBaseUrl.port = String(port);

    const baseArgs = ["run", "dev", "--", "--host", host, "--port", String(port)];
    const resolvedCommand = typeof process.env.npm_execpath === "string"
        ? process.execPath
        : npmCommand;
    const resolvedArgs = typeof process.env.npm_execpath === "string"
        ? [process.env.npm_execpath, ...baseArgs]
        : baseArgs;

    const devProcess = spawn(resolvedCommand, resolvedArgs, {
        cwd,
        env: {
            ...process.env,
            BASE_URL: resolvedBaseUrl.toString(),
            VITE_BASE_URL: resolvedBaseUrl.toString(),
            NODE_TLS_REJECT_UNAUTHORIZED: process.env.NODE_TLS_REJECT_UNAUTHORIZED ?? "0",
            ...(overrides.env ?? {}),
        },
        stdio: "ignore",
        detached: process.platform !== "win32",
    });

    await waitForServer(resolvedBaseUrl, overrides.timeoutMs ?? 120000);
    return {
        process: devProcess,
        baseUrl: resolvedBaseUrl,
    };
}

export async function stopDevServer(devProcess) {
    if (!devProcess || devProcess.killed) return;
    try {
        if (process.platform === "win32") {
            spawnSync("taskkill", ["/PID", String(devProcess.pid), "/T", "/F"], { stdio: "ignore" });
        } else {
            process.kill(-devProcess.pid, "SIGTERM");
        }
    } catch {
        // Ignore teardown errors.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
}
