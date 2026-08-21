import { isAbsolute, parse, relative, resolve } from "node:path";
import { projectRefIssue } from "./supabase-cli-policy.mjs";
import { lockedSupabaseNpxInvocation } from "./supabase-locked-target.mjs";
import { HOSTED_RUNTIME_CONTRACT } from "./verify-hosted-runtime-policy.mjs";

export const SENSITIVE_BACKUP_ACK = "I_UNDERSTAND_EXPORT_CONTAINS_CUSTOMER_DATA";

export function backupOutputDirectoryIssue(rawDirectory, projectRoot) {
  const value = rawDirectory?.trim();
  if (!value) return "ILGAMCHECK_BACKUP_DIR 또는 --output-dir 절대경로가 필요합니다.";
  if (!isAbsolute(value)) return "백업 경로는 저장소 밖의 절대경로여야 합니다.";

  const target = resolve(value);
  const root = resolve(projectRoot);
  if (target === parse(target).root) return "드라이브 루트는 백업 경로로 사용할 수 없습니다.";

  const fromRoot = relative(root, target);
  if (fromRoot === "" || (!fromRoot.startsWith("..") && !isAbsolute(fromRoot))) {
    return "백업에는 고객 정보가 포함될 수 있어 프로젝트/저장소 내부에 둘 수 없습니다.";
  }
  return null;
}

export function backupFileNames(at = new Date()) {
  const stamp = at.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return {
    schema: `ilgamcheck-public-schema-${stamp}.sql`,
    data: `ilgamcheck-public-data-${stamp}.sql`,
    manifest: `ilgamcheck-backup-${stamp}.json`,
  };
}

export function backupInvocations(
  schemaPath,
  dataPath,
  lockedTarget,
  platform = process.platform,
  runtime = {},
) {
  return [
    lockedSupabaseNpxInvocation([
      "db", "dump", "--schema", "public", "--file", schemaPath,
    ], lockedTarget, platform, runtime),
    lockedSupabaseNpxInvocation([
      "db", "dump", "--schema", "public", "--data-only", "--use-copy", "--file", dataPath,
    ], lockedTarget, platform, runtime),
  ];
}

export function createBackupManifest({ createdAt, projectRef, files }) {
  const refIssue = projectRefIssue(projectRef);
  if (refIssue) throw new Error(`backup project ref: ${refIssue}`);
  if (!Array.isArray(files) || files.length !== 2) {
    throw new Error("backup manifest에는 schema/data 파일 두 개가 필요합니다.");
  }
  return {
    createdAt: createdAt.toISOString(),
    projectRef,
    region: "ap-northeast-2",
    scope: "public schema and data only; Supabase Auth and managed backups excluded",
    expectedRuntimeContract: HOSTED_RUNTIME_CONTRACT,
    files,
  };
}
