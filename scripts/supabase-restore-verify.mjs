import nextEnv from "@next/env";
import {
  collectRecoveryVerificationIssues,
  recoveryProductionBindingIssue,
  RECOVERY_VERIFY_ACK,
} from "./supabase-restore-verify-policy.mjs";
import { runRecoveryVerificationChecks } from "./supabase-restore-verify-runner.mjs";
import {
  readRuntimeContract,
  runtimePublicConfigDigestFromEnv,
} from "./runtime-contract-readback-policy.mjs";
import { verifyLinkedSupabaseProject } from "./supabase-project-guard.mjs";

if (process.argv.includes("--help")) {
  console.log("사용법: npm run supabase:restore:verify:dry  # recovery 전용 환경값/안전장치만 확인");
  console.log("        npm run supabase:restore:verify      # remote smoke + A/B Hosted 계약 실증");
  console.log(`실행 전 ILGAMCHECK_RECOVERY_VERIFY_ACK=${RECOVERY_VERIFY_ACK} 확인이 필요합니다.`);
  console.log("ILGAMCHECK_PRODUCTION_PROJECT_REF와 서로 다른 ILGAMCHECK_RECOVERY_PROJECT_REF, ILGAMCHECK_RECOVERY_DEPLOYMENT_URL이 모두 필요합니다.");
  console.log("기본 플랫폼은 Sites입니다. 전용 Google A/B access/refresh token 쌍이 필요합니다. 기존 Vercel 검증만 ILGAMCHECK_RELEASE_PLATFORM=vercel로 선택하세요.");
  console.log("이 명령은 복원을 수행하지 않으며 과거 데이터 건수·Auth UUID 일치도 대신 증명하지 않습니다.");
  process.exit(0);
}

const dryRun = process.argv.includes("--dry-run");
const apply = process.argv.includes("--apply");
if (dryRun === apply) {
  console.error("[restore-verify] --dry-run 또는 --apply 중 하나만 지정해야 합니다.");
  process.exit(1);
}

const { loadEnvConfig } = nextEnv;
const shellRecoveryAcknowledgement = process.env.ILGAMCHECK_RECOVERY_VERIFY_ACK;
const shellHostedVerificationAcknowledgement = process.env.ILGAMCHECK_HOSTED_VERIFY_ACK;
loadEnvConfig(process.cwd());
delete process.env.ILGAMCHECK_RECOVERY_VERIFY_ACK;
delete process.env.ILGAMCHECK_HOSTED_VERIFY_ACK;
if (shellRecoveryAcknowledgement) {
  process.env.ILGAMCHECK_RECOVERY_VERIFY_ACK = shellRecoveryAcknowledgement;
}
if (shellHostedVerificationAcknowledgement) {
  process.env.ILGAMCHECK_HOSTED_VERIFY_ACK = shellHostedVerificationAcknowledgement;
}
const issues = collectRecoveryVerificationIssues(process.env);
if (issues.length) {
  for (const issue of issues) console.error(`[restore-verify] BLOCKED_EXTERNAL: ${issue}`);
  process.exit(1);
}

try {
  const declaredProductionRef = process.env.ILGAMCHECK_PRODUCTION_PROJECT_REF.trim();
  const linkedProduction = verifyLinkedSupabaseProject({
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: `https://${declaredProductionRef}.supabase.co`,
    },
  });
  const bindingIssue = recoveryProductionBindingIssue({
    linkedProductionRef: linkedProduction.projectRef,
    declaredProductionRef,
    recoveryRef: process.env.ILGAMCHECK_RECOVERY_PROJECT_REF.trim(),
  });
  if (bindingIssue) throw new Error(bindingIssue);
} catch (error) {
  console.error(`[restore-verify] BLOCKED_EXTERNAL: production 대상 확인 실패: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

if (dryRun) {
  console.log("[restore-verify] DRY RUN 통과 — 전용 recovery project/env/명시 동의가 준비됐습니다.");
  console.log("[restore-verify] 실제 복원 뒤 --apply와 과거 데이터 건수·Auth UUID 수동 대조가 모두 필요합니다.");
  process.exit(0);
}

console.log("[restore-verify] recovery Preview의 exact Supabase ref와 DB runtime contract를 확인합니다.");
try {
  await readRuntimeContract(
    process.env.ILGAMCHECK_RECOVERY_DEPLOYMENT_URL,
    process.env.ILGAMCHECK_RECOVERY_PROJECT_REF,
    undefined,
    { expectedPublicConfigDigest: runtimePublicConfigDigestFromEnv(process.env) },
  );
} catch (error) {
  console.error(`[restore-verify] runtime 대상 검증 실패: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
console.log("[restore-verify] recovery 공개 표면 → 전용 A/B 작업공간·RLS·공개 수정·Realtime 순서로 확인합니다.");
const checkStatus = runRecoveryVerificationChecks({ env: process.env });
if (checkStatus !== 0) {
  console.error(`[restore-verify] 복구 환경 검사 실패: exit ${checkStatus}`);
  process.exit(checkStatus);
}
console.log("[restore-verify] 자동 계약 검증 완료. 과거 데이터 건수·Auth UUID·최신 일감은 manifest/운영 기록과 수동 대조하세요.");
