import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { HOSTED_RUNTIME_CONTRACT } from "./verify-hosted-runtime-policy.mjs";
import { collectMigrationManifest, computeMigrationFingerprint } from "./migration-fingerprint.mjs";
import { loadPolicyPublicationManifest } from "./policy-publication-manifest-policy.mjs";

const RECEIPT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const RECEIPT_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
export const POLICY_BUNDLE_DIGEST = loadPolicyPublicationManifest().bundleDigest;

export function deploymentReceiptPath(root = process.cwd()) {
  return join(root, "supabase", ".temp", "ilgamcheck-deploy-state.json");
}

export function readDeploymentReceipt(root = process.cwd()) {
  try {
    const parsed = JSON.parse(readFileSync(deploymentReceiptPath(root), "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function recordMigrationReceipt({
  root = process.cwd(),
  projectRef,
  now = new Date(),
  files = collectMigrationManifest(root),
  migrationFingerprint = computeMigrationFingerprint(root),
}) {
  return updateReceipt(root, {
    migrations: {
      projectRef,
      runtimeContract: HOSTED_RUNTIME_CONTRACT,
      policyBundleDigest: POLICY_BUNDLE_DIGEST,
      migrationFingerprint,
      files,
      appliedAt: now.toISOString(),
    },
  });
}

export function recordAuthConfigReceipt({ root = process.cwd(), projectRef, origin, now = new Date() }) {
  return updateReceipt(root, {
    authConfig: {
      projectRef,
      origin,
      signupDisabled: true,
      pushedAt: now.toISOString(),
    },
  });
}

function updateReceipt(root, patch) {
  const target = deploymentReceiptPath(root);
  mkdirSync(dirname(target), { recursive: true });
  const current = readDeploymentReceipt(root) ?? { schemaVersion: 1 };
  const next = { ...current, schemaVersion: 1, ...patch };
  const temporary = `${target}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  renameSync(temporary, target);
  return next;
}

function receiptTimestampIssue(receipt, field, now) {
  const value = receipt?.[field];
  if (typeof value !== "string" || !value) return `${field} 시각이 없습니다.`;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    return `${field} 시각이 올바른 ISO 형식이 아닙니다.`;
  }
  const age = now.getTime() - parsed.getTime();
  if (age < -RECEIPT_FUTURE_TOLERANCE_MS) return `${field} 시각이 미래입니다.`;
  if (age > RECEIPT_MAX_AGE_MS) return `${field} 시각이 30일보다 오래됐습니다.`;
  return null;
}

function receiptEnvelopeIssue(receipt) {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) return "배포 receipt가 없습니다.";
  if (receipt.schemaVersion !== 1) return "배포 receipt schemaVersion이 1이 아닙니다.";
  return null;
}

export function migrationReceiptIssue(receipt, projectRef, migrationFingerprint, now = new Date()) {
  const envelopeIssue = receiptEnvelopeIssue(receipt);
  if (envelopeIssue) return envelopeIssue;
  if (!receipt?.migrations) return "성공한 migration push receipt가 없습니다.";
  if (receipt.migrations.projectRef !== projectRef) return "migration receipt의 project ref가 현재 연결과 다릅니다.";
  if (receipt.migrations.runtimeContract !== HOSTED_RUNTIME_CONTRACT) {
    return `migration receipt runtime contract가 ${HOSTED_RUNTIME_CONTRACT}가 아닙니다.`;
  }
  if (receipt.migrations.policyBundleDigest !== POLICY_BUNDLE_DIGEST) {
    return `migration receipt policy bundle digest가 ${POLICY_BUNDLE_DIGEST}가 아닙니다.`;
  }
  if (typeof migrationFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(migrationFingerprint)) {
    return "현재 migration fingerprint가 올바르지 않습니다.";
  }
  if (receipt.migrations.migrationFingerprint !== migrationFingerprint) {
    return "migration receipt의 SQL fingerprint가 현재 migration 파일과 다릅니다.";
  }
  const timestampIssue = receiptTimestampIssue(receipt.migrations, "appliedAt", now);
  if (timestampIssue) return `migration receipt ${timestampIssue}`;
  return null;
}

export function priorMigrationHistoryIssue(receipt, projectRef, currentFiles) {
  if (!receipt?.migrations || receipt.migrations.projectRef !== projectRef) return null;
  if (!Array.isArray(receipt.migrations.files) || receipt.migrations.files.length === 0) {
    return "기존 migration receipt에 파일 manifest가 없어 적용 이력을 안전하게 비교할 수 없습니다.";
  }
  if (!Array.isArray(currentFiles)) return "현재 migration 파일 manifest가 올바르지 않습니다.";
  const current = new Map(currentFiles.map((item) => [item?.path, item?.sha256]));
  for (const previous of receipt.migrations.files) {
    if (
      typeof previous?.path !== "string"
      || !/^supabase\/migrations\/[0-9A-Za-z_-]+\.sql$/.test(previous.path)
      || typeof previous?.sha256 !== "string"
      || !/^[a-f0-9]{64}$/.test(previous.sha256)
    ) {
      return "기존 migration receipt의 파일 manifest가 올바르지 않습니다.";
    }
    if (current.get(previous.path) !== previous.sha256) {
      return `이미 적용 기록이 있는 migration을 수정하거나 삭제할 수 없습니다: ${previous.path}`;
    }
  }
  return null;
}

export function authConfigReceiptIssue(receipt, projectRef, origin, now = new Date()) {
  const envelopeIssue = receiptEnvelopeIssue(receipt);
  if (envelopeIssue) return envelopeIssue;
  if (!receipt?.authConfig) return "성공한 Auth config push receipt가 없습니다.";
  if (receipt.authConfig.projectRef !== projectRef) return "Auth config receipt의 project ref가 현재 연결과 다릅니다.";
  if (receipt.authConfig.origin !== origin) return "Auth config receipt의 origin이 현재 설정과 다릅니다.";
  if (receipt.authConfig.signupDisabled !== true) return "Auth config receipt가 폐쇄 가입 OFF를 증명하지 않습니다.";
  const timestampIssue = receiptTimestampIssue(receipt.authConfig, "pushedAt", now);
  if (timestampIssue) return `Auth config receipt ${timestampIssue}`;
  return null;
}
