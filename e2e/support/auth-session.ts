import { promises as fs } from "node:fs";
import path from "node:path";
import type { APIRequestContext, Page } from "@playwright/test";

type SessionUser = {
    id: string;
    name: string;
    email: string;
};

export type AuthSession = {
    token: string;
    user: SessionUser;
    permissions: unknown[];
    createdAt: string;
};

type OptionalSessionUser = Partial<SessionUser> | null;
type SessionFactory = () => Promise<AuthSession>;
type CredentialSessionOptions = {
    cacheKey?: string;
    purpose?: string;
    maxLoginAttempts?: number;
};
type CacheReadOptions = {
    allowStale?: boolean;
};

const AUTH_CACHE_DIR = path.resolve(process.cwd(), ".playwright", "auth");

const CACHE_TTL_MS = Number(process.env.PLAYWRIGHT_AUTH_CACHE_TTL_MS ?? 30 * 60 * 1000);
const LOCK_TIMEOUT_MS = Number(process.env.PLAYWRIGHT_AUTH_LOCK_TIMEOUT_MS ?? 240 * 1000);
const LOCK_STALE_MS = Number(process.env.PLAYWRIGHT_AUTH_LOCK_STALE_MS ?? 120 * 1000);

function sanitizeCacheKey(value: string) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "") || "default";
}

