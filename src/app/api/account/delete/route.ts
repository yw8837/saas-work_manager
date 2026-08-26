import { getSupabaseAdminClient } from "@/lib/supabase/server-admin";

export const dynamic = "force-dynamic";

const CONFIRMATION = "DELETE_ACCOUNT";
const MAX_BODY_BYTES = 1_024;
const MAX_TOKEN_LENGTH = 4_096;
const REAUTHENTICATION_WINDOW_SECONDS = 5 * 60;

type AccessTokenPayload = {
  sub?: unknown;
  role?: unknown;
  amr?: unknown;
};

function jsonError(message: string, status: number) {
  return Response.json(
    { ok: false, message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function isSameOriginBrowserRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (!origin || fetchSite !== "same-origin") return false;

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function hasRecentGoogleAuthentication(
  accessToken: string,
  verifiedUserId: string,
  nowSeconds = Math.floor(Date.now() / 1_000),
): boolean {
  const parts = accessToken.split(".");
  if (parts.length !== 3 || !parts[1]) return false;

  let payload: AccessTokenPayload;
  try {
    const decoded = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as unknown;
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) return false;
    payload = decoded as AccessTokenPayload;
  } catch {
    return false;
  }

  if (payload.sub !== verifiedUserId || payload.role !== "authenticated" || !Array.isArray(payload.amr)) {
    return false;
  }

  let mostRecentGoogleTimestamp: number | null = null;
  for (const rawEntry of payload.amr) {
    if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) continue;
    const entry = rawEntry as { method?: unknown; timestamp?: unknown };
    if (entry.method !== "oauth") continue;
    if (!Number.isInteger(entry.timestamp) || (entry.timestamp as number) <= 0) return false;

    const timestamp = entry.timestamp as number;
    if (timestamp > nowSeconds) return false;
    mostRecentGoogleTimestamp = Math.max(mostRecentGoogleTimestamp ?? timestamp, timestamp);
  }

  return mostRecentGoogleTimestamp !== null
    && nowSeconds - mostRecentGoogleTimestamp <= REAUTHENTICATION_WINDOW_SECONDS;
}

export async function POST(request: Request) {
  if (!isSameOriginBrowserRequest(request)) {
    return jsonError("같은 사이트의 설정 화면에서 다시 시도해주세요.", 403);
  }

  if (request.headers.get("x-ilgamcheck-delete-confirm") !== CONFIRMATION) {
    return jsonError("계정 삭제 확인값이 올바르지 않아요.", 400);
  }

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (!contentType.startsWith("application/json")) {
    return jsonError("요청 형식이 올바르지 않아요.", 415);
  }
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return jsonError("요청 본문이 너무 커요.", 413);
  }

  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer ([^\s]+)$/);
  const accessToken = match?.[1];
  if (!accessToken || accessToken.length > MAX_TOKEN_LENGTH) {
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

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return jsonError("요청 본문을 읽지 못했어요.", 400);
  }
  if (!body || typeof body !== "object" || (body as { confirmation?: unknown }).confirmation !== CONFIRMATION) {
    return jsonError("계정 삭제 문구를 다시 확인해주세요.", 400);
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return jsonError("계정 삭제 서버가 아직 안전하게 연결되지 않았어요.", 503);
  }

  const { data: verified, error: verificationError } = await admin.auth.getUser(accessToken);
  if (verificationError || !verified.user) {
    return jsonError("로그인 세션이 만료됐어요. 다시 로그인해주세요.", 401);
  }

  // getUser가 같은 토큰을 검증한 뒤에만 JWT의 AMR을 신뢰한다. refresh만으로는
  // 부족하고, 최근 Google OAuth 인증이 기록된 토큰이어야 한다.
  if (!hasRecentGoogleAuthentication(accessToken, verified.user.id)) {
    return jsonError("Google로 다시 본인 확인한 뒤 시도해주세요.", 401);
  }

  // 요청 본문에서 삭제 대상을 받지 않는다. 검증된 토큰 소유자만 삭제할 수 있다.
  const { error: deletionError } = await admin.auth.admin.deleteUser(verified.user.id, false);
  if (deletionError) {
    return jsonError("계정을 삭제하지 못했어요. 잠시 뒤 다시 시도해주세요.", 502);
  }

  return Response.json(
    { ok: true },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
