import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function collectMigrationManifest(root = process.cwd()) {
  const directory = join(root, "supabase", "migrations");
  let names;
  try {
    names = readdirSync(directory)
      .filter((name) => name.endsWith(".sql"))
      .sort();
  } catch {
    throw new Error("Supabase migration 디렉터리를 읽을 수 없습니다.");
  }
  if (names.length === 0) throw new Error("Supabase migration SQL 파일이 없습니다.");

  const manifest = [];
  for (const name of names) {
    const absolutePath = join(directory, name);
    const stats = lstatSync(absolutePath);
    if (stats.isSymbolicLink() || !stats.isFile()) {
      throw new Error(`Supabase migration은 일반 SQL 파일이어야 합니다: ${name}`);
    }
    const pathBytes = Buffer.from(`supabase/migrations/${name}`, "utf8");
    const bytes = readFileSync(absolutePath);
    manifest.push({
      path: pathBytes.toString("utf8"),
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  return manifest;
}

export function computeMigrationFingerprint(root = process.cwd()) {
  return migrationFingerprintFromManifest(collectMigrationManifest(root));
}

export function migrationFingerprintFromManifest(manifest) {
  if (!Array.isArray(manifest) || manifest.length === 0) {
    throw new Error("Supabase migration manifest가 비어 있습니다.");
  }
  const hash = createHash("sha256");
  for (const file of manifest) {
    if (
      typeof file?.path !== "string"
      || !file.path.startsWith("supabase/migrations/")
      || typeof file?.sha256 !== "string"
      || !/^[a-f0-9]{64}$/.test(file.sha256)
    ) {
      throw new Error("Supabase migration manifest 항목이 올바르지 않습니다.");
    }
    const pathBytes = Buffer.from(file.path, "utf8");
    const digestBytes = Buffer.from(file.sha256, "ascii");
    const header = Buffer.allocUnsafe(16);
    header.writeBigUInt64BE(BigInt(pathBytes.length), 0);
    header.writeBigUInt64BE(BigInt(digestBytes.length), 8);
    hash.update(header);
    hash.update(pathBytes);
    hash.update(digestBytes);
  }
  return hash.digest("hex");
}

export function migrationManifestChanged(before, after) {
  return JSON.stringify(before) !== JSON.stringify(after);
}
