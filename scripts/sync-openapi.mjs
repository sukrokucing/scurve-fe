import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import http from "node:http";
import https from "node:https";

const root = process.cwd();

function normalizeBaseUrl(baseUrl) {
    return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

function shouldAllowInsecureTls(url) {
    if (url.protocol !== "https:") return false;
    if (process.env.OPENAPI_ALLOW_INSECURE === "1") return true;
    if (process.env.OPENAPI_ALLOW_INSECURE === "0") return false;
    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
}

function fetchText(url, allowInsecureTls) {
    const client = url.protocol === "https:" ? https : http;
    return new Promise((resolve, reject) => {
        const req = client.request(
            url,
            {
                method: "GET",
                headers: { Accept: "application/json" },
                rejectUnauthorized: !allowInsecureTls,
            },
            (res) => {
                const chunks = [];
                res.on("data", (chunk) => chunks.push(chunk));
                res.on("end", () => {
                    const body = Buffer.concat(chunks).toString("utf8");
                    if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
                        reject(new Error(`OpenAPI fetch failed (${res.statusCode}): ${body.slice(0, 300)}`));
                        return;
                    }
                    resolve(body);
                });
            },
        );
        req.on("error", reject);
        req.end();
    });
}

async function writeJson(filePath, jsonText) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${jsonText}\n`, "utf8");
}

async function main() {
    const rawBaseUrl = process.env.VITE_API_URL ?? "https://localhost:8800";
    const openapiUrl = new URL("api-docs/openapi.json", normalizeBaseUrl(rawBaseUrl));
    const allowInsecureTls = shouldAllowInsecureTls(openapiUrl);

    const jsonTextRaw = await fetchText(openapiUrl, allowInsecureTls);
    const parsed = JSON.parse(jsonTextRaw);
    const normalizedJson = JSON.stringify(parsed, null, 2);

    const targets = [
        path.join(root, "src", "openapi.json"),
        path.join(root, "artifacts", "backend-openapi.json"),
        path.join(root, "openapi.json"),
    ];

    await Promise.all(targets.map((target) => writeJson(target, normalizedJson)));

    console.log(`[sync:openapi] source=${openapiUrl.toString()}`);
    console.log(`[sync:openapi] insecure_tls=${allowInsecureTls ? "true" : "false"}`);
    targets.forEach((target) => {
        console.log(`[sync:openapi] wrote ${target}`);
    });
}

main().catch((error) => {
    console.error("[sync:openapi] failed");
    console.error(error);
    process.exit(1);
});
