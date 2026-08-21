import { createHash } from "node:crypto";
import { createReadStream, existsSync, lstatSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import nextEnv from "@next/env";
import {
  backupFileNames,
  backupInvocations,
  backupOutputDirectoryIssue,
  createBackupManifest,
  SENSITIVE_BACKUP_ACK,
} from "./supabase-backup-policy.mjs";
import { minimalChildEnvironment } from "./minimal-child-environment.mjs";
import { verifyLinkedSupabaseProject } from "./supabase-project-guard.mjs";
import {
  createLockedSupabaseWorkdir,
  removeLockedSupabaseWorkdir,
} from "./supabase-locked-target.mjs";

if (process.argv.includes("--help")) {
  console.log("사용법: npm run supabase:backup -- --output-dir <저장소 밖 암호화 폴더> --ack-sensitive-data I_UNDERSTAND_EXPORT_CONTAINS_CUSTOMER_DATA");
  console.log("실제 값은 ILGAMCHECK_BACKUP_DIR, ILGAMCHECK_BACKUP_ACK 환경변수로도 지정할 수 있습니다.");
  console.log("주의: public logical dump에는 고객 데이터와 공개 링크 원문이 포함될 수 있고 Auth 전체 백업은 아닙니다.");
  process.exit(0);
}

function flagValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const rawOutputDirectory = flagValue("--output-dir") ?? process.env.ILGAMCHECK_BACKUP_DIR;
const acknowledgement = flagValue("--ack-sensitive-data") ?? process.env.ILGAMCHECK_BACKUP_ACK;
const initialIssue = backupOutputDirectoryIssue(rawOutputDirectory, process.cwd());
if (initialIssue) {
  console.error(`[supabase-backup] ${initialIssue}`);
  process.exit(1);
}
if (acknowledgement !== SENSITIVE_BACKUP_ACK) {
  console.error(`[supabase-backup] 민감 데이터 내보내기 확인값이 필요합니다: ${SENSITIVE_BACKUP_ACK}`);
  process.exit(1);
}
if (!existsSync(rawOutputDirectory) || !lstatSync(rawOutputDirectory).isDirectory()) {
  console.error("[supabase-backup] 백업 폴더는 미리 만들어진 실제 디렉터리여야 합니다.");
  process.exit(1);
}

const outputDirectory = realpathSync(rawOutputDirectory);
const resolvedIssue = backupOutputDirectoryIssue(outputDirectory, realpathSync(process.cwd()));
if (resolvedIssue) {
  console.error(`[supabase-backup] ${resolvedIssue}`);
  process.exit(1);
}

const linkedRefPath = join(process.cwd(), "supabase", ".temp", "project-ref");
if (!existsSync(linkedRefPath)) {
  console.error("[supabase-backup] Supabase 연결 정보가 없습니다. 먼저 supabase:link를 실행하세요.");
  process.exit(1);
}

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
let linkedProject;
try {
  linkedProject = verifyLinkedSupabaseProject();
} catch (error) {
  console.error(`[supabase-backup] 원격 대상 검증 실패: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const names = backupFileNames();
const schemaPath = join(outputDirectory, names.schema);
const dataPath = join(outputDirectory, names.data);
const manifestPath = join(outputDirectory, names.manifest);
for (const target of [schemaPath, dataPath, manifestPath]) {
  if (existsSync(target)) {
    console.error(`[supabase-backup] 기존 파일을 덮어쓰지 않습니다: ${target}`);
    process.exit(1);
  }
}

let lockedTarget;
try {
  lockedTarget = createLockedSupabaseWorkdir({ projectRef: linkedProject.projectRef });
} catch (error) {
  console.error(`[supabase-backup] 고정 target 작업공간 생성 실패: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

function run(command) {
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

function sha256(path) {
  return new Promise((resolveHash, rejectHash) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("error", rejectHash);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolveHash(hash.digest("hex")));
  });
}

let dumpSucceeded = false;
try {
  console.log(`[supabase-backup] 검증·고정된 프로젝트 ${linkedProject.projectRef}의 public schema/data logical dump를 시작합니다.`);
  for (const command of backupInvocations(schemaPath, dataPath, lockedTarget)) run(command);
  dumpSucceeded = true;
} catch (error) {
  console.error(`[supabase-backup] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = Number.isInteger(error?.exitStatus) ? error.exitStatus : 1;
} finally {
  try {
    removeLockedSupabaseWorkdir(lockedTarget);
  } catch (error) {
    console.error(`[supabase-backup] 임시 고정 작업공간 정리 실패: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
if (!dumpSucceeded || process.exitCode) process.exit(process.exitCode ?? 1);

const [schemaHash, dataHash] = await Promise.all([sha256(schemaPath), sha256(dataPath)]);
writeFileSync(manifestPath, `${JSON.stringify(createBackupManifest({
  createdAt: new Date(),
  projectRef: linkedProject.projectRef,
  files: [
    { name: names.schema, bytes: statSync(schemaPath).size, sha256: schemaHash },
    { name: names.data, bytes: statSync(dataPath).size, sha256: dataHash },
  ],
}), null, 2)}\n`, { encoding: "utf8", flag: "wx" });

console.log(`[supabase-backup] logical dump와 SHA-256 manifest 생성 완료: ${outputDirectory}`);
console.log("[supabase-backup] 이 결과는 Auth/Storage/관리 백업을 포함하지 않습니다. 별도 recovery 프로젝트 복원 훈련이 필요합니다.");
