type AccountDeletionEnvironment = {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const CONFIRMATION = "DELETE_ACCOUNT";
const MAX_BODY_BYTES = 1_024;
const MAX_TOKEN_LENGTH = 4_096;
const REAUTHENTICATION_WINDOW_SECONDS = 5 * 60;

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ ok: false, message }), {
    status,
    headers: { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" },
  });
}

function sameOriginBrowserRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin || request.headers.get("sec-fetch-site") !== "same-origin") return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

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

function hasRecentGoogleAuthentication(accessToken: string, verifiedUserId: string, nowSeconds: number): boolean {
  const payload = decodeAccessTokenPayload(accessToken);
  if (!payload || payload.sub !== verifiedUserId || payload.role !== "authenticated" || !Array.isArray(payload.amr)) {
    return false;
  }

  let newestGoogleAuthentication: number | null = null;
  for (const rawEntry of payload.amr) {
    if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) continue;
    const entry = rawEntry as { method?: unknown; timestamp?: unknown };
    if (entry.method !== "oauth" || !Number.isInteger(entry.timestamp)) continue;
    const timestamp = entry.timestamp as number;
    if (timestamp <= 0 || timestamp > nowSeconds) return false;
    newestGoogleAuthentication = Math.max(newestGoogleAuthentication ?? timestamp, timestamp);
  }

  return newestGoogleAuthentication !== null
    && nowSeconds - newestGoogleAuthentication <= REAUTHENTICATION_WINDOW_SECONDS;
}

function configuredEnvironment(environment: AccountDeletionEnvironment) {
  const url = environment.SUPABASE_URL?.trim().replace(/\/$/, "");
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return url?.startsWith("https://") && serviceRoleKey ? { url, serviceRoleKey } : null;
}

export async function handleAccountDeletion(
  request: Request,
  environment: AccountDeletionEnvironment,
  requestFn: FetchLike = fetch,
  nowSeconds = Math.floor(Date.now() / 1_000),
): Promise<Response> {
  if (!sameOriginBrowserRequest(request)) {
    return jsonError("같은 사이트의 설정 화면에서 다시 시도해주세요.", 403);
  }
  if (request.headers.get("x-ilgamcheck-delete-confirm") !== CONFIRMATION) {
    return jsonError("계정 삭제 확인값이 올바르지 않아요.", 400);
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return jsonError("요청 형식이 올바르지 않아요.", 415);
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return jsonError("요청 본문이 너무 커요.", 413);
  }
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.match(/^Bearer ([^\s]+)$/)?.[1];
  if (!token || token.length > MAX_TOKEN_LENGTH) {
    return jsonError("로그인 세션을 다시 확인해주세요.", 401);
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return jsonError("요청 본문을 읽지 못했어요.", 400);
  }
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return jsonError("요청 본문이 너무 커요.", 413);
  }
  try {
    const body = JSON.parse(rawBody) as { confirmation?: unknown };
    if (!body || typeof body !== "object" || body.confirmation !== CONFIRMATION) {
      return jsonError("계정 삭제 문구를 다시 확인해주세요.", 400);
    }
  } catch {
    return jsonError("요청 본문을 읽지 못했어요.", 400);
  }

  const configured = configuredEnvironment(environment);
  if (!configured) {
    return jsonError("계정 삭제 서버가 아직 안전하게 연결되지 않았어요.", 503);
  }

  let userResponse: Response;
  try {
    userResponse = await requestFn(`${configured.url}/auth/v1/user`, {
      headers: { apikey: configured.serviceRoleKey, Authorization: `Bearer ${token}` },
    });
  } catch {
    return jsonError("로그인 세션을 다시 확인해주세요.", 401);
  }
  if (!userResponse.ok) return jsonError("로그인 세션이 만료됐어요. 다시 로그인해주세요.", 401);

  let verifiedUserId: string | null = null;
  try {
    const verified = await userResponse.json() as { id?: unknown };
    verifiedUserId = typeof verified.id === "string" && verified.id ? verified.id : null;
  } catch {
    return jsonError("로그인 세션을 다시 확인해주세요.", 401);
  }
  if (!verifiedUserId || !hasRecentGoogleAuthentication(token, verifiedUserId, nowSeconds)) {
    return jsonError("Google로 다시 본인 확인한 뒤 시도해주세요.", 401);
  }

  try {
    const deletion = await requestFn(`${configured.url}/auth/v1/admin/users/${encodeURIComponent(verifiedUserId)}`, {
      method: "DELETE",
      headers: { apikey: configured.serviceRoleKey, Authorization: `Bearer ${configured.serviceRoleKey}` },
    });
    if (!deletion.ok) return jsonError("계정을 삭제하지 못했어요. 잠시 뒤 다시 시도해주세요.", 502);
  } catch {
    return jsonError("계정을 삭제하지 못했어요. 잠시 뒤 다시 시도해주세요.", 502);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" },
  });
}
