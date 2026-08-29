import { projectRefIssue } from "./supabase-cli-policy.mjs";
import { normalizeAuthSiteUrl } from "./supabase-config-push-policy.mjs";

export const SUPABASE_MANAGEMENT_ORIGIN = "https://api.supabase.com";
export const DEFAULT_AUTH_READBACK_TIMEOUT_MS = 10_000;
export const DEFAULT_AUTH_READBACK_MAX_BYTES = 64 * 1024;

function authRedirectAllowListIssue(rawAllowList, expectedOrigin) {
  const expectedUrls = [`${expectedOrigin}/today`, `${expectedOrigin}/settings`];
  let entries;

  // Supabase CLI 2.114.0 serializes additional_redirect_urls with join(","),
  // while accepting an array here keeps the readback fail-closed if the API
  // starts returning its source representation directly.
  if (typeof rawAllowList === "string") {
    entries = rawAllowList.split(",");
  } else if (Array.isArray(rawAllowList)) {
    entries = rawAllowList;
  } else {
    return "Supabase Auth config의 uri_allow_list가 없습니다.";
  }

  // Do not URL-normalize remote entries: encoded/case/trailing-path variants,
  // credentials, query strings, fragments, wildcards, and duplicate entries
  // must never become equivalent to the two literal callbacks we configured.
  if (
    entries.length !== expectedUrls.length
    || entries.some((entry, index) => typeof entry !== "string" || entry !== expectedUrls[index])
  ) {
    return "Supabase Auth config의 uri_allow_list는 현재 배포 origin의 /today와 /settings만 허용해야 합니다.";
  }

  return null;
}

function jsonContentTypeIssue(headers) {
  const contentType = headers?.get?.("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (contentType === "application/json" || contentType.endsWith("+json")) return null;
  return "Supabase Management API 응답이 JSON content-type이 아닙니다.";
}

function safePositiveInteger(value, fallback, maximum) {
  if (!Number.isSafeInteger(value) || value < 1) return fallback;
  return Math.min(value, maximum);
}

async function readLimitedText(response, maxBytes) {
  const rawLength = response.headers.get("content-length");
  if (rawLength && /^\d+$/.test(rawLength) && Number(rawLength) > maxBytes) {
    return { issue: `Supabase Management API 응답이 ${maxBytes} byte 제한을 넘었습니다.` };
  }

  if (!response.body?.getReader) {
    return { issue: "Supabase Management API 응답 body를 읽을 수 없습니다." };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let byteLength = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > maxBytes) {
        await reader.cancel().catch(() => {});
        return { issue: `Supabase Management API 응답이 ${maxBytes} byte 제한을 넘었습니다.` };
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return { text };
  } catch {
    return { issue: "Supabase Management API 응답 body 조회에 실패했습니다." };
  }
}

export function supabaseAuthConfigIssue(config, expectedOrigin) {
  let expected;
  try {
    expected = normalizeAuthSiteUrl(expectedOrigin);
  } catch (error) {
    return error instanceof Error ? error.message : "Auth Site URL이 올바르지 않습니다.";
  }

  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return "Supabase Auth config 응답 형식이 올바르지 않습니다.";
  }

  if (typeof config.site_url !== "string") {
    return "Supabase Auth config의 site_url이 없습니다.";
  }
  let current;
  try {
    current = normalizeAuthSiteUrl(config.site_url);
  } catch {
    return "Supabase Auth config의 site_url이 유효한 HTTPS origin이 아닙니다.";
  }
  if (current !== expected) {
    return "Supabase Auth config의 site_url이 현재 배포 origin과 다릅니다.";
  }

  if (config.disable_signup !== false) {
    return "Supabase Auth config의 전체 신규 가입(disable_signup)이 열려 있지 않습니다.";
  }

  if (config.external_google_enabled !== true) {
    return "Supabase Auth config의 Google 로그인 제공자(external_google_enabled)가 활성화되지 않았습니다.";
  }
  if (config.external_email_enabled !== false) {
    return "Supabase Auth config의 이메일 로그인 제공자(external_email_enabled)를 꺼야 합니다.";
  }

  const redirectIssue = authRedirectAllowListIssue(config.uri_allow_list, expected);
  if (redirectIssue) return redirectIssue;

  return null;
}

export async function supabaseAuthReadbackIssue({
  projectRef,
  expectedOrigin,
  accessToken,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_AUTH_READBACK_TIMEOUT_MS,
  maxResponseBytes = DEFAULT_AUTH_READBACK_MAX_BYTES,
} = {}) {
  const refIssue = projectRefIssue(projectRef);
  if (refIssue) return refIssue;

  try {
    normalizeAuthSiteUrl(expectedOrigin);
  } catch (error) {
    return error instanceof Error ? error.message : "Auth Site URL이 올바르지 않습니다.";
  }

  const token = typeof accessToken === "string" ? accessToken.trim() : "";
  if (!token) return "SUPABASE_ACCESS_TOKEN이 현재 shell에 없습니다.";
  if (token.length > 4096 || /[\u0000-\u001f\u007f]/.test(token)) {
    return "SUPABASE_ACCESS_TOKEN 형식이 올바르지 않습니다.";
  }

  const target = new URL(
    `/v1/projects/${encodeURIComponent(projectRef.trim())}/config/auth`,
    SUPABASE_MANAGEMENT_ORIGIN,
  );
  if (target.origin !== SUPABASE_MANAGEMENT_ORIGIN) {
    return "Supabase Management API 고정 origin 검증에 실패했습니다.";
  }

  let response;
  try {
    response = await fetchImpl(target, {
      method: "GET",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "ilgamcheck-auth-config-readback/1.0",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(safePositiveInteger(timeoutMs, DEFAULT_AUTH_READBACK_TIMEOUT_MS, 30_000)),
    });
  } catch {
    return "Supabase Management API 조회에 실패했습니다. 네트워크와 auth_config_read 권한을 확인하세요.";
  }

  if (!response || typeof response.status !== "number" || !response.headers?.get) {
    return "Supabase Management API 응답 형식이 올바르지 않습니다.";
  }
  if (response.redirected || (response.status >= 300 && response.status < 400)) {
    return "Supabase Management API redirect를 허용하지 않습니다.";
  }
  if (response.url) {
    let responseUrl;
    try {
      responseUrl = new URL(response.url);
    } catch {
      return "Supabase Management API 응답 URL이 올바르지 않습니다.";
    }
    if (responseUrl.href !== target.href) {
      return "Supabase Management API 응답이 고정 endpoint와 다릅니다.";
    }
  }
  if (response.status !== 200) {
    if (response.status === 401 || response.status === 403) {
      return `Supabase Management API 인증 또는 auth_config_read 권한이 없습니다(HTTP ${response.status}).`;
    }
    return `Supabase Management API Auth config 조회가 실패했습니다(HTTP ${response.status}).`;
  }

  const typeIssue = jsonContentTypeIssue(response.headers);
  if (typeIssue) return typeIssue;

  const byteLimit = safePositiveInteger(maxResponseBytes, DEFAULT_AUTH_READBACK_MAX_BYTES, 1024 * 1024);
  const body = await readLimitedText(response, byteLimit);
  if (body.issue) return body.issue;

  let config;
  try {
    config = JSON.parse(body.text);
  } catch {
    return "Supabase Management API Auth config JSON을 해석할 수 없습니다.";
  }
  return supabaseAuthConfigIssue(config, expectedOrigin);
}
