import { existsSync } from "node:fs";
import { join } from "node:path";
import nextEnv from "@next/env";
import { evaluateExternalInputReadiness } from "./external-intake-policy.mjs";

const { loadEnvConfig } = nextEnv;
const root = process.cwd();
const jsonOutput = process.argv.includes("--json");
const shellSupabaseAccessToken = process.env.SUPABASE_ACCESS_TOKEN;
const shellHostedVerificationAcknowledgement = process.env.ILGAMCHECK_HOSTED_VERIFY_ACK;

if (process.argv.includes("--help")) {
  console.log("사용법: npm run check:external-inputs -- --json");
  console.log("비밀값은 출력하지 않고 .env.local·현재 셸·Dashboard·저장소 밖 evidence 위치별 준비 상태를 한 번에 검사합니다.");
  console.log(".env.local: Hosted runtime, 최종 origin, SMTP 공개 DNS 이름, A/B 전용 계정, evidence 절대경로");
  console.log("현재 셸만: SUPABASE_ACCESS_TOKEN, ILGAMCHECK_HOSTED_VERIFY_ACK");
  console.log("Dashboard/외부: Supabase Seoul, Vercel project, custom SMTP secret, DNS, 법률 검토, backup/recovery");
  process.exit(0);
}

loadEnvConfig(root);
delete process.env.SUPABASE_ACCESS_TOKEN;
delete process.env.ILGAMCHECK_HOSTED_VERIFY_ACK;

const result = evaluateExternalInputReadiness({
  env: process.env,
  shellSupabaseAccessToken,
  shellHostedVerificationAcknowledgement,
  state: {
    supabaseLinked: existsSync(join(root, "supabase", ".temp", "project-ref")),
    vercelLinked: existsSync(join(root, ".vercel", "project.json")),
    deploymentReceiptPresent: existsSync(join(root, "supabase", ".temp", "ilgamcheck-deployment-receipt.json")),
  },
});

if (jsonOutput) {
  console.log(JSON.stringify(result, null, 2));
} else {
  for (const item of result.checks) {
    console.log(`[external-inputs] ${item.status === "pass" ? "PASS" : "BLOCKED"} ${item.id} (${item.location}): ${item.message}`);
  }
  for (const item of result.manualLocations) {
    console.log(`[external-inputs] MANUAL ${item.id} (${item.location}): ${item.message}`);
  }
  console.log(
    result.inputReady
      ? "[external-inputs] 입력 위치 점검 PASS. 원격 readback과 실제 evidence는 check:external-beta가 별도로 검증합니다."
      : "[external-inputs] 입력 준비 미완료. 위 BLOCKED 항목을 모두 채우세요.",
  );
}

if (!result.inputReady) process.exitCode = 1;