function getCachePaths(cacheKey: string) {
    const normalized = sanitizeCacheKey(cacheKey);
    return {
        cacheFile: path.join(AUTH_CACHE_DIR, `session-${normalized}.json`),
        lockFile: path.join(AUTH_CACHE_DIR, `session-${normalized}.lock`),
    };
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickEnv(names: string[], required = true): string | null {
    for (const name of names) {
        const value = process.env[name]?.trim();
        if (value) return value;
    }
    if (!required) return null;
    throw new Error(`Missing environment variable. Tried: ${names.join(", ")}`);
}

function parseRetryAfter(headers: Record<string, string>): number | null {
    const raw = headers["retry-after"];
    if (!raw) return null;
    const seconds = Number.parseInt(raw, 10);
    if (!Number.isFinite(seconds) || seconds <= 0) return null;
    return seconds * 1000;
}

function normalizeUser(input: unknown): SessionUser | null {
    if (!input || typeof input !== "object") return null;
    const candidate = input as Record<string, unknown>;
    const id = candidate.id;
    if (typeof id !== "string" || !id) return null;
    const name = typeof candidate.name === "string" && candidate.name
        ? candidate.name
        : (typeof candidate.full_name === "string" && candidate.full_name ? candidate.full_name : "Playwright User");
    const email = typeof candidate.email === "string" && candidate.email
        ? candidate.email
        : `${id}@example.local`;
    return { id, name, email };
}

function decodeJwtUser(token: string): SessionUser | null {
    try {
        const parts = token.split(".");
        if (parts.length < 2) return null;
        const payloadPart = parts[1];
        const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
        const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
        const rawJson = Buffer.from(padded, "base64").toString("utf8");
        const payload = JSON.parse(rawJson) as Record<string, unknown>;

        const idCandidate = payload.sub ?? payload.user_id ?? payload.id;
        if (typeof idCandidate !== "string" || !idCandidate) return null;

        const nameCandidate = payload.name ?? payload.full_name ?? payload.preferred_username;
        const emailCandidate = payload.email;
        const name = typeof nameCandidate === "string" && nameCandidate ? nameCandidate : "Playwright User";
        const email = typeof emailCandidate === "string" && emailCandidate ? emailCandidate : `${idCandidate}@example.local`;

        return { id: idCandidate, name, email };
    } catch {
        return null;
    }
}

async function fetchUserFromToken(
    request: APIRequestContext,
    token: string,
    maxAttempts = 6,
): Promise<SessionUser | null> {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const meResponse = await request.get("/api/auth/me", {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (meResponse.ok()) {
            const mePayload = await meResponse.json();
            const user = normalizeUser(mePayload);
            if (user) return user;
        }
        if (meResponse.status() === 401) return null;
        const retryAfter = parseRetryAfter(meResponse.headers());
        await sleep(retryAfter ?? 750 * attempt);
    }
    return null;
}

async function fetchEffectivePermissions(
    request: APIRequestContext,
    token: string,
    userId: string,
): Promise<unknown[]> {
    for (let attempt = 1; attempt <= 6; attempt += 1) {
        const response = await request.get(`/api/rbac/users/${userId}/effective-permissions`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok()) {
            const payload = await response.json();
            return Array.isArray(payload?.permissions) ? payload.permissions : [];
        }
        if (response.status() === 404 || response.status() === 403) {
            return [];
        }
        const retryAfter = parseRetryAfter(response.headers());
        await sleep(retryAfter ?? 500 * attempt);
    }
    return [];
}

async function createSessionFromToken(
    request: APIRequestContext,
    token: string,
    fallbackUser: OptionalSessionUser,
): Promise<AuthSession> {
    const userFromApi = await fetchUserFromToken(request, token, 8);
    if (userFromApi) {
        const permissions = await fetchEffectivePermissions(request, token, userFromApi.id);
        return {
            token,
            user: userFromApi,
            permissions,
            createdAt: new Date().toISOString(),
        };
    }

    const userFromToken = decodeJwtUser(token);
    if (userFromToken) {
        const permissions = await fetchEffectivePermissions(request, token, userFromToken.id);
        return {
            token,
            user: userFromToken,
            permissions,
            createdAt: new Date().toISOString(),
        };
    }

    const fallbackId = fallbackUser?.id;
    const fallbackName = fallbackUser?.name;
    const fallbackEmail = fallbackUser?.email;
    if (fallbackId && fallbackName && fallbackEmail) {
        const permissions = await fetchEffectivePermissions(request, token, fallbackId);
        return {
            token,
            user: {
                id: fallbackId,
                name: fallbackName,
                email: fallbackEmail,
            },
            permissions,
            createdAt: new Date().toISOString(),
        };
    }

    throw new Error(
        "PLAYWRIGHT_AUTH_TOKEN is set but user bootstrap failed. " +
        "Provide a valid token, or add TEST_EMAIL/TEST_PASSWORD as fallback credentials.",
    );
}

async function createSessionFromCredentials(
    request: APIRequestContext,
    email: string,
    password: string,
    maxAttempts = 12,
): Promise<AuthSession> {
    let lastError = "unknown";
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const loginResponse = await request.post("/api/auth/login", {
            data: { email, password },
        });
        if (!loginResponse.ok()) {
            lastError = `login status=${loginResponse.status()} attempt=${attempt}`;
            const retryAfter = parseRetryAfter(loginResponse.headers());
            const waitMs = loginResponse.status() === 429
                ? (retryAfter ?? 10_000)
                : Math.min(1000 * attempt, 5000);
            await sleep(waitMs);
            continue;
        }

        const loginPayload = await loginResponse.json();
        const token = typeof loginPayload?.token === "string"
            ? loginPayload.token
            : (typeof loginPayload?.access_token === "string" ? loginPayload.access_token : null);
        if (!token) {
            lastError = `missing token attempt=${attempt}`;
            await sleep(Math.min(1000 * attempt, 5000));
            continue;
        }

        let user = normalizeUser(loginPayload?.user ?? loginPayload);
        if (!user) {
            user = await fetchUserFromToken(request, token, 4);
        }
        if (!user) {
            user = decodeJwtUser(token);
        }
        if (!user) {
            lastError = `missing user attempt=${attempt}`;
            await sleep(Math.min(1000 * attempt, 5000));
            continue;
        }

        const permissions = await fetchEffectivePermissions(request, token, user.id);
        return {
            token,
            user,
            permissions,
            createdAt: new Date().toISOString(),
        };
    }

    throw new Error(`Unable to create auth session from credentials: ${lastError}`);
}

async function readCachedSession(cacheFile: string, options: CacheReadOptions = {}): Promise<AuthSession | null> {
    try {
        const raw = await fs.readFile(cacheFile, "utf8");
        const parsed = JSON.parse(raw) as AuthSession;
        if (!parsed?.token || !parsed?.user?.id) {
            return null;
        }
        const createdAtMs = Date.parse(parsed.createdAt ?? "");
        if (!Number.isFinite(createdAtMs)) {
            return null;
        }
        if (!options.allowStale && Date.now() - createdAtMs > CACHE_TTL_MS) {
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

async function writeCachedSession(cacheFile: string, session: AuthSession) {
    await fs.mkdir(AUTH_CACHE_DIR, { recursive: true });
    await fs.writeFile(cacheFile, JSON.stringify(session, null, 2), "utf8");
}

async function lockIsStale(lockFile: string): Promise<boolean> {
    try {
        const stat = await fs.stat(lockFile);
        return Date.now() - stat.mtimeMs > LOCK_STALE_MS;
    } catch {
        return false;
    }
}

async function acquireSessionLock(lockFile: string) {
    await fs.mkdir(AUTH_CACHE_DIR, { recursive: true });
    const start = Date.now();
    while (true) {
        try {
            const handle = await fs.open(lockFile, "wx");
            await handle.writeFile(String(Date.now()), "utf8");
            await handle.close();
            return async () => {
                await fs.unlink(lockFile).catch(() => {});
            };
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code !== "EEXIST") throw error;

            if (await lockIsStale(lockFile)) {
                await fs.unlink(lockFile).catch(() => {});
                continue;
            }

            if (Date.now() - start > LOCK_TIMEOUT_MS) {
                throw new Error("Timed out while waiting for auth session lock.");
            }
            await sleep(400);
        }
    }
}

async function getOrCreateSessionWithFactory(
    purpose: string,
    cacheKey: string,
    factory: SessionFactory,
): Promise<AuthSession> {
    const { cacheFile, lockFile } = getCachePaths(cacheKey);
    const cached = await readCachedSession(cacheFile);
    if (cached) return cached;

    const releaseLock = await acquireSessionLock(lockFile);
    try {
        const cachedAfterLock = await readCachedSession(cacheFile);
        if (cachedAfterLock) return cachedAfterLock;
        const session = await factory();
        await writeCachedSession(cacheFile, session);
        return session;
    } catch (error) {
        const staleCached = await readCachedSession(cacheFile, { allowStale: true });
        if (staleCached) {
            return staleCached;
        }
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to initialize ${purpose} auth session: ${detail}`);
    } finally {
        await releaseLock();
    }
}

export async function getOrCreateAuthSession(request: APIRequestContext, purpose = "e2e"): Promise<AuthSession> {
    return await getOrCreateSessionWithFactory(purpose, "default", async () => {
        const token = pickEnv(["PLAYWRIGHT_AUTH_TOKEN"], false);
        const fallbackUser: OptionalSessionUser = {
            id: pickEnv(["PLAYWRIGHT_USER_ID"], false) ?? undefined,
            name: pickEnv(["PLAYWRIGHT_USER_NAME"], false) ?? undefined,
            email: pickEnv(["PLAYWRIGHT_USER_EMAIL"], false) ?? undefined,
        };

        let session: AuthSession | null = null;
        if (token) {
            try {
                session = await createSessionFromToken(request, token, fallbackUser);
            } catch (error) {
                const emailFallback = pickEnv(["PLAYWRIGHT_USERNAME", "TEST_EMAIL"], false);
                const passwordFallback = pickEnv(["PLAYWRIGHT_PASSWORD", "TEST_PASSWORD"], false);
                if (!emailFallback || !passwordFallback) {
                    throw error;
                }
            }
        }

        if (!session) {
            const email = pickEnv(["PLAYWRIGHT_USERNAME", "TEST_EMAIL"], true);
            const password = pickEnv(["PLAYWRIGHT_PASSWORD", "TEST_PASSWORD"], true);
            session = await createSessionFromCredentials(request, email, password);
        }
        return session;
    });
}

export async function getOrCreateAuthSessionForCredentials(
    request: APIRequestContext,
    email: string,
    password: string,
    options: CredentialSessionOptions = {},
): Promise<AuthSession> {
    const purpose = options.purpose ?? "e2e persona";
    const cacheKey = options.cacheKey ?? `credential-${email}`;
    return await getOrCreateSessionWithFactory(purpose, cacheKey, async () => {
        return await createSessionFromCredentials(request, email, password, options.maxLoginAttempts ?? 12);
    });
}

export async function seedAuthState(page: Page, session: AuthSession) {
    await page.addInitScript((currentSession) => {
        window.localStorage.setItem("token", currentSession.token);
        window.localStorage.setItem("user", JSON.stringify(currentSession.user));
        window.localStorage.setItem("permissions", JSON.stringify(currentSession.permissions));
    }, session);
}
