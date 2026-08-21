import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  collectReleaseSourceFiles,
  computeReleaseFingerprint,
  RELEASE_FINGERPRINT_META_KEY,
} from "./release-fingerprint.mjs";

const tempRoots = [];

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), "ilgamcheck-fingerprint-"));
  tempRoots.push(root);
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "public"), { recursive: true });
  mkdirSync(join(root, "supabase", "migrations"), { recursive: true });
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "src", "z.ts"), "export const z = 1;\n");
  writeFileSync(join(root, "src", "a.ts"), "export const a = 1;\n");
  writeFileSync(join(root, "public", "logo.bin"), Buffer.from([0, 1, 2, 255]));
  writeFileSync(join(root, "supabase", "migrations", "001.sql"), "select 1;\n");
  writeFileSync(join(root, "supabase", "config.toml"), "project_id = \"ilgamcheck\"\n");
  writeFileSync(join(root, "scripts", "deploy-preflight.mjs"), "export const preflight = true;\n");
  writeFileSync(join(root, "scripts", "vercel-deploy.mjs"), "export const deploy = true;\n");
  writeFileSync(join(root, "scripts", "vercel-project-guard.mjs"), "export const guard = true;\n");
  writeFileSync(join(root, "scripts", "release-fingerprint.mjs"), "export const fingerprint = true;\n");
  writeFileSync(join(root, "package.json"), "{\"name\":\"fixture\"}\n");
  writeFileSync(join(root, "package-lock.json"), "{\"lockfileVersion\":3}\n");
  writeFileSync(join(root, "next.config.ts"), "export default {};\n");
  writeFileSync(join(root, "tsconfig.json"), "{}\n");
  writeFileSync(join(root, "vercel.json"), "{}\n");
  writeFileSync(join(root, ".gitignore"), ".env*\n.next/\n");
  return root;
}

function referenceFingerprint(root) {
  const files = collectReleaseSourceFiles(root);
  const hash = createHash("sha256");
  for (const file of files) {
    const bytes = readFileSync(file.absolutePath);
    const pathBytes = Buffer.from(file.relativePath, "utf8");
    const header = Buffer.alloc(16);
    header.writeBigUInt64BE(BigInt(pathBytes.length), 0);
    header.writeBigUInt64BE(BigInt(bytes.length), 8);
    hash.update(header).update(pathBytes).update(bytes);
  }
  return hash.digest("hex");
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("release source fingerprint", () => {
  it("hashes allowlisted files in relative POSIX path order with raw bytes", () => {
    const root = makeRoot();
    const paths = collectReleaseSourceFiles(root).map((file) => file.relativePath);

    expect(paths).toEqual([...paths].sort());
    expect(paths).toContain("src/a.ts");
    expect(paths).toContain("supabase/migrations/001.sql");
    expect(paths).toContain("supabase/config.toml");
    expect(paths).toContain("scripts/deploy-preflight.mjs");
    expect(paths).toContain("scripts/vercel-deploy.mjs");
    expect(paths).toContain("scripts/vercel-project-guard.mjs");
    expect(paths).toContain("scripts/release-fingerprint.mjs");
    expect(paths.every((path) => !path.includes("\\"))).toBe(true);
    expect(computeReleaseFingerprint(root)).toBe(referenceFingerprint(root));
    expect(computeReleaseFingerprint(root)).toMatch(/^[a-f0-9]{64}$/);
    expect(RELEASE_FINGERPRINT_META_KEY).toBe("ilgamcheckReleaseFingerprint");
  });

  it("changes for included bytes but ignores files outside the allowlist", () => {
    const root = makeRoot();
    const before = computeReleaseFingerprint(root);

    writeFileSync(join(root, "README.md"), "not deployed source\n");
    expect(computeReleaseFingerprint(root)).toBe(before);

    writeFileSync(join(root, "src", "a.ts"), "export const a = 2;\n");
    expect(computeReleaseFingerprint(root)).not.toBe(before);
  });

  it("changes when deployment-control scripts or upload ignore rules change", () => {
    const root = makeRoot();
    const initial = computeReleaseFingerprint(root);

    writeFileSync(join(root, "scripts", "vercel-deploy.mjs"), "export const deploy = false;\n");
    const afterScriptChange = computeReleaseFingerprint(root);
    expect(afterScriptChange).not.toBe(initial);

    writeFileSync(join(root, ".gitignore"), ".env*\n.next/\ntest-results/\n");
    const afterGitIgnoreChange = computeReleaseFingerprint(root);
    expect(afterGitIgnoreChange).not.toBe(afterScriptChange);
    expect(collectReleaseSourceFiles(root).map((file) => file.relativePath)).toContain(".gitignore");

    writeFileSync(join(root, ".vercelignore"), "test-results/\n");
    const afterIgnoreAdded = computeReleaseFingerprint(root);
    expect(afterIgnoreAdded).not.toBe(afterGitIgnoreChange);
    expect(collectReleaseSourceFiles(root).map((file) => file.relativePath)).toContain(".vercelignore");

    writeFileSync(join(root, ".vercelignore"), "test-results/\nplaywright-report/\n");
    expect(computeReleaseFingerprint(root)).not.toBe(afterIgnoreAdded);

    const beforeAuthConfigChange = computeReleaseFingerprint(root);
    writeFileSync(join(root, "supabase", "config.toml"), "project_id = \"changed\"\n");
    expect(computeReleaseFingerprint(root)).not.toBe(beforeAuthConfigChange);
  });
});
