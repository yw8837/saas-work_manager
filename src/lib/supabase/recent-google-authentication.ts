const REAUTHENTICATION_WINDOW_SECONDS = 5 * 60;

function decodeAccessTokenPayload(accessToken: string): Record<string, unknown> | null {
  const parts = accessToken.split(".");
  if (parts.length !== 3 || !parts[1]) return null;

  try {
    const encoded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
    const decoded = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    return decoded && typeof decoded === "object" && !Array.isArray(decoded)
      ? decoded as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

export function hasRecentGoogleAuthentication(
  accessToken: string,
  verifiedUserId: string,
  nowSeconds = Math.floor(Date.now() / 1_000),
): boolean {
  const payload = decodeAccessTokenPayload(accessToken);
  if (!payload || payload.sub !== verifiedUserId || payload.role !== "authenticated" || !Array.isArray(payload.amr)) {
    return false;
  }

  let newestGoogleAuthentication: number | null = null;
  for (const rawEntry of payload.amr) {
    if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) continue;
    const entry = rawEntry as { method?: unknown; timestamp?: unknown };
    if (entry.method !== "oauth") continue;
    if (!Number.isInteger(entry.timestamp)) return false;
    const timestamp = entry.timestamp as number;
    if (timestamp <= 0 || timestamp > nowSeconds) return false;
    newestGoogleAuthentication = Math.max(newestGoogleAuthentication ?? timestamp, timestamp);
  }

  return newestGoogleAuthentication !== null
    && nowSeconds - newestGoogleAuthentication <= REAUTHENTICATION_WINDOW_SECONDS;
}
