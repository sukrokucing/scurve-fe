import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const outputPath = path.join(root, "src", "types", "api.d.ts");
const localSpecPath = path.join(root, "src", "openapi.json");
const cliPath = path.join(root, "node_modules", "openapi-typescript", "bin", "cli.js");

function readArg(name, fallback) {
    const arg = process.argv.find((entry) => entry.startsWith(`${name}=`));
    if (!arg) return fallback;
    return arg.slice(name.length + 1);
}

function normalizeBaseUrl(baseUrl) {
    return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

function resolveInput(source) {
    if (source === "local") {
        if (!fs.existsSync(localSpecPath)) {
            throw new Error(`OpenAPI source file not found: ${localSpecPath}`);
        }
        return localSpecPath;
    }

    if (source === "remote") {
        const rawBaseUrl = process.env.VITE_API_URL ?? "https://localhost:8800";
        const openapiUrl = new URL("api-docs/openapi.json", normalizeBaseUrl(rawBaseUrl));
        return openapiUrl.toString();
    }

    throw new Error(`Unsupported source "${source}". Use --source=local or --source=remote.`);
}

function resolveEnvForInput(input) {
    const env = { ...process.env };
    try {
        const target = new URL(input);
        const isLocalHttps =
            target.protocol === "https:"
            && (target.hostname === "localhost" || target.hostname === "127.0.0.1")
            && env.NODE_TLS_REJECT_UNAUTHORIZED === undefined;
        if (isLocalHttps) {
            env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
        }
    } catch {
        // Ignore local file paths.
    }
    return env;
}

function main() {
    if (!fs.existsSync(cliPath)) {
        throw new Error(`openapi-typescript CLI not found: ${cliPath}. Run npm ci first.`);
    }

    const source = readArg("--source", "local");
    const input = resolveInput(source);
    const env = resolveEnvForInput(input);

    const result = spawnSync(process.execPath, [cliPath, input, "-o", outputPath], {
        cwd: root,
        stdio: "inherit",
        env,
    });

    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }

    console.log(`[generate:types] source=${source}`);
    console.log(`[generate:types] input=${input}`);
    console.log(`[generate:types] output=${outputPath}`);
}

try {
    main();
} catch (error) {
    console.error("[generate:types] failed");
    console.error(error);
    process.exit(1);
}
