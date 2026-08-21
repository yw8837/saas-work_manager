import { collectDeployEnvIssues } from "./deploy-env-policy.mjs";
import { readOperationalEvidenceConfig } from "./operational-evidence-policy.mjs";
import { readSmtpDnsConfig } from "./smtp-dns-policy.mjs";
import {
  normalizeFinalOrigin,
  readSmtpEvidenceConfig,
} from "./smtp-evidence-policy.mjs";
import { normalizeAuthSiteUrl } from "./supabase-config-push-policy.mjs";
import { HOSTED_VERIFY_ACK } from "./verify-hosted-runtime-policy.mjs";

function check(id, location, passed, passMessage, blockedMessage) {
  return {
    id,
    location,
    status: passed ? "pass" : "blocked",
    message: passed ? passMessage : blockedMessage,
  };
}

function issueFrom(action) {
  try {
    action();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function testAccountIssue(env) {
  const names = [
    "ILGAMCHECK_TEST_A_EMAIL",
    "ILGAMCHECK_TEST_A_PASSWORD",
    "ILGAMCHECK_TEST_B_EMAIL",
    "ILGAMCHECK_TEST_B_PASSWORD",
  ];
  const missing = names.filter((name) => !env[name]?.trim());
  if (missing.length) return `${missing.join(", ")} 값이 없습니다.`;
  if (env.ILGAMCHECK_TEST_A_EMAIL.trim().toLowerCase() === env.ILGAMCHECK_TEST_B_EMAIL.trim().toLowerCase()) {
    return "A/B 테스트 이메일은 서로 달라야 합니다.";
  }
  return null;
}

export const EXTERNAL_INPUT_MANUAL_LOCATIONS = Object.freeze([
  {
    id: "supabase-project",
    location: "Supabase Dashboard",
    message: "창업자 소유 Seoul 프로젝트·DB 비밀번호·browser key·server key를 준비합니다.",
  },
  {
    id: "vercel-project",
    location: "Vercel Dashboard/CLI",
    message: "창업자 소유 project를 연결하고 Preview/Production deployment를 wrapper로 만듭니다.",
  },
  {
    id: "custom-smtp",
    location: "Supabase Auth SMTP + DNS provider",
    message: "SMTP secret은 Dashboard에만 넣고 From·Return-Path·SPF/DKIM/DMARC를 설정합니다.",
  },
  {
    id: "legal-policy",
    location: "src/app/privacy + src/app/terms + legal review",
    message: "실제 운영자·국외이전 정보를 확정하고 정책 publication을 새 migration과 함께 갱신합니다.",
  },
  {
    id: "backup-recovery",
    location: "Supabase managed backup + repository-external encrypted storage",
    message: "관리 백업/PITR와 별도 recovery 프로젝트 복원 증거를 준비합니다.",
  },
]);

export function evaluateExternalInputReadiness({
  env,
  shellSupabaseAccessToken,
  shellHostedVerificationAcknowledgement,
  state = {},
}) {
  const deployIssues = collectDeployEnvIssues(env);
  const finalOriginIssue = issueFrom(() => normalizeFinalOrigin(env.ILGAMCHECK_FINAL_ORIGIN));
  let authOriginIssue = null;
  try {
    const finalOrigin = normalizeFinalOrigin(env.ILGAMCHECK_FINAL_ORIGIN);
    const authOrigin = normalizeAuthSiteUrl(env.SUPABASE_AUTH_SITE_URL);
    if (authOrigin !== finalOrigin) {
      authOriginIssue = "SUPABASE_AUTH_SITE_URL은 ILGAMCHECK_FINAL_ORIGIN과 같은 최종 origin이어야 합니다.";
    }
  } catch (error) {
    authOriginIssue = error instanceof Error ? error.message : String(error);
  }
  const smtpDnsIssue = issueFrom(() => readSmtpDnsConfig(env));
  const smtpEvidenceIssue = issueFrom(() => readSmtpEvidenceConfig(env));
  const operationalEvidenceIssue = issueFrom(() => readOperationalEvidenceConfig(
    env,
    { requirePolicyFinalized: false },
  ));
  const accountsIssue = testAccountIssue(env);

  const checks = [
    check(
      "hosted-runtime-env",
      ".env.local",
      deployIssues.length === 0,
      "Hosted 공개값·server key 입력 형식이 준비됐습니다.",
      `Hosted 입력이 미완료입니다 (${deployIssues.length}개 문제).`,
    ),
    check(
      "final-origin",
      ".env.local 또는 현재 셸",
      finalOriginIssue === null,
      "최종 custom origin 형식이 준비됐습니다.",
      finalOriginIssue ?? "최종 origin이 미완료입니다.",
    ),
    check(
      "auth-final-origin",
      ".env.local",
      authOriginIssue === null,
      "Auth Site URL과 최종 custom origin이 일치합니다.",
      authOriginIssue ?? "Auth origin이 미완료입니다.",
    ),
    check(
      "smtp-dns-inputs",
      ".env.local 또는 현재 셸 (공개 DNS 이름만)",
      smtpDnsIssue === null,
      "From·Return-Path·DMARC·DKIM selector 입력이 준비됐습니다.",
      smtpDnsIssue ?? "SMTP DNS 입력이 미완료입니다.",
    ),
    check(
      "smtp-evidence-path",
      "저장소 밖 암호화 JSON + .env.local 경로",
      smtpEvidenceIssue === null,
      "SMTP evidence 경로와 현재 공개값 형식이 준비됐습니다.",
      smtpEvidenceIssue ?? "SMTP evidence 입력이 미완료입니다.",
    ),
    check(
      "operational-evidence-path",
      "저장소 밖 암호화 JSON + .env.local 경로",
      operationalEvidenceIssue === null,
      "정책·탈퇴·복구 evidence 경로와 공개값 형식이 준비됐습니다.",
      operationalEvidenceIssue ?? "운영 evidence 입력이 미완료입니다.",
    ),
    check(
      "hosted-test-accounts",
      ".env.local (전용 계정만)",
      accountsIssue === null,
      "전용 A/B 계정 입력이 준비됐습니다.",
      accountsIssue ?? "A/B 계정 입력이 미완료입니다.",
    ),
    check(
      "supabase-management-token",
      "현재 PowerShell 셸만",
      typeof shellSupabaseAccessToken === "string" && shellSupabaseAccessToken.trim().length > 0,
      "현재 셸에 Supabase Management API token이 있습니다.",
      "SUPABASE_ACCESS_TOKEN은 .env 파일이 아니라 현재 셸에만 넣어야 합니다.",
    ),
    check(
      "hosted-destructive-ack",
      "현재 PowerShell 셸만",
      shellHostedVerificationAcknowledgement === HOSTED_VERIFY_ACK,
      "현재 셸에 전용 A 작업공간 덮어쓰기 동의가 있습니다.",
      `ILGAMCHECK_HOSTED_VERIFY_ACK=${HOSTED_VERIFY_ACK}를 실행 직전 현재 셸에만 넣어야 합니다.`,
    ),
    check(
      "supabase-link",
      "supabase/.temp (Git·배포 제외)",
      state.supabaseLinked === true,
      "로컬 작업폴더에 Supabase link가 있습니다.",
      "npm run supabase:login과 supabase:link가 필요합니다.",
    ),
    check(
      "vercel-link",
      ".vercel/project.json (Git·배포 제외)",
      state.vercelLinked === true,
      "로컬 작업폴더에 Vercel project link가 있습니다.",
      "npm run vercel:login과 vercel:link가 필요합니다.",
    ),
    check(
      "deployment-receipts",
      "supabase/.temp (Git·배포 제외)",
      state.deploymentReceiptPresent === true,
      "migration/Auth config 실행 receipt가 있습니다.",
      "guarded migration push와 Auth config push가 아직 완료되지 않았습니다.",
    ),
  ];

  return {
    inputReady: checks.every((item) => item.status === "pass"),
    checks,
    manualLocations: [...EXTERNAL_INPUT_MANUAL_LOCATIONS],
  };
}
