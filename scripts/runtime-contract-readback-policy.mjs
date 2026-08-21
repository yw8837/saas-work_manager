import { createHash } from "node:crypto";
import {
  loadPolicyPublicationManifest,
  policyPublicationContract,
} from "./policy-publication-manifest-policy.mjs";
import { HOSTED_RUNTIME_CONTRACT } from "./verify-hosted-runtime-policy.mjs";

// 같은 값을 두 번 적어두면 한쪽만 올라간다. 실제로 그렇게 어긋났었다.
export const RUNTIME_CONTRACT_EXPECTED = HOSTED_RUNTIME_CONTRACT;
export const RUNTIME_HEALTH_PAYLOAD_KEYS = Object.freeze([
  "closedBetaConfigured",
  "databaseContractDetected",
  "databaseContractExpected",
  "hostedAdapterReady",
  "hostedConfigured",
  "policyPublication",
  "publicConfigDigest",
  "publicIdentityConfigured",
  "ready",
  "runtimeEffective",
  "runtimeRequested",
  "service",
  "serviceRoleContractCurrent",
  "status",
  "supabaseProjectRefConfigured",
  "version",
]);
export const RUNTIME_HEALTH_MAX_BYTES = 64 * 1024;
export const RUNTIME_HEALTH_TIMEOUT_MS = 15_000;
const SUPABASE_PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;
const PUBLIC_CONFIG_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
const RUNTIME_PUBLIC_CONFIG_SCHEMA = "ilgamcheck-public-config/v1";
export const POLICY_PUBLICATION_EXPECTED = Object.freeze(
  policyPublicationContract(loadPolicyPublicationManifest()),
);

function trimmedOrNull(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}

function validEmailOrNull(value) {
  const normalized = trimmedOrNull(value);
  return normalized && /^\S+@\S+\.\S+$/.test(normalized) ? normalized : null;
}

