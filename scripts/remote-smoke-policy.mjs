import {
  loadPolicyPublicationManifest,
  policyPublicationContract,
} from "./policy-publication-manifest-policy.mjs";
import { RUNTIME_HEALTH_PAYLOAD_KEYS } from "./runtime-contract-readback-policy.mjs";

const POLICY_PUBLICATION_EXPECTED = Object.freeze(
  policyPublicationContract(loadPolicyPublicationManifest()),
);

const REQUIRED_SECURITY_HEADERS = [
  ["content-security-policy", (value) => value.includes("frame-ancestors 'none'") && value.includes("object-src 'none'")],
  ["strict-transport-security", (value) => /max-age=\d+/.test(value)],
  ["x-content-type-options", (value) => value.toLowerCase() === "nosniff"],
  ["x-frame-options", (value) => value.toUpperCase() === "DENY"],
  ["referrer-policy", (value) => value.toLowerCase() === "no-referrer"],
  ["permissions-policy", (value) => value.includes("camera=()") && value.includes("microphone=()")],
];

export function normalizeDeploymentUrl(rawUrl) {
  const raw = rawUrl?.trim();
  if (!raw) throw new Error("DEPLOYMENT_URL 또는 첫 번째 인수로 Preview URL을 넣으세요.");
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  const url = new URL(candidate);
  if (url.protocol !== "https:") throw new Error("원격 smoke 대상은 HTTPS URL이어야 합니다.");
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("자격증명·query·fragment가 없는 배포 origin을 넣으세요.");
  }
  url.pathname = "/";
  return url;
}

function contentTypeIncludes(response, expected) {
  return response.headers.get("content-type")?.toLowerCase().includes(expected) ?? false;
}

async function checkedFetch(fetchImpl, baseUrl, path) {
  const target = new URL(path, baseUrl);
  if (target.origin !== baseUrl.origin) {
    throw new Error(`${path}: 배포 origin 밖의 주소는 검사하지 않습니다.`);
  }
  const response = await fetchImpl(target, {
    cache: "no-store",
    headers: { "User-Agent": "ilgamcheck-release-smoke/1.0" },
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status !== 200) throw new Error(`${path}: HTTP ${response.status}`);
  if (response.url && new URL(response.url).origin !== baseUrl.origin) {
    throw new Error(`${path}: 다른 origin으로 redirect되었습니다.`);
  }
  return response;
}

export function securityHeaderIssues(headers) {
  const issues = [];
  for (const [name, validate] of REQUIRED_SECURITY_HEADERS) {
    const value = headers.get(name);
    if (!value) issues.push(`${name} 누락`);
    else if (!validate(value)) issues.push(`${name} 값 오류`);
  }
  if (headers.has("x-powered-by")) issues.push("x-powered-by 노출");
  return issues;
}

function isSameOriginRootPath(value, baseUrl) {
  if (typeof value !== "string" || !/^\/(?!\/)/.test(value)) return false;
  const target = new URL(value, baseUrl);
  return target.origin === baseUrl.origin && !target.username && !target.password;
}

function assertPolicyPublication(payload, { requirePolicyFinalized }) {
  const policy = payload?.policyPublication;
  const expectedDatabaseContract = {
    finalized: POLICY_PUBLICATION_EXPECTED.finalized,
    bundleDigest: POLICY_PUBLICATION_EXPECTED.bundleDigest,
    termsVersion: POLICY_PUBLICATION_EXPECTED.termsVersion,
    privacyVersion: POLICY_PUBLICATION_EXPECTED.privacyVersion,
  };
  const exactDatabaseContract = (value) => (
    value
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value).sort().join(",") === "bundleDigest,finalized,privacyVersion,termsVersion"
    && value.finalized === expectedDatabaseContract.finalized
    && value.bundleDigest === expectedDatabaseContract.bundleDigest
    && value.termsVersion === expectedDatabaseContract.termsVersion
    && value.privacyVersion === expectedDatabaseContract.privacyVersion
  );
  if (
    !policy
    || typeof policy !== "object"
    || Array.isArray(policy)
    || Object.keys(policy).sort().join(",") !== "bundleDigest,databaseDetected,databaseExpected,databaseMatches,finalized,privacyContentDigest,privacyVersion,termsContentDigest,termsVersion"
    || policy.finalized !== POLICY_PUBLICATION_EXPECTED.finalized
    || policy.bundleDigest !== POLICY_PUBLICATION_EXPECTED.bundleDigest
    || policy.termsVersion !== POLICY_PUBLICATION_EXPECTED.termsVersion
    || policy.privacyVersion !== POLICY_PUBLICATION_EXPECTED.privacyVersion
    || policy.termsContentDigest !== POLICY_PUBLICATION_EXPECTED.termsContentDigest
    || policy.privacyContentDigest !== POLICY_PUBLICATION_EXPECTED.privacyContentDigest
    || !exactDatabaseContract(policy.databaseExpected)
    || !exactDatabaseContract(policy.databaseDetected)
    || policy.databaseMatches !== true
  ) {
    throw new Error("/api/health: 배포 privacy/terms bundle·버전·DB contract가 현재 manifest와 다릅니다.");
  }
  if (requirePolicyFinalized && policy.finalized !== true) {
    throw new Error("/api/health: 공개 privacy/terms가 finalized=true로 확정되지 않았습니다.");
  }
  return policy;
}

