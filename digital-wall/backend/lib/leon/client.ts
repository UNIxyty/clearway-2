import { getLeonAccessToken } from "@/lib/leon/token-manager";

const MAX_REQUEST_RETRIES = 3;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function leonGraphqlRequest<T>(
  oprId: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const sandbox = String(process.env.LEON_SANDBOX || "").toLowerCase() === "true";
  const host = sandbox ? `${oprId}.sandbox.leon.aero` : `${oprId}.leon.aero`;
  const endpoint = `https://${host}/api/graphql/`;

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_REQUEST_RETRIES; attempt += 1) {
    try {
      const token = await getLeonAccessToken(oprId);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          query,
          variables: variables || {},
        }),
        cache: "no-store",
      });

      const bodyText = await response.text();
      if (!response.ok) {
        throw new Error(`Leon GraphQL ${response.status}: ${bodyText.slice(0, 260)}`);
      }

      const payload = JSON.parse(bodyText) as {
        data?: T;
        errors?: Array<{ message?: string }>;
      };
      if (payload.errors?.length) {
        throw new Error(payload.errors.map((x) => x.message || "Unknown GraphQL error").join("; "));
      }
      if (!payload.data) {
        throw new Error("Leon GraphQL returned no data.");
      }
      return payload.data;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_REQUEST_RETRIES) {
        await sleep(250 * attempt);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
