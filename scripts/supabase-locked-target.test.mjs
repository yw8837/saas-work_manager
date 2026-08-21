import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { collectMigrationManifest } from "./migration-fingerprint.mjs";
import { SUPABASE_CLI_VERSION } from "./supabase-cli-policy.mjs";
import {
  createLockedSupabaseWorkdir,
  lockedSupabaseNpxInvocation,
  removeLockedSupabaseWorkdir,
} from "./supabase-locked-target.mjs";

const roots = [];
const locks = [];

function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), "ilgamcheck-locked-source-"));
  roots.push(root);
  mkdirSync(join(root, "supabase", "migrations"), { recursive: true });
  mkdirSync(join(root, "supabase", ".temp"), { recursive: true });
  writeFileSync(join(root, "supabase", "config.toml"), 'project_id = "local"\n');
  writeFileSync(join(root, "supabase", "migrations", "202608140001_first.sql"), "select 1;\n");
  writeFileSync(join(root, "supabase", ".temp", "project-ref"), "abcdefghijklmnopqrst\n");
  return root;
}

afterEach(() => {
  for (const lock of locks.splice(0)) {
    if (existsSync(lock.workdir)) removeLockedSupabaseWorkdir(lock);
  }
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Supabase immutable target workdir", () => {
  it("keeps the captured target and migration snapshot after the source link mutates", () => {
    const root = fixtureRoot();
    const manifest = collectMigrationManifest(root);
    const lock = createLockedSupabaseWorkdir({
      root,
      projectRef: "abcdefghijklmnopqrst",
      migrationManifest: manifest,
    });
    locks.push(lock);

    writeFileSync(join(root, "supabase", ".temp", "project-ref"), "zyxwvutsrqponmlkjihg\n");
    writeFileSync(join(root, "supabase", "migrations", "202608140001_first.sql"), "select 999;\n");

    expect(readFileSync(join(lock.workdir, "supabase", ".temp", "project-ref"), "utf8").trim())
      .toBe("abcdefghijklmnopqrst");
    expect(readFileSync(join(lock.workdir, "supabase", "migrations", "202608140001_first.sql"), "utf8"))
      .toBe("select 1;\n");

    const invocation = lockedSupabaseNpxInvocation(
      ["db", "push", "--dry-run"],
      lock,
      "win32",
      { nodeExecutable: "C:\\node\\node.exe", npxCliPath: "C:\\node\\npm\\npx-cli.js" },
    );
    expect(invocation).toEqual({
      executable: "C:\\node\\node.exe",
      args: [
        "C:\\node\\npm\\npx-cli.js",
        "-y",
        `supabase@${SUPABASE_CLI_VERSION}`,
        "--workdir",
        lock.workdir,
        "db",
        "push",
        "--dry-run",
        "--project-ref",
        "abcdefghijklmnopqrst",
      ],
    });
  });

  it("fails before invocation if migration bytes changed during snapshot", () => {
    const root = fixtureRoot();
    const manifest = collectMigrationManifest(root);
    writeFileSync(join(root, "supabase", "migrations", "202608140001_first.sql"), "select 2;\n");
    expect(() => createLockedSupabaseWorkdir({
      root,
      projectRef: "abcdefghijklmnopqrst",
      migrationManifest: manifest,
    })).toThrow(/snapshot 중 파일이 변경/);
  });

  it("rejects caller-supplied target selectors and safely removes only its marked temp directory", () => {
    const root = fixtureRoot();
    const lock = createLockedSupabaseWorkdir({ root, projectRef: "abcdefghijklmnopqrst" });
    expect(() => lockedSupabaseNpxInvocation(["db", "dump", "--linked"], lock)).toThrow(/target 선택/);
    removeLockedSupabaseWorkdir(lock);
    expect(existsSync(lock.workdir)).toBe(false);
  });
});
