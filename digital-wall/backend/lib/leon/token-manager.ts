const ACCESS_TOKEN_TTL_MS = 30 * 60 * 1000;
const REFRESH_EARLY_MS = 60 * 1000;
const MAX_RETRIES = 3;

type TokenEntry = {
  accessToken: string;
  refreshedAtMs: number;
  expiresAtMs: number;
};

const tokenCache = new Map<string, TokenEntry>();
const inFlightRefresh = new Map<string, Promise<string>>();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRefreshTokenResponse(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as { access_token?: string; accessToken?: string };
      return (parsed.access_token || parsed.accessToken || "").trim();
    } catch {
      return "";
    }
  }
  return trimmed;
}

async function refreshAccessTokenOnce(oprId: string): Promise<string> {
  const refreshToken = String(process.env.LEON_ADMIN_REFRESH_TOKEN || "").trim();
  const sandbox = String(process.env.LEON_SANDBOX || "").toLowerCase() === "true";
  if (!refreshToken) {
    throw new Error("LEON_ADMIN_REFRESH_TOKEN is missing.");
  }

  const host = sandbox ? `${oprId}.sandbox.leon.aero` : `${oprId}.leon.aero`;
  const endpoint = `https://${host}/access_token/refresh/`;
  const body = new URLSearchParams({ refresh_token: refreshToken });
  const response = await fetch(endpoint, {
    method: "POST",
    body,
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    cache: "no-store",
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Leon token refresh failed for ${oprId}: ${response.status} ${text.slice(0, 220)}`);
  }

  const token = parseRefreshTokenResponse(text);
  if (!token) {
    throw new Error(`Leon token refresh returned empty token for ${oprId}.`);
  }

  const now = Date.now();
  tokenCache.set(oprId, {
    accessToken: token,
    refreshedAtMs: now,
    expiresAtMs: now + ACCESS_TOKEN_TTL_MS,
  });
  return token;
}

async function refreshWithRetry(oprId: string): Promise<string> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await refreshAccessTokenOnce(oprId);
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES) {
        await sleep(250 * attempt);
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function getLeonAccessToken(oprId: string): Promise<string> {
  const now = Date.now();
  const cached = tokenCache.get(oprId);
  if (cached && now < cached.expiresAtMs - REFRESH_EARLY_MS) {
    return cached.accessToken;
  }

  const pending = inFlightRefresh.get(oprId);
  if (pending) return pending;

  const promise = refreshWithRetry(oprId)
    .finally(() => {
      inFlightRefresh.delete(oprId);
    });
  inFlightRefresh.set(oprId, promise);
  return promise;
}

export async function refreshLeonAccessTokensForOperators(oprIds: string[]): Promise<string[]> {
  const refreshed: string[] = [];
  for (const oprId of oprIds) {
    await getLeonAccessToken(oprId);
    refreshed.push(oprId);
  }
  return refreshed;
}

export function getLeonTokenMeta(oprId: string) {
  const entry = tokenCache.get(oprId);
  if (!entry) return null;
  return {
    refreshedAt: new Date(entry.refreshedAtMs).toISOString(),
    expiresAt: new Date(entry.expiresAtMs).toISOString(),
  };
}
