import nextEnv from "@next/env";
import {
  readOperationalEvidenceConfig,
  readOperationalEvidenceFile,
  validateOperationalEvidence,
} from "./operational-evidence-policy.mjs";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

try {
  const config = readOperationalEvidenceConfig(process.env);
  const evidence = await readOperationalEvidenceFile(config.evidencePath, process.cwd());
  const result = validateOperationalEvidence(evidence, config);
  console.log(`[operational-evidence] PASS ${result.finalOrigin} policy ${result.policyBundleDigest} · 계정탈퇴·backup/recovery evidence schema 확인 완료.`);
  console.log("[operational-evidence] 이 검사는 운영자 기록의 형식·최신성만 확인하며 법률적 충분성이나 기록의 진실성을 대신 증명하지 않습니다.");
} catch (error) {
  console.error(`[operational-evidence] FAIL ${error instanceof Error ? error.message : "운영 evidence 오류"}`);
  process.exit(1);
}
