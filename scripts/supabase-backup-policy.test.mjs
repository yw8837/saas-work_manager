import { describe, expect, it } from "vitest";
import {
  backupFileNames,
  backupInvocations,
  backupOutputDirectoryIssue,
  createBackupManifest,
} from "./supabase-backup-policy.mjs";

describe("Supabase logical backup safety", () => {
  it("requires an absolute path outside the repository", () => {
    const root = "C:\\workspace\\ilgamcheck";
    expect(backupOutputDirectoryIssue("backups", root)).toMatch(/절대경로/);
    expect(backupOutputDirectoryIssue("C:\\workspace\\ilgamcheck\\backups", root)).toMatch(/저장소 내부/);
    expect(backupOutputDirectoryIssue("D:\\encrypted\\ilgamcheck", root)).toBeNull();
  });

  it("creates unique UTC names and pinned no-shell CLI arguments", () => {
    const names = backupFileNames(new Date("2026-08-16T12:34:56.789Z"));
    expect(names).toEqual({
      schema: "ilgamcheck-public-schema-20260816T123456Z.sql",
      data: "ilgamcheck-public-data-20260816T123456Z.sql",
      manifest: "ilgamcheck-backup-20260816T123456Z.json",
    });
    const lockedTarget = {
      projectRef: "abcdefghijklmnopqrst",
      workdir: "C:\\Temp\\ilgamcheck-supabase-target-fixed",
    };
    const invocations = backupInvocations(
      "D:\\b\\schema.sql",
      "D:\\b\\data.sql",
      lockedTarget,
      "win32",
      {
        nodeExecutable: "C:\\node\\node.exe",
        npxCliPath: "C:\\node\\npm\\npx-cli.js",
      },
    );
    expect(invocations[0]).toEqual(expect.objectContaining({
      executable: "C:\\node\\node.exe",
      args: expect.arrayContaining([
        "--workdir",
        lockedTarget.workdir,
        "db",
        "dump",
        "D:\\b\\schema.sql",
        "--project-ref",
        lockedTarget.projectRef,
      ]),
    }));
    expect(invocations[0].args).not.toContain("--linked");
    expect(invocations[1].args).toEqual(expect.arrayContaining(["--data-only", "--use-copy"]));
  });

  it("binds every backup manifest to the exact verified Seoul project", () => {
    const manifest = createBackupManifest({
      createdAt: new Date("2026-08-17T00:00:00.000Z"),
      projectRef: "abcdefghijklmnopqrst",
      files: [
        { name: "schema.sql", bytes: 10, sha256: "a".repeat(64) },
        { name: "data.sql", bytes: 20, sha256: "b".repeat(64) },
      ],
    });
    expect(manifest).toMatchObject({
      projectRef: "abcdefghijklmnopqrst",
      region: "ap-northeast-2",
      expectedRuntimeContract: "202608170006",
    });
    expect(manifest).not.toHaveProperty("runtimeContract");
    expect(() => createBackupManifest({
      createdAt: new Date(),
      projectRef: "wrong",
      files: [{}, {}],
    })).toThrow(/project ref/);
  });
});
