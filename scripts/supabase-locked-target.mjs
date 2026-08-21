import { createHash, randomBytes } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { projectRefIssue, supabaseNpxInvocation } from "./supabase-cli-policy.mjs";

const LOCKED_WORKDIR_PREFIX = "ilgamcheck-supabase-target-";
const CLEANUP_MARKER = ".ilgamcheck-locked-target";
const MIGRATION_PATH_PREFIX = "supabase/migrations/";

function regularFileBytes(path, label) {
  let stats;
  try {
    stats = lstatSync(path);
  } catch {
    throw new Error(`${label} 파일을 읽을 수 없습니다.`);
  }
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new Error(`${label}은 일반 파일이어야 합니다.`);
  }
  return readFileSync(path);
}

function comparablePath(path) {
  const resolved = resolve(path);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function assertSafeCleanupTarget(lock) {
  if (!lock || typeof lock.workdir !== "string" || typeof lock.cleanupToken !== "string") {
    throw new Error("Supabase 고정 작업공간 정리 정보가 올바르지 않습니다.");
  }
  const workdir = resolve(lock.workdir);
  if (comparablePath(dirname(workdir)) !== comparablePath(tmpdir())) {
    throw new Error("Supabase 고정 작업공간이 OS 임시 폴더 바로 아래가 아닙니다.");
  }
  if (!basename(workdir).startsWith(LOCKED_WORKDIR_PREFIX)) {
    throw new Error("Supabase 고정 작업공간 이름이 안전 규칙과 다릅니다.");
  }
  const stats = lstatSync(workdir);
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error("Supabase 고정 작업공간이 실제 디렉터리가 아닙니다.");
  }
  const markerPath = join(workdir, CLEANUP_MARKER);
  const markerStats = lstatSync(markerPath);
  if (markerStats.isSymbolicLink() || !markerStats.isFile()) {
    throw new Error("Supabase 고정 작업공간 정리 표식이 올바르지 않습니다.");
  }
  if (readFileSync(markerPath, "utf8") !== lock.cleanupToken) {
    throw new Error("Supabase 고정 작업공간 정리 표식이 일치하지 않습니다.");
  }
  const realTemp = realpathSync(tmpdir());
  const realWorkdir = realpathSync(workdir);
  const tempPrefix = `${comparablePath(realTemp)}${sep}`;
  if (!comparablePath(realWorkdir).startsWith(tempPrefix)) {
    throw new Error("Supabase 고정 작업공간 실경로가 OS 임시 폴더 밖입니다.");
  }
  return workdir;
}

export function createLockedSupabaseWorkdir({
  root = process.cwd(),
  projectRef,
  migrationManifest = [],
} = {}) {
  const refIssue = projectRefIssue(projectRef);
  if (refIssue) throw new Error(`고정할 Supabase target: ${refIssue}`);
  if (!Array.isArray(migrationManifest)) {
    throw new Error("고정할 migration manifest가 배열이 아닙니다.");
  }

  const workdir = mkdtempSync(join(tmpdir(), LOCKED_WORKDIR_PREFIX));
  const cleanupToken = randomBytes(32).toString("hex");
  const lock = { workdir, cleanupToken, projectRef: projectRef.trim() };
  writeFileSync(join(workdir, CLEANUP_MARKER), cleanupToken, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });

  try {
    const sourceSupabase = join(root, "supabase");
    const targetSupabase = join(workdir, "supabase");
    const targetMigrations = join(targetSupabase, "migrations");
    const targetTemp = join(targetSupabase, ".temp");
    mkdirSync(targetMigrations, { recursive: true });
    mkdirSync(targetTemp, { recursive: true });

    const configBytes = regularFileBytes(join(sourceSupabase, "config.toml"), "supabase/config.toml");
    writeFileSync(join(targetSupabase, "config.toml"), configBytes, { flag: "wx" });

    for (const file of migrationManifest) {
      const path = file?.path;
      const sha256 = file?.sha256;
      if (
        typeof path !== "string"
        || !path.startsWith(MIGRATION_PATH_PREFIX)
        || typeof sha256 !== "string"
        || !/^[a-f0-9]{64}$/.test(sha256)
      ) {
        throw new Error("고정할 migration manifest 항목이 올바르지 않습니다.");
      }
      const name = path.slice(MIGRATION_PATH_PREFIX.length);
      if (!name || name.includes("/") || name.includes("\\") || !name.endsWith(".sql")) {
        throw new Error("고정할 migration 경로가 안전하지 않습니다.");
      }
      const bytes = regularFileBytes(join(sourceSupabase, "migrations", name), `migration ${name}`);
      const actualHash = createHash("sha256").update(bytes).digest("hex");
      if (actualHash !== sha256) {
        throw new Error(`migration snapshot 중 파일이 변경됐습니다: ${name}`);
      }
      writeFileSync(join(targetMigrations, name), bytes, { flag: "wx" });
    }

    writeFileSync(join(targetTemp, "project-ref"), `${lock.projectRef}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    return Object.freeze(lock);
  } catch (error) {
    removeLockedSupabaseWorkdir(lock);
    throw error;
  }
}

export function removeLockedSupabaseWorkdir(lock) {
  const workdir = assertSafeCleanupTarget(lock);
  rmSync(workdir, { recursive: true, force: false, maxRetries: 2 });
}

export function lockedSupabaseNpxInvocation(
  commandArgs,
  { projectRef, workdir },
  platform = process.platform,
  runtime = {},
) {
  const refIssue = projectRefIssue(projectRef);
  if (refIssue) throw new Error(`고정할 Supabase target: ${refIssue}`);
  if (typeof workdir !== "string" || !isAbsolute(workdir)) {
    throw new Error("Supabase 고정 작업공간은 절대경로여야 합니다.");
  }
  if (!Array.isArray(commandArgs) || commandArgs.some((value) => typeof value !== "string")) {
    throw new Error("Supabase CLI 인자가 올바르지 않습니다.");
  }
  const forbidden = new Set(["--workdir", "--project-ref", "--linked", "--local", "--db-url"]);
  if (commandArgs.some((value) => forbidden.has(value))) {
    throw new Error("Supabase target 선택 인자는 고정 target helper만 추가할 수 있습니다.");
  }
  return supabaseNpxInvocation([
    "--workdir",
    workdir,
    ...commandArgs,
    "--project-ref",
    projectRef.trim(),
  ], platform, runtime);
}
