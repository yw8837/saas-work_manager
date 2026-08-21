import { HOSTED_RUNTIME_CONTRACT } from "./verify-hosted-runtime-policy.mjs";
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  authConfigReceiptIssue,
  deploymentReceiptPath,
  migrationReceiptIssue,
  POLICY_BUNDLE_DIGEST,
  priorMigrationHistoryIssue,
  readDeploymentReceipt,
  recordAuthConfigReceipt,
  recordMigrationReceipt,
} from "./deployment-receipt.mjs";

describe("deployment receipt", () => {
  function rootWithMigration() {
    const root = mkdtempSync(join(tmpdir(), "ilgamcheck-receipt-"));
    const directory = join(root, "supabase", "migrations");
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "202608140001_initial.sql"), "select 1;\n");
    return root;
  }

  it("atomically preserves migration and Auth config success without secrets", () => {
    const root = rootWithMigration();
    recordMigrationReceipt({ root, projectRef: "abcdefghijklmnopqrst", now: new Date("2026-08-17T00:00:00Z") });
    recordAuthConfigReceipt({
      root,
      projectRef: "abcdefghijklmnopqrst",
      origin: "https://ilgamcheck.kr",
      now: new Date("2026-08-17T00:01:00Z"),
    });
    const receipt = readDeploymentReceipt(root);
    const now = new Date("2026-08-17T00:02:00Z");
    expect(migrationReceiptIssue(
      receipt,
      "abcdefghijklmnopqrst",
      receipt.migrations.migrationFingerprint,
      now,
    )).toBeNull();
    expect(authConfigReceiptIssue(receipt, "abcdefghijklmnopqrst", "https://ilgamcheck.kr", now)).toBeNull();
    const raw = readFileSync(deploymentReceiptPath(root), "utf8");
    expect(raw).not.toMatch(/secret|password|anon_key/i);
    expect(receipt.migrations.files).toEqual([
      expect.objectContaining({
        path: "supabase/migrations/202608140001_initial.sql",
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    ]);
    expect(receipt.migrations.policyBundleDigest).toBe(POLICY_BUNDLE_DIGEST);
  });

  it("allows appended migrations but rejects edits or deletion of a recorded file", () => {
    const previous = {
      schemaVersion: 1,
      migrations: {
        projectRef: "abcdefghijklmnopqrst",
        files: [
          { path: "supabase/migrations/001.sql", sha256: "a".repeat(64) },
        ],
      },
    };
    expect(priorMigrationHistoryIssue(previous, "abcdefghijklmnopqrst", [
      { path: "supabase/migrations/001.sql", sha256: "a".repeat(64) },
      { path: "supabase/migrations/002.sql", sha256: "b".repeat(64) },
    ])).toBeNull();
    expect(priorMigrationHistoryIssue(previous, "abcdefghijklmnopqrst", [
      { path: "supabase/migrations/001.sql", sha256: "c".repeat(64) },
    ])).toMatch(/수정하거나 삭제/);
    expect(priorMigrationHistoryIssue(previous, "abcdefghijklmnopqrst", [])).toMatch(/수정하거나 삭제/);
  });

  it("rejects missing, stale-project, and stale-origin receipts", () => {
    const fingerprint = "a".repeat(64);
    expect(migrationReceiptIssue(null, "abcdefghijklmnopqrst", fingerprint)).toMatch(/없습니다/);
    expect(migrationReceiptIssue({ schemaVersion: 1, migrations: { projectRef: "other", runtimeContract: HOSTED_RUNTIME_CONTRACT, migrationFingerprint: fingerprint, appliedAt: "2026-08-17T00:00:00.000Z" } }, "abcdefghijklmnopqrst", fingerprint, new Date("2026-08-17T00:01:00Z")))
      .toMatch(/project ref/);
    expect(authConfigReceiptIssue({ schemaVersion: 1, authConfig: { projectRef: "abcdefghijklmnopqrst", origin: "https://old.kr", signupDisabled: true, pushedAt: "2026-08-17T00:00:00.000Z" } }, "abcdefghijklmnopqrst", "https://new.kr", new Date("2026-08-17T00:01:00Z")))
      .toMatch(/origin/);
  });

  it("rejects hand-written, malformed, future, and stale receipt timestamps", () => {
    const now = new Date("2026-08-17T00:00:00.000Z");
    const fingerprint = "a".repeat(64);
    const migration = (appliedAt, receiptFingerprint = fingerprint) => ({
      schemaVersion: 1,
      migrations: {
        projectRef: "abcdefghijklmnopqrst",
        runtimeContract: HOSTED_RUNTIME_CONTRACT,
        policyBundleDigest: POLICY_BUNDLE_DIGEST,
        migrationFingerprint: receiptFingerprint,
        ...(appliedAt === undefined ? {} : { appliedAt }),
      },
    });
    expect(migrationReceiptIssue({ migrations: migration(now.toISOString()).migrations }, "abcdefghijklmnopqrst", fingerprint, now)).toMatch(/schemaVersion/);
    expect(migrationReceiptIssue(migration(undefined), "abcdefghijklmnopqrst", fingerprint, now)).toMatch(/시각이 없습니다/);
    expect(migrationReceiptIssue(migration("not-a-date"), "abcdefghijklmnopqrst", fingerprint, now)).toMatch(/ISO/);
    expect(migrationReceiptIssue(migration("2026-08-17T00:06:00.000Z"), "abcdefghijklmnopqrst", fingerprint, now)).toMatch(/미래/);
    expect(migrationReceiptIssue(migration("2026-07-17T23:59:59.999Z"), "abcdefghijklmnopqrst", fingerprint, now)).toMatch(/30일/);
    expect(migrationReceiptIssue(migration(now.toISOString(), "b".repeat(64)), "abcdefghijklmnopqrst", fingerprint, now))
      .toMatch(/SQL fingerprint/);
    const wrongPolicy = migration(now.toISOString());
    wrongPolicy.migrations.policyBundleDigest = `sha256:${"0".repeat(64)}`;
    expect(migrationReceiptIssue(wrongPolicy, "abcdefghijklmnopqrst", fingerprint, now))
      .toMatch(/policy bundle digest/);
  });
});
