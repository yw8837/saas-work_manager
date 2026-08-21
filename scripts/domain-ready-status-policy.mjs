import { collectDeployEnvIssues } from "./deploy-env-policy.mjs";
import { projectRefIssue } from "./supabase-cli-policy.mjs";
import { normalizeAuthSiteUrl } from "./supabase-config-push-policy.mjs";
import { authConfigReceiptIssue, migrationReceiptIssue } from "./deployment-receipt.mjs";

export const DOMAIN_READY_MANUAL_GATES = Object.freeze([
  "실제 운영자 공개정보·국외이전 고지·법률 검토",
  "custom SMTP DNS·외부 전달·반송 증거",
  "전용 A/B 계정 Hosted 검증·원격 smoke",
  "저장소 밖 암호화 백업·관리 백업/PITR·recovery 복원",
]);

function check(id, passed, passMessage, blockedMessage) {
  return {
    id,
    status: passed ? "pass" : "blocked",
    message: passed ? passMessage : blockedMessage,
  };
}

function authSiteUrlIssue(rawUrl) {
  try {
    const origin = normalizeAuthSiteUrl(rawUrl);
    const hostname = new URL(origin).hostname.toLowerCase();
    const labels = hostname.split(".");
    if (
      labels.length < 2
      || labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))
      || hostname === "bootstrap.invalid"
      || hostname.endsWith(".invalid")
      || hostname === "localhost"
      || hostname.endsWith(".localhost")
      || hostname === "example"
      || hostname.endsWith(".example")
      || hostname === "test"
      || hostname.endsWith(".test")
      || hostname === "preview.example.com"
      || hostname.endsWith(".example.com")
    ) {
      return "실제 Vercel Preview 또는 최종 도메인 origin이 아닙니다.";
    }
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export function parseDomainReadyVercelTarget(argv) {
  const options = argv.filter((arg) => arg.startsWith("--expected-vercel-target"));
  if (options.length === 0) return undefined;
  if (options.length === 1 && options[0] === "--expected-vercel-target=production") {
    return "production";
  }
  throw new Error("--expected-vercel-target=production만 사용할 수 있습니다.");
}

function vercelIdentityIssue(identity) {
  if (!identity || typeof identity !== "object") return "검증된 Vercel deployment identity가 없습니다.";
  if (typeof identity.projectId !== "string" || !identity.projectId.trim()) return "Vercel projectId가 없습니다.";
  if (typeof identity.orgId !== "string" || !identity.orgId.trim()) return "Vercel orgId가 없습니다.";
  if (typeof identity.deploymentId !== "string" || !identity.deploymentId.trim()) return "Vercel deploymentId가 없습니다.";
  return null;
}

function supabaseLinkIssue(rawRef, rawUrl) {
  const refIssue = projectRefIssue(rawRef);
  if (refIssue) return refIssue;
  try {
    const hostname = new URL(rawUrl).hostname;
    if (hostname !== `${rawRef.trim()}.supabase.co`) {
      return "연결된 project ref와 NEXT_PUBLIC_SUPABASE_URL이 서로 다릅니다.";
    }
    return null;
  } catch {
    return "NEXT_PUBLIC_SUPABASE_URL을 확인할 수 없습니다.";
  }
}

export function evaluateDomainReadyStatus({
  envLocalExists,
  env,
  supabaseProjectRef,
  migrationFingerprint,
  deploymentReceipt,
  supabaseRemoteIssue,
  runtimeContractRemoteIssue,
  authConfigRemoteIssue,
  vercelIdentity,
  vercelDeploymentIssue,
  now = new Date(),
}) {
  const envIssues = envLocalExists ? collectDeployEnvIssues(env) : [".env.local이 없습니다."];
  const refIssue = supabaseLinkIssue(supabaseProjectRef, env.NEXT_PUBLIC_SUPABASE_URL);
  const vercelIssue = vercelIdentityIssue(vercelIdentity);
  const effectiveVercelDeploymentIssue = vercelDeploymentIssue
    ?? (vercelIssue ? "검증된 Vercel deployment identity가 없습니다." : null);
  const siteIssue = authSiteUrlIssue(env.SUPABASE_AUTH_SITE_URL);
  const migrationIssue = migrationReceiptIssue(
    deploymentReceipt,
    supabaseProjectRef,
    migrationFingerprint,
    now,
  );
  const normalizedSiteUrl = siteIssue ? "" : normalizeAuthSiteUrl(env.SUPABASE_AUTH_SITE_URL);
  const authConfigIssue = siteIssue
    ? "실제 Auth origin이 먼저 필요합니다."
    : authConfigReceiptIssue(deploymentReceipt, supabaseProjectRef, normalizedSiteUrl, now);

  const checks = [
    check(
      "hosted-env",
      envIssues.length === 0,
      "Hosted 공개값·서버 비밀값 경계가 유효합니다.",
      `Hosted 환경 설정이 미완료입니다 (${envIssues.length}개 문제).`,
    ),
    check(
      "supabase-link",
      !refIssue,
      "Supabase 프로젝트 ref와 앱 URL이 일치합니다.",
      `Supabase 원격 연결이 미완료입니다: ${refIssue}`,
    ),
    check(
      "supabase-remote",
      supabaseRemoteIssue === null,
      "로그인 계정에서 연결 프로젝트와 Seoul region을 확인했습니다.",
      `Supabase 원격 프로젝트 검증이 미완료입니다: ${supabaseRemoteIssue}`,
    ),
    check(
      "migration-apply",
      !migrationIssue,
      "현재 project ref에 runtime migration push 성공 receipt가 있습니다.",
      `migration 적용 확인이 미완료입니다: ${migrationIssue}`,
    ),
    check(
      "vercel-link",
      !vercelIssue,
      "Vercel 프로젝트 연결 정보가 있습니다.",
      `Vercel 원격 연결이 미완료입니다: ${vercelIssue}`,
    ),
    check(
      "auth-origin",
      !siteIssue,
      "실제 Preview 또는 최종 도메인 Auth origin이 설정돼 있습니다.",
      `Auth origin이 미완료입니다: ${siteIssue}`,
    ),
    check(
      "vercel-deployment",
      effectiveVercelDeploymentIssue === null,
      "Auth origin이 연결된 Vercel project의 READY deployment임을 확인했습니다.",
      `Vercel deployment 검증이 미완료입니다: ${effectiveVercelDeploymentIssue}`,
    ),
    check(
      "runtime-contract-current",
      runtimeContractRemoteIssue === null,
      "현재 배포의 health가 연결 DB의 최신 runtime contract를 확인했습니다.",
      `현재 DB runtime contract 원격 확인이 미완료입니다: ${runtimeContractRemoteIssue}`,
    ),
    check(
      "auth-config-apply",
      !authConfigIssue,
      "현재 project ref·origin의 폐쇄 Auth config push 성공 receipt가 있습니다.",
      `Auth config 적용 확인이 미완료입니다: ${authConfigIssue}`,
    ),
    check(
      "auth-config-current",
      authConfigRemoteIssue === null,
      "Supabase Management API에서 현재 Site URL과 폐쇄 가입 OFF를 확인했습니다.",
      `현재 Auth config 원격 확인이 미완료입니다: ${authConfigRemoteIssue}`,
    ),
  ];

  return {
    automatedReady: checks.every((item) => item.status === "pass"),
    checks,
    manualGates: [...DOMAIN_READY_MANUAL_GATES],
  };
}