export function runtimePublicConfigDigest({ operatorName, supportEmail, betaSignupEnabled }) {
  const canonical = JSON.stringify({
    schema: RUNTIME_PUBLIC_CONFIG_SCHEMA,
    operatorName: trimmedOrNull(operatorName),
    supportEmail: validEmailOrNull(supportEmail),
    betaSignupEnabled: betaSignupEnabled === true,
  });

  return `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}

export function runtimePublicConfigDigestFromEnv(env) {
  return runtimePublicConfigDigest({
    operatorName: env?.NEXT_PUBLIC_OPERATOR_NAME,
    supportEmail: env?.NEXT_PUBLIC_SUPPORT_EMAIL,
    betaSignupEnabled: env?.NEXT_PUBLIC_BETA_SIGNUP_ENABLED === "true",
  });
}

export function normalizeExpectedPublicConfigDigest(rawDigest) {
  if (typeof rawDigest !== "string" || !PUBLIC_CONFIG_DIGEST_PATTERN.test(rawDigest)) {
    throw new Error("비교할 public config digest가 올바른 sha256 값이 아닙니다.");
  }
  return rawDigest;
}

export function normalizeExpectedProjectRef(rawProjectRef) {
  if (typeof rawProjectRef !== "string" || !SUPABASE_PROJECT_REF_PATTERN.test(rawProjectRef.trim())) {
    throw new Error("비교할 Supabase project ref는 정확한 영문 소문자·숫자 20자여야 합니다.");
  }
  return rawProjectRef.trim();
}

export function normalizeRuntimeOrigin(rawOrigin) {
  if (typeof rawOrigin !== "string" || !rawOrigin.trim()) {
    throw new Error("검사할 배포 HTTPS origin이 없습니다.");
  }

  let url;
  try {
    url = new URL(rawOrigin.trim());
  } catch {
    throw new Error("배포 origin이 올바른 절대 URL이 아닙니다.");
  }

  if (url.protocol !== "https:") throw new Error("배포 origin은 HTTPS여야 합니다.");
  if (url.username || url.password) throw new Error("배포 origin에 사용자 정보가 포함될 수 없습니다.");
  if (url.port) throw new Error("배포 origin에 비표준 HTTPS 포트를 사용할 수 없습니다.");
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("배포 origin에는 경로, query 또는 fragment를 넣을 수 없습니다.");
  }

  return url.origin;
}

function contentLengthIssue(headers, maxBytes) {
  const rawLength = headers.get("content-length");
  if (rawLength === null) return null;
  if (!/^\d+$/.test(rawLength.trim())) return "Content-Length가 올바르지 않습니다.";

  const length = Number(rawLength);
  if (!Number.isSafeInteger(length)) return "Content-Length가 안전한 정수가 아닙니다.";
  if (length > maxBytes) return `응답이 ${maxBytes} byte 제한을 초과합니다.`;
  return null;
}

async function readLimitedText(response, maxBytes) {
  const lengthIssue = contentLengthIssue(response.headers, maxBytes);
  if (lengthIssue) throw new Error(`/api/health: ${lengthIssue}`);

  if (!response.body || typeof response.body.getReader !== "function") {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > maxBytes) {
      throw new Error(`/api/health: 응답이 ${maxBytes} byte 제한을 초과합니다.`);
    }
    return text;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel("response too large");
        throw new Error(`/api/health: 응답이 ${maxBytes} byte 제한을 초과합니다.`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    throw new Error("/api/health: 응답이 유효한 UTF-8이 아닙니다.");
  }
}

export function validateRuntimeHealthPayload(
  payload,
  rawExpectedProjectRef,
  rawExpectedPublicConfigDigest,
  { requirePolicyFinalized = false } = {},
) {
  const expectedProjectRef = normalizeExpectedProjectRef(rawExpectedProjectRef);
  const expectedPublicConfigDigest = normalizeExpectedPublicConfigDigest(rawExpectedPublicConfigDigest);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("/api/health: JSON object 응답이 아닙니다.");
  }
  for (const forbiddenField of ["operatorName", "supportEmail", "betaSignupEnabled"]) {
    if (Object.hasOwn(payload, forbiddenField)) {
      throw new Error(`/api/health: 공개 설정 원문 ${forbiddenField}을 반환하면 안 됩니다.`);
    }
  }
  if (Object.keys(payload).sort().join(",") !== RUNTIME_HEALTH_PAYLOAD_KEYS.join(",")) {
    throw new Error("/api/health: top-level schema가 exact 계약과 다릅니다.");
  }
  if (payload.status !== "ok" || payload.ready !== true || payload.service !== "ilgamcheck") {
    throw new Error("/api/health: 서비스 상태 응답이 올바르지 않습니다.");
  }
  if (typeof payload.version !== "string" || !payload.version.trim()) {
    throw new Error("/api/health: 서비스 버전이 없습니다.");
  }
  if (
    payload.runtimeRequested !== "hosted"
    || payload.runtimeEffective !== "hosted"
    || payload.hostedConfigured !== true
    || payload.hostedAdapterReady !== true
  ) {
    throw new Error("/api/health: Hosted runtime이 활성 상태가 아닙니다.");
  }
  if (payload.supabaseProjectRefConfigured !== expectedProjectRef) {
    throw new Error(
      `/api/health: 배포 Supabase project ref가 연결 ref ${expectedProjectRef}와 일치하지 않습니다.`,
    );
  }
  if (payload.publicIdentityConfigured !== true || payload.closedBetaConfigured !== true) {
    throw new Error("/api/health: 공개 운영자 정보 또는 폐쇄 베타 설정이 준비되지 않았습니다.");
  }
  if (payload.publicConfigDigest !== expectedPublicConfigDigest) {
    throw new Error("/api/health: 배포 public config가 현재 로컬 환경값과 일치하지 않습니다.");
  }
  if (
    payload.databaseContractExpected !== RUNTIME_CONTRACT_EXPECTED
    || payload.databaseContractDetected !== RUNTIME_CONTRACT_EXPECTED
  ) {
    throw new Error(`/api/health: DB runtime contract ${RUNTIME_CONTRACT_EXPECTED}가 확인되지 않았습니다.`);
  }
  if (payload.serviceRoleContractCurrent !== true) {
    throw new Error("/api/health: 배포된 Supabase service-role key의 현재 contract가 확인되지 않았습니다.");
  }

  const policy = payload.policyPublication;
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
    throw new Error("/api/health: 공개 privacy/terms publication contract가 없습니다.");
  }
  const policyKeys = Object.keys(policy).sort().join(",");
  if (policyKeys !== "bundleDigest,databaseDetected,databaseExpected,databaseMatches,finalized,privacyContentDigest,privacyVersion,termsContentDigest,termsVersion") {
    throw new Error("/api/health: policy publication schema가 exact 계약과 다릅니다.");
  }
  const expectedPolicyDatabaseContract = {
    finalized: POLICY_PUBLICATION_EXPECTED.finalized,
    bundleDigest: POLICY_PUBLICATION_EXPECTED.bundleDigest,
    termsVersion: POLICY_PUBLICATION_EXPECTED.termsVersion,
    privacyVersion: POLICY_PUBLICATION_EXPECTED.privacyVersion,
  };
  const exactPolicyContract = (value) => (
    value
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value).sort().join(",") === "bundleDigest,finalized,privacyVersion,termsVersion"
    && value.finalized === expectedPolicyDatabaseContract.finalized
    && value.bundleDigest === expectedPolicyDatabaseContract.bundleDigest
    && value.termsVersion === expectedPolicyDatabaseContract.termsVersion
    && value.privacyVersion === expectedPolicyDatabaseContract.privacyVersion
  );
  if (
    policy.finalized !== POLICY_PUBLICATION_EXPECTED.finalized
    || policy.bundleDigest !== POLICY_PUBLICATION_EXPECTED.bundleDigest
    || policy.termsVersion !== POLICY_PUBLICATION_EXPECTED.termsVersion
    || policy.privacyVersion !== POLICY_PUBLICATION_EXPECTED.privacyVersion
    || policy.termsContentDigest !== POLICY_PUBLICATION_EXPECTED.termsContentDigest
    || policy.privacyContentDigest !== POLICY_PUBLICATION_EXPECTED.privacyContentDigest
    || !exactPolicyContract(policy.databaseExpected)
    || !exactPolicyContract(policy.databaseDetected)
    || policy.databaseMatches !== true
  ) {
    throw new Error("/api/health: 배포 정책 bundle·버전과 DB policy contract가 현재 manifest와 일치하지 않습니다.");
  }
  if (requirePolicyFinalized && policy.finalized !== true) {
    throw new Error("/api/health: 공개 privacy/terms가 finalized=true로 확정되지 않았습니다.");
  }

  return {
    service: payload.service,
    version: payload.version,
    runtimeContract: payload.databaseContractDetected,
    supabaseProjectRefConfigured: payload.supabaseProjectRefConfigured,
    publicConfigDigest: payload.publicConfigDigest,
    serviceRoleContractCurrent: true,
    policyPublication: {
      finalized: policy.finalized,
      bundleDigest: policy.bundleDigest,
      termsVersion: policy.termsVersion,
      privacyVersion: policy.privacyVersion,
    },
  };
}

export async function readRuntimeContract(
  rawOrigin,
  rawExpectedProjectRef,
  fetchImpl = fetch,
  {
    timeoutMs = RUNTIME_HEALTH_TIMEOUT_MS,
    maxResponseBytes = RUNTIME_HEALTH_MAX_BYTES,
    expectedPublicConfigDigest = runtimePublicConfigDigestFromEnv(process.env),
    requirePolicyFinalized = false,
  } = {},
) {
  const origin = normalizeRuntimeOrigin(rawOrigin);
  const expectedProjectRef = normalizeExpectedProjectRef(rawExpectedProjectRef);
  const normalizedExpectedPublicConfigDigest = normalizeExpectedPublicConfigDigest(
    expectedPublicConfigDigest,
  );
  if (typeof fetchImpl !== "function") throw new Error("fetch 구현이 없습니다.");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new Error("timeout 값이 올바르지 않습니다.");
  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes <= 0) {
    throw new Error("응답 크기 제한이 올바르지 않습니다.");
  }

  const healthUrl = new URL("/api/health", origin);
  if (healthUrl.origin !== origin) throw new Error("/api/health가 배포 origin 밖을 가리킵니다.");

  let response;
  try {
    response = await fetchImpl(healthUrl, {
      method: "GET",
      cache: "no-store",
      redirect: "manual",
      headers: {
        Accept: "application/json",
        "User-Agent": "ilgamcheck-runtime-readback/1.0",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`/api/health 요청에 실패했습니다: ${message}`);
  }

  if (response.redirected || (response.status >= 300 && response.status < 400)) {
    throw new Error(`/api/health: redirect 응답을 허용하지 않습니다 (HTTP ${response.status}).`);
  }
  if (response.url) {
    let responseUrl;
    try {
      responseUrl = new URL(response.url);
    } catch {
      throw new Error("/api/health: 응답 URL이 올바르지 않습니다.");
    }
    if (responseUrl.href !== healthUrl.href) {
      throw new Error("/api/health: 요청한 동일 origin URL과 응답 URL이 다릅니다.");
    }
  }
  if (response.status !== 200) throw new Error(`/api/health: HTTP ${response.status}`);

  const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new Error("/api/health: Content-Type이 application/json이 아닙니다.");
  }

  const rawBody = await readLimitedText(response, maxResponseBytes);
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    throw new Error("/api/health: JSON을 해석할 수 없습니다.");
  }
  const contract = validateRuntimeHealthPayload(
    payload,
    expectedProjectRef,
    normalizedExpectedPublicConfigDigest,
    { requirePolicyFinalized },
  );

  return {
    origin,
    healthUrl: healthUrl.href,
    ...contract,
  };
}
