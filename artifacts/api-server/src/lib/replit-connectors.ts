import { logger } from "./logger.js";

/**
 * Bridge to Replit-managed connectors.
 *
 * The api-server runtime has access to two env vars injected by Replit:
 *   - REPLIT_CONNECTORS_HOSTNAME — host of the connectors service
 *   - REPL_IDENTITY (live)         /  WEB_REPL_RENEWAL (deployed) — caller token
 *
 * We use them to fetch the credentials of any connector the user added to
 * this Repl. Today we only consume the `resend` connector (api_key +
 * from_email), but the helper is generic enough to extend.
 *
 * Cached for 60s — long enough to avoid hammering the connectors service on
 * every request, short enough that a re-add or rotation surfaces quickly.
 */

interface ResendConnectorSettings {
  api_key?: string;
  from_email?: string;
}

const CACHE_TTL_MS = 60_000;

let resendCache: { settings: ResendConnectorSettings | null; fetchedAt: number } | null = null;

function getReplitToken(): string | null {
  if (process.env.REPL_IDENTITY) return `repl ${process.env.REPL_IDENTITY}`;
  if (process.env.WEB_REPL_RENEWAL) return `depl ${process.env.WEB_REPL_RENEWAL}`;
  return null;
}

export async function getResendConnectorSettings(): Promise<ResendConnectorSettings | null> {
  const now = Date.now();
  if (resendCache && now - resendCache.fetchedAt < CACHE_TTL_MS) {
    return resendCache.settings;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = getReplitToken();
  if (!hostname || !xReplitToken) {
    resendCache = { settings: null, fetchedAt: now };
    return null;
  }

  try {
    const res = await fetch(
      `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=resend`,
      {
        headers: {
          Accept: "application/json",
          "X-Replit-Token": xReplitToken,
        },
      },
    );

    if (!res.ok) {
      logger.warn(
        { status: res.status },
        "Failed to fetch Resend connector from Replit connectors service",
      );
      resendCache = { settings: null, fetchedAt: now };
      return null;
    }

    const data = (await res.json()) as {
      items?: Array<{ settings?: ResendConnectorSettings }>;
    };
    const settings = data.items?.[0]?.settings ?? null;
    resendCache = { settings, fetchedAt: now };
    return settings;
  } catch (err) {
    logger.warn({ err }, "Error fetching Resend connector from Replit connectors service");
    resendCache = { settings: null, fetchedAt: now };
    return null;
  }
}

export function invalidateResendConnectorCache(): void {
  resendCache = null;
}
