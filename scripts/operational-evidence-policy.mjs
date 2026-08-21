import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { publicOperatorNameIssue, publicSupportEmailIssue } from "./deploy-env-policy.mjs";
import { normalizeFinalOrigin } from "./smtp-evidence-policy.mjs";
import { HOSTED_RUNTIME_CONTRACT } from "./verify-hosted-runtime-policy.mjs";
import {
  loadPolicyPublicationManifest,
  policyPublicationContract,
} from "./policy-publication-manifest-policy.mjs";

const MAX_EVIDENCE_BYTES = 64 * 1024;
const MAX_EVIDENCE_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label}은 object여야 합니다.`);
  }
}

function assertExactKeys(value, keys, label) {
  assertPlainObject(value, label);
  const expected = new Set(keys);
  const unknown = Object.keys(value).filter((key) => !expected.has(key));
  const missing = keys.filter((key) => !Object.hasOwn(value, key));
  if (unknown.length || missing.length) {
    throw new Error(`${label} schema가 맞지 않습니다(개인정보·비밀값·임의 필드 저장 금지).`);
  }
}

function normalizeTimestamp(value, label, nowMs) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) {
    throw new Error(`${label}은 UTC ISO timestamp여야 합니다.`);
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || timestamp > nowMs + FUTURE_TOLERANCE_MS || nowMs - timestamp > MAX_EVIDENCE_AGE_MS) {
    throw new Error(`${label}은 미래 시각이거나 30일보다 오래됐습니다.`);
  }
  return value;
}

function requireTrue(value, label) {
  if (value !== true) throw new Error(`${label}=true 증거가 필요합니다.`);
}

export function readOperationalEvidenceConfig(
  env,
  { policyPublication, requirePolicyFinalized = true } = {},
) {
  const evidencePath = env.ILGAMCHECK_OPERATIONAL_EVIDENCE_PATH?.trim();
  if (!evidencePath || !isAbsolute(evidencePath) || /[\r\n\0]/.test(evidencePath) || !evidencePath.toLowerCase().endsWith(".json")) {
    throw new Error("ILGAMCHECK_OPERATIONAL_EVIDENCE_PATH는 저장소 밖 JSON의 절대 경로여야 합니다.");
  }
  const operatorName = env.NEXT_PUBLIC_OPERATOR_NAME?.trim();
  const supportEmail = env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();
  const operatorIssue = publicOperatorNameIssue(operatorName);
  const supportIssue = publicSupportEmailIssue(supportEmail);
  if (operatorIssue) throw new Error(`NEXT_PUBLIC_OPERATOR_NAME: ${operatorIssue}`);
  if (supportIssue) throw new Error(`NEXT_PUBLIC_SUPPORT_EMAIL: ${supportIssue}`);
  const expectedPolicy = policyPublication ?? policyPublicationContract(
    loadPolicyPublicationManifest(process.cwd(), { requireFinalized: requirePolicyFinalized }),
  );
  if (requirePolicyFinalized && expectedPolicy.finalized !== true) {
    throw new Error("공개 privacy/terms manifest가 finalized=true로 확정되지 않았습니다.");
  }
  return {
    evidencePath,
    finalOrigin: normalizeFinalOrigin(env.ILGAMCHECK_FINAL_ORIGIN),
    operatorName,
    supportEmail,
    policyPublication: expectedPolicy,
  };
}

export function validateOperationalEvidence(evidence, config, { nowMs = Date.now() } = {}) {
  if (config?.policyPublication?.finalized !== true) {
    throw new Error("현재 공개 privacy/terms manifest finalized=true 계약이 없습니다.");
  }
  assertExactKeys(
    evidence,
    ["schemaVersion", "recordedAt", "finalOrigin", "operatorName", "supportEmail", "policy", "accountDeletion", "backupRecovery"],
    "evidence",
  );
  if (evidence.schemaVersion !== 2) throw new Error("evidence.schemaVersion은 2여야 합니다.");
  normalizeTimestamp(evidence.recordedAt, "evidence.recordedAt", nowMs);
  if (normalizeFinalOrigin(evidence.finalOrigin, "evidence.finalOrigin") !== config.finalOrigin) {
    throw new Error("evidence.finalOrigin이 현재 최종 domain과 다릅니다.");
  }
  if (evidence.operatorName !== config.operatorName || evidence.supportEmail !== config.supportEmail) {
    throw new Error("evidence 운영자명·지원 이메일이 현재 공개 설정과 다릅니다.");
  }

  assertExactKeys(
    evidence.policy,
    ["reviewedAt", "publicationFinalized", "policyBundleDigest", "termsVersion", "privacyVersion", "privacyTermsPublished", "overseasTransferNoticeFinalized", "legalReviewCompleted", "closedBetaApproved"],
    "evidence.policy",
  );
  normalizeTimestamp(evidence.policy.reviewedAt, "evidence.policy.reviewedAt", nowMs);
  requireTrue(evidence.policy.publicationFinalized, "evidence.policy.publicationFinalized");
  if (
    evidence.policy.policyBundleDigest !== config.policyPublication.bundleDigest
    || evidence.policy.termsVersion !== config.policyPublication.termsVersion
    || evidence.policy.privacyVersion !== config.policyPublication.privacyVersion
  ) {
    throw new Error("운영 evidence의 정책 bundle digest·privacy/terms 버전이 현재 공개 manifest와 다릅니다.");
  }
  for (const key of ["privacyTermsPublished", "overseasTransferNoticeFinalized", "legalReviewCompleted", "closedBetaApproved"]) {
    requireTrue(evidence.policy[key], `evidence.policy.${key}`);
  }

  assertExactKeys(
    evidence.accountDeletion,
    ["testedAt", "testedOrigin", "recentPasswordAmrVerified", "authUserDeletionVerified", "cascadeVerified"],
    "evidence.accountDeletion",
  );
  normalizeTimestamp(evidence.accountDeletion.testedAt, "evidence.accountDeletion.testedAt", nowMs);
  if (normalizeFinalOrigin(evidence.accountDeletion.testedOrigin, "evidence.accountDeletion.testedOrigin") !== config.finalOrigin) {
    throw new Error("계정 탈퇴 시험 origin이 현재 최종 domain과 다릅니다.");
  }
  for (const key of ["recentPasswordAmrVerified", "authUserDeletionVerified", "cascadeVerified"]) {
    requireTrue(evidence.accountDeletion[key], `evidence.accountDeletion.${key}`);
  }

  assertExactKeys(
    evidence.backupRecovery,
    ["testedAt", "runtimeContract", "managedBackupOrPitrVerified", "logicalManifestVerified", "recoveryRestoreCompleted", "authLoginVerified", "abIsolationVerified", "historicalDataCompared"],
    "evidence.backupRecovery",
  );
  normalizeTimestamp(evidence.backupRecovery.testedAt, "evidence.backupRecovery.testedAt", nowMs);
  if (evidence.backupRecovery.runtimeContract !== HOSTED_RUNTIME_CONTRACT) {
    throw new Error(`복원 runtime contract는 ${HOSTED_RUNTIME_CONTRACT}여야 합니다.`);
  }
  for (const key of ["managedBackupOrPitrVerified", "logicalManifestVerified", "recoveryRestoreCompleted", "authLoginVerified", "abIsolationVerified", "historicalDataCompared"]) {
    requireTrue(evidence.backupRecovery[key], `evidence.backupRecovery.${key}`);
  }

  return {
    finalOrigin: config.finalOrigin,
    runtimeContract: HOSTED_RUNTIME_CONTRACT,
    policyBundleDigest: config.policyPublication.bundleDigest,
  };
}

function isWithin(parent, child) {
  const pathFromParent = relative(parent, child);
  return pathFromParent === "" || (!pathFromParent.startsWith("..") && !isAbsolute(pathFromParent));
}

export async function readOperationalEvidenceFile(evidencePath, repositoryRoot) {
  let realEvidencePath;
  let realRepositoryRoot;
  try {
    [realEvidencePath, realRepositoryRoot] = await Promise.all([
      realpath(resolve(evidencePath)),
      realpath(resolve(repositoryRoot)),
    ]);
  } catch {
    throw new Error("운영 evidence JSON을 읽을 수 없습니다.");
  }
  if (isWithin(realRepositoryRoot, realEvidencePath)) {
    throw new Error("운영 evidence JSON은 저장소 밖에 보관해야 합니다.");
  }
  const info = await stat(realEvidencePath);
  if (!info.isFile() || info.size < 2 || info.size > MAX_EVIDENCE_BYTES) {
    throw new Error("운영 evidence JSON 파일 크기 또는 형식이 올바르지 않습니다.");
  }
  try {
    return JSON.parse(await readFile(realEvidencePath, "utf8"));
  } catch {
    throw new Error("운영 evidence가 유효한 JSON이 아닙니다.");
  }
}
