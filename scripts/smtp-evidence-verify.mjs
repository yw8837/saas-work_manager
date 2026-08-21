import nextEnv from "@next/env";
import {
  readSmtpEvidenceConfig,
  readSmtpEvidenceFile,
  validateSmtpEvidence,
} from "./smtp-evidence-policy.mjs";

const { loadEnvConfig } = nextEnv;

export async function runSmtpEvidenceVerify({ env = process.env, root = process.cwd(), logger = console } = {}) {
  try {
    const config = readSmtpEvidenceConfig(env);
    const evidence = await readSmtpEvidenceFile(config.evidencePath, root);
    const result = validateSmtpEvidence(evidence, config);
    logger.log(`[smtp-evidence] PASS 외부 메일 사업자 ${result.providerCount}곳 invite/reset ${result.flowCount}건`);
    logger.log("[smtp-evidence] PASS SPF/DKIM/DMARC pass, 최종 /auth/reset, controlled bounce suppression 수동 증거");
    logger.log("[smtp-evidence] 주의: JSON은 운영자가 수동 수집한 증거이며 메일 사업자 API의 독립 보증이 아닙니다.");
    return 0;
  } catch (error) {
    logger.error(`[smtp-evidence] FAIL ${error instanceof Error ? error.message : "evidence 검증 오류"}`);
    return 1;
  }
}

if (process.argv.includes("--help")) {
  console.log("ILGAMCHECK_SMTP_EVIDENCE_PATH에 저장소 밖 수동 증거 JSON의 절대 경로를 지정하세요.");
  console.log("수신 주소, SMTP 비밀번호, 메일 원문, 초대/재설정 URL 또는 token은 JSON에 저장하지 마세요.");
} else {
  loadEnvConfig(process.cwd());
  process.exitCode = await runSmtpEvidenceVerify();
}
