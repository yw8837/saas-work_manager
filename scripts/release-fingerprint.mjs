import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

export const RELEASE_FINGERPRINT_META_KEY = "ilgamcheckReleaseFingerprint";

export const RELEASE_SOURCE_PATHS = Object.freeze([
  "src",
  "public",
  "supabase/migrations",
  "supabase/config.toml",
  "scripts",
  "package.json",
  "package-lock.json",
  "next.config.ts",
  "tsconfig.json",
  "vercel.json",
  ".gitignore",
  ".vercelignore",
]);

function toPosixPath(path) {
  return path.split(sep).join("/");
}

function collectPath(root, absolutePath, files) {
  let stats;
  try {
    stats = lstatSync(absolutePath);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }

  if (stats.isSymbolicLink()) {
    throw new Error(`배포 지문 경로에 심볼릭 링크를 사용할 수 없습니다: ${toPosixPath(relative(root, absolutePath))}`);
  }

  if (stats.isDirectory()) {
    const entries = readdirSync(absolutePath, { withFileTypes: true })
      .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const entry of entries) collectPath(root, join(absolutePath, entry.name), files);
    return;
  }

  if (!stats.isFile()) {
    throw new Error(`배포 지문 경로는 일반 파일이어야 합니다: ${toPosixPath(relative(root, absolutePath))}`);
  }

  files.push({
    absolutePath,
    relativePath: toPosixPath(relative(root, absolutePath)),
  });
}

export function collectReleaseSourceFiles(root = process.cwd()) {
  const files = [];
  for (const sourcePath of RELEASE_SOURCE_PATHS) {
    collectPath(root, join(root, ...sourcePath.split("/")), files);
  }
  return files.sort((a, b) => a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0);
}

export function computeReleaseFingerprint(root = process.cwd()) {
  const files = collectReleaseSourceFiles(root);
  if (files.length === 0) throw new Error("배포 지문을 만들 소스 파일이 없습니다.");

  const hash = createHash("sha256");
  for (const file of files) {
    const bytes = readFileSync(file.absolutePath);
    const pathBytes = Buffer.from(file.relativePath, "utf8");
    const header = Buffer.allocUnsafe(16);
    header.writeBigUInt64BE(BigInt(pathBytes.length), 0);
    header.writeBigUInt64BE(BigInt(bytes.length), 8);
    hash.update(header);
    hash.update(pathBytes);
    hash.update(bytes);
  }
  return hash.digest("hex");
}