export async function runRemoteSmoke(
  rawUrl,
  fetchImpl = fetch,
  { requirePolicyFinalized = false } = {},
) {
  const baseUrl = normalizeDeploymentUrl(rawUrl);
  const checks = [];

  const health = await checkedFetch(fetchImpl, baseUrl, "/api/health");
  if (!contentTypeIncludes(health, "application/json")) throw new Error("/api/health: JSON 응답이 아닙니다.");
  if (!health.headers.get("cache-control")?.toLowerCase().includes("no-store")) {
    throw new Error("/api/health: Cache-Control no-store가 없습니다.");
  }
  const body = await health.json();
  if (body.status !== "ok" || body.ready !== true || body.service !== "ilgamcheck") {
    throw new Error("/api/health: 서비스 상태 응답이 올바르지 않습니다.");
  }
  if (
    body.runtimeRequested !== "hosted"
    || body.runtimeEffective !== "hosted"
    || body.hostedConfigured !== true
    || body.hostedAdapterReady !== true
  ) {
    throw new Error("/api/health: Hosted 모드 또는 Supabase 공개 설정이 활성화되지 않았습니다.");
  }
  if (
    typeof body.supabaseProjectRefConfigured !== "string"
    || !/^[a-z0-9]{20}$/.test(body.supabaseProjectRefConfigured)
  ) {
    throw new Error("/api/health: 배포가 사용하는 Supabase project ref를 확인할 수 없습니다.");
  }
  if (
    typeof body.databaseContractExpected !== "string"
    || !body.databaseContractExpected
    || body.databaseContractDetected !== body.databaseContractExpected
  ) {
    throw new Error("/api/health: 원격 DB runtime contract migration이 일치하지 않습니다.");
  }
  if (body.serviceRoleContractCurrent !== true) {
    throw new Error("/api/health: 배포된 Supabase service-role key의 현재 contract가 확인되지 않았습니다.");
  }
  if (
    typeof body.version !== "string"
    || !body.version.trim()
    || typeof body.publicConfigDigest !== "string"
    || !/^sha256:[a-f0-9]{64}$/.test(body.publicConfigDigest)
    || body.publicIdentityConfigured !== true
    || body.signupPolicyConfigured !== true
  ) {
    throw new Error("/api/health: 배포 public runtime 설정이 준비되지 않았습니다.");
  }
  const policy = assertPolicyPublication(body, { requirePolicyFinalized });
  if (Object.keys(body).sort().join(",") !== RUNTIME_HEALTH_PAYLOAD_KEYS.join(",")) {
    throw new Error("/api/health: top-level schema가 exact 계약과 다릅니다.");
  }
  checks.push(
    `health(hosted/configured/ref:${body.supabaseProjectRefConfigured}/db:${body.databaseContractDetected}/service-role:current/policy:${policy.bundleDigest}/no-store)`,
  );

  for (const path of ["/", "/today", "/privacy", "/terms"]) {
    const response = await checkedFetch(fetchImpl, baseUrl, path);
    if (!contentTypeIncludes(response, "text/html")) throw new Error(`${path}: HTML 응답이 아닙니다.`);
    const headerIssues = securityHeaderIssues(response.headers);
    if (headerIssues.length) throw new Error(`${path}: ${headerIssues.join(", ")}`);
    checks.push(`${path}(html/security-headers)`);
  }

  const manifestResponse = await checkedFetch(fetchImpl, baseUrl, "/manifest.webmanifest");
  const manifestType = manifestResponse.headers.get("content-type")?.toLowerCase() ?? "";
  if (!manifestType.includes("application/manifest+json") && !manifestType.includes("application/json")) {
    throw new Error("/manifest.webmanifest: manifest JSON content-type이 아닙니다.");
  }
  const manifest = await manifestResponse.json();
  if (manifest.name !== "일감체크" || !isSameOriginRootPath(manifest.start_url, baseUrl)) {
    throw new Error("/manifest.webmanifest: name 또는 start_url이 올바르지 않습니다.");
  }
  if (!Array.isArray(manifest.icons) || manifest.icons.length === 0) {
    throw new Error("/manifest.webmanifest: PWA icon이 없습니다.");
  }
  for (const icon of manifest.icons) {
    if (!isSameOriginRootPath(icon?.src, baseUrl)) {
      throw new Error("/manifest.webmanifest: 외부 또는 잘못된 icon 경로가 있습니다.");
    }
    await checkedFetch(fetchImpl, baseUrl, icon.src);
  }
  checks.push("manifest+icons");

  const worker = await checkedFetch(fetchImpl, baseUrl, "/sw.js");
  const workerType = worker.headers.get("content-type")?.toLowerCase() ?? "";
  if (!workerType.includes("javascript") && !workerType.includes("text/plain")) {
    throw new Error("/sw.js: JavaScript content-type이 아닙니다.");
  }
  checks.push("service-worker");

  return { baseUrl: baseUrl.origin, checks };
}
