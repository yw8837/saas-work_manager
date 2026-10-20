import { hasRecentGoogleAuthentication } from "@/lib/supabase/recent-google-authentication";
import { configuredSupabaseProjectRef } from "@/lib/supabase/mode";
import { readAccountDeletionBody } from "@/lib/security/account-delete-body";
import { trustedAccountDeletionOrigin, withNativeApiCors } from "@/lib/security/native-api";

type AccountDeletionEnvironment = {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const CONFIRMATION = "DELETE_ACCOUNT";
const MAX_BODY_BYTES = 1_024;
const MAX_TOKEN_LENGTH = 4_096;

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ ok: false, message }), {
    status,
    headers: { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" },
  });
}

function configuredEnvironment(environment: AccountDeletionEnvironment) {
  const projectRef = configuredSupabaseProjectRef(environment.SUPABASE_URL);
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return projectRef && serviceRoleKey
    ? { url: `https://${projectRef}.supabase.co`, serviceRoleKey }
    : null;
}

export async function handleAccountDeletion(
  request: Request,
  environment: AccountDeletionEnvironment,
  requestFn: FetchLike = fetch,
  nowSeconds = Math.floor(Date.now() / 1_000),
): Promise<Response> {
  return withNativeApiCors(await deleteVerifiedAccount(request, environment, requestFn, nowSeconds), request);
}

async function deleteVerifiedAccount(
  request: Request, environment: AccountDeletionEnvironment, requestFn: FetchLike, nowSeconds: number,
): Promise<Response> {
  if (!trustedAccountDeletionOrigin(request)) {
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

  const bodyResult = await readAccountDeletionBody(request);
  if (!bodyResult.ok) {
    return jsonError(bodyResult.status === 413 ? "요청 본문이 너무 커요."
      : bodyResult.status === 408 ? "요청 시간이 초과됐어요. 다시 시도해주세요."
      : "요청 본문을 읽지 못했어요.", bodyResult.status);
  }
  try {
    const body = JSON.parse(bodyResult.text) as { confirmation?: unknown };
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
