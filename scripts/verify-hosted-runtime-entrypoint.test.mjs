import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { minimalChildEnvironment } from "./minimal-child-environment.mjs";

const roots = [];
const script = join(dirname(fileURLToPath(import.meta.url)), "verify-hosted-runtime.mjs");

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("verify-hosted-runtime entrypoint", () => {
  it("does not accept a destructive acknowledgement from .env.local", () => {
    const root = mkdtempSync(join(tmpdir(), "ilgamcheck-hosted-ack-"));
    roots.push(root);
    writeFileSync(join(root, ".env.local"), [
      "NEXT_PUBLIC_STORAGE_MODE=hosted",
      "NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijklmnopqrst.supabase.co",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_test_browser_key_1234567890",
      "NEXT_PUBLIC_OPERATOR_NAME=Test Operator",
      "NEXT_PUBLIC_SUPPORT_EMAIL=support@example.com",
      "NEXT_PUBLIC_BETA_SIGNUP_ENABLED=true",
      "ILGAMCHECK_TEST_A_EMAIL=a@example.com",
      "ILGAMCHECK_TEST_A_PASSWORD=dedicated-password-a",
      "ILGAMCHECK_TEST_B_EMAIL=b@example.com",
      "ILGAMCHECK_TEST_B_PASSWORD=dedicated-password-b",
      "ILGAMCHECK_HOSTED_VERIFY_ACK=OVERWRITE_DEDICATED_TEST_DATA",
      "",
    ].join("\n"), "utf8");

    const result = spawnSync(process.execPath, [script], {
      cwd: root,
      env: minimalChildEnvironment(process.env),
      encoding: "utf8",
      shell: false,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("ILGAMCHECK_HOSTED_VERIFY_ACK=OVERWRITE_DEDICATED_TEST_DATA");
    expect(result.stdout).not.toContain("PASS 계정 A 로그인");
  });
});
