import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  collectMigrationManifest,
  computeMigrationFingerprint,
  migrationFingerprintFromManifest,
  migrationManifestChanged,
} from "./migration-fingerprint.mjs";

const roots = [];

function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), "ilgamcheck-migrations-"));
  roots.push(root);
  const directory = join(root, "supabase", "migrations");
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "202608160002_second.sql"), "select 2;\n");
  writeFileSync(join(directory, "202608140001_first.sql"), "select 1;\n");
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("migration fingerprint", () => {
  it("is deterministic and changes when migration bytes or names change", () => {
    const root = fixtureRoot();
    const before = computeMigrationFingerprint(root);
    const manifest = collectMigrationManifest(root);
    expect(manifest.map((item) => item.path)).toEqual([
      "supabase/migrations/202608140001_first.sql",
      "supabase/migrations/202608160002_second.sql",
    ]);
    expect(manifest.every((item) => /^[a-f0-9]{64}$/.test(item.sha256))).toBe(true);
    expect(before).toMatch(/^[a-f0-9]{64}$/);
    expect(migrationFingerprintFromManifest(manifest)).toBe(before);
    expect(computeMigrationFingerprint(root)).toBe(before);

    writeFileSync(join(root, "supabase", "migrations", "202608160002_second.sql"), "select 3;\n");
    expect(computeMigrationFingerprint(root)).not.toBe(before);
  });

  it("fails closed without migration SQL files", () => {
    const root = mkdtempSync(join(tmpdir(), "ilgamcheck-migrations-empty-"));
    roots.push(root);
    mkdirSync(join(root, "supabase", "migrations"), { recursive: true });
    expect(() => computeMigrationFingerprint(root)).toThrow(/SQL 파일/);
  });

  it("detects any manifest change across an external push", () => {
    const before = [{ path: "supabase/migrations/001.sql", sha256: "a".repeat(64) }];
    expect(migrationManifestChanged(before, structuredClone(before))).toBe(false);
    expect(migrationManifestChanged(before, [{ ...before[0], sha256: "b".repeat(64) }])).toBe(true);
    expect(migrationManifestChanged(before, [...before, {
      path: "supabase/migrations/002.sql",
      sha256: "c".repeat(64),
    }])).toBe(true);
    expect(() => migrationFingerprintFromManifest([])).toThrow(/비어/);
  });
});
