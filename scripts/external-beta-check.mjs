import nextEnv from "@next/env";
import { externalBetaEnvironment, runExternalBetaGate } from "./external-beta-policy.mjs";

const { loadEnvConfig } = nextEnv;
const shellSupabaseAccessToken = process.env.SUPABASE_ACCESS_TOKEN;
const shellHostedVerificationAcknowledgement = process.env.ILGAMCHECK_HOSTED_VERIFY_ACK;

if (process.argv.includes("--help")) {
  console.log("Sites/Google-only: ILGAMCHECK_RELEASE_PLATFORM=sites 및 ILGAMCHECK_AUTH_MODE=google-only를 지정하세요.");
  console.log("trusted Sites metadata receipt, source archive, 최종 custom domain, 저장소 밖 운영 증거, Google A/B access/refresh token이 필요합니다.");
  console.log("기본은 Sites/Google-only이며 기존 Vercel/SMTP는 platform=vercel 및 authMode=password로 명시 선택합니다. 비밀값은 명령행 인수나 receipt에 넣지 마세요.");
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
