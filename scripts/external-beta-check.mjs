import nextEnv from "@next/env";
import { externalBetaEnvironment, runExternalBetaGate } from "./external-beta-policy.mjs";

const { loadEnvConfig } = nextEnv;
const shellSupabaseAccessToken = process.env.SUPABASE_ACCESS_TOKEN;
const shellHostedVerificationAcknowledgement = process.env.ILGAMCHECK_HOSTED_VERIFY_ACK;

if (process.argv.includes("--help")) {
  console.log("최종 custom domain, SMTP DNS, 저장소 밖 수동 증거, 원격 Hosted A/B 전용 계정이 모두 준비된 뒤 실행하세요.");
  console.log("verify:hosted의 ILGAMCHECK_HOSTED_VERIFY_ACK 요구를 우회하지 않으며 A 전용 테스트 작업공간을 덮어씁니다.");
} else {
  loadEnvConfig(process.cwd());
  process.exitCode = runExternalBetaGate({
    env: externalBetaEnvironment(
      process.env,
      shellSupabaseAccessToken,
      shellHostedVerificationAcknowledgement,
    ),
  });
}
