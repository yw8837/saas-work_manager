import { spawnSync } from "node:child_process";
import nextEnv from "@next/env";
import { migrationApplyAck, verifyLinkedSupabaseProject } from "./supabase-project-guard.mjs";
import {
  priorMigrationHistoryIssue,
  readDeploymentReceipt,
  recordMigrationReceipt,
} from "./deployment-receipt.mjs";
import {
  collectMigrationManifest,
  migrationFingerprintFromManifest,
  migrationManifestChanged,
} from "./migration-fingerprint.mjs";
import { minimalChildEnvironment } from "./minimal-child-environment.mjs";
import {
  createLockedSupabaseWorkdir,
  lockedSupabaseNpxInvocation,
  removeLockedSupabaseWorkdir,
} from "./supabase-locked-target.mjs";

const { loadEnvConfig } = nextEnv;
const shellDatabasePushAcknowledgement = process.env.ILGAMCHECK_DB_PUSH_ACK;
loadEnvConfig(process.cwd());
delete process.env.ILGAMCHECK_DB_PUSH_ACK;
if (shellDatabasePushAcknowledgement) {
  process.env.ILGAMCHECK_DB_PUSH_ACK = shellDatabasePushAcknowledgement;
}

if (process.argv.includes("--help")) {
  console.log("사용법: npm run supabase:push:dry  # 변경 없는 사전 확인");
  console.log("        npm run supabase:push      # 연결된 원격 DB에 적용 후 목록 확인");
  process.exit(0);
}

const dryRun = process.argv.includes("--dry-run");
const apply = process.argv.includes("--apply");
if (dryRun === apply) {
  console.error("[supabase-push] --dry-run 또는 --apply 중 하나만 지정해야 합니다.");
  process.exit(1);
}

let linkedProject;
try {
  linkedProject = verifyLinkedSupabaseProject();
} catch (error) {
  console.error(`[supabase-push] 원격 대상 검증 실패: ${error.message}`);
  process.exit(1);
}

const migrationManifestBefore = collectMigrationManifest();
const migrationFingerprintBefore = migrationFingerprintFromManifest(migrationManifestBefore);
const historyIssue = priorMigrationHistoryIssue(
  readDeploymentReceipt(),
  linkedProject.projectRef,
  migrationManifestBefore,
);
if (historyIssue) {
  console.error(`[supabase-push] ${historyIssue} 기존 파일을 되돌리고 새 migration 파일을 추가하세요.`);
  process.exit(1);
}

if (apply && process.env.ILGAMCHECK_DB_PUSH_ACK !== migrationApplyAck(linkedProject.projectRef)) {
  console.error(`[supabase-push] ILGAMCHECK_DB_PUSH_ACK=${migrationApplyAck(linkedProject.projectRef)} 확인이 필요합니다.`);
  process.exit(1);
}

let lockedTarget;
try {
  lockedTarget = createLockedSupabaseWorkdir({
    projectRef: linkedProject.projectRef,
    migrationManifest: migrationManifestBefore,
  });
} catch (error) {
  console.error(`[supabase-push] 고정 target 작업공간 생성 실패: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

function run(args) {
  const command = lockedSupabaseNpxInvocation(args, lockedTarget);
  const result = spawnSync(command.executable, command.args, {
    cwd: lockedTarget.workdir,
    env: minimalChildEnvironment(process.env),
    stdio: "inherit",
    shell: false,
  });
  if (result.error) {
    throw new Error(`CLI 실행 실패: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const error = new Error(`CLI가 종료 코드 ${result.status ?? 1}로 실패했습니다.`);
    error.exitStatus = result.status ?? 1;
    throw error;
  }
}

function assertMigrationSourceUnchanged() {
  const after = collectMigrationManifest();
  if (migrationManifestChanged(migrationManifestBefore, after)) {
    throw new Error("CLI 실행 중 원본 migration 파일이 변경됐습니다. 고정 snapshot 외 파일은 적용하지 않았으므로 현재 파일로 dry-run부터 다시 실행하세요.");
  }
}

try {
  assertMigrationSourceUnchanged();
  if (dryRun) {
    console.log(`[supabase-push] DRY RUN — 검증·고정된 Seoul 프로젝트 ${linkedProject.projectRef}의 원격 DB는 변경하지 않습니다.`);
    run(["db", "push", "--dry-run"]);
    assertMigrationSourceUnchanged();
    console.log(`[supabase-push] DRY RUN 통과. 적용하려면 ILGAMCHECK_DB_PUSH_ACK=${migrationApplyAck(linkedProject.projectRef)} 를 현재 셸에만 설정하세요.`);
  } else {
    console.log(`[supabase-push] APPLY — 검증·고정된 Seoul 프로젝트 ${linkedProject.projectRef}에 snapshot migration을 반영합니다.`);
    run(["db", "push"]);
    assertMigrationSourceUnchanged();
    run(["migration", "list"]);
    assertMigrationSourceUnchanged();
    recordMigrationReceipt({
      projectRef: linkedProject.projectRef,
      files: migrationManifestBefore,
      migrationFingerprint: migrationFingerprintBefore,
    });
    console.log("[supabase-push] 적용과 원격 migration 목록 확인 완료.");
  }
} catch (error) {
  console.error(`[supabase-push] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = Number.isInteger(error?.exitStatus) ? error.exitStatus : 1;
} finally {
  try {
    removeLockedSupabaseWorkdir(lockedTarget);
  } catch (error) {
    console.error(`[supabase-push] 임시 고정 작업공간 정리 실패: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
