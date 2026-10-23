import { describe, expect, it } from "vitest";
import { runRecoveryVerificationChecks } from "./supabase-restore-verify-runner.mjs";

const env = {
  ILGAMCHECK_RECOVERY_DEPLOYMENT_URL: "https://recovery.example.com",
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
  ILGAMCHECK_TEST_A_ACCESS_TOKEN: "test-access-a",
  ILGAMCHECK_TEST_A_REFRESH_TOKEN: "test-refresh-a",
  ILGAMCHECK_TEST_B_ACCESS_TOKEN: "test-access-b",
  ILGAMCHECK_TEST_B_REFRESH_TOKEN: "test-refresh-b",
  ILGAMCHECK_TEST_A_EMAIL: "unused@example.com",
  ILGAMCHECK_TEST_A_PASSWORD: "unused-password",
  ILGAMCHECK_HOSTED_VERIFY_ACK: "OVERWRITE_DEDICATED_TEST_DATA",
  SUPABASE_SERVICE_ROLE_KEY: "must-not-pass",
  SUPABASE_ACCESS_TOKEN: "must-not-pass",
};

describe("recovery verification child processes", () => {
  it("checks Sites by default and preserves OAuth sessions only for the hosted check", () => {
    const calls = [];
    const result = runRecoveryVerificationChecks({ env, spawnSyncImpl: (...args) => {
      calls.push(args);
      return { status: 0 };
    } });
    expect(result).toBe(0);
    expect(calls[0][1]).toEqual(["scripts/sites-remote-smoke.mjs", "https://recovery.example.com"]);
    expect(calls[1][1]).toEqual(["scripts/verify-hosted-runtime.mjs"]);
    expect(calls[0][2].env.ILGAMCHECK_TEST_A_ACCESS_TOKEN).toBeUndefined();
    expect(calls[1][2].env).toMatchObject({
      ILGAMCHECK_TEST_A_ACCESS_TOKEN: "test-access-a", ILGAMCHECK_TEST_A_REFRESH_TOKEN: "test-refresh-a",
      ILGAMCHECK_TEST_B_ACCESS_TOKEN: "test-access-b", ILGAMCHECK_TEST_B_REFRESH_TOKEN: "test-refresh-b",
      ILGAMCHECK_HOSTED_VERIFY_ACK: "OVERWRITE_DEDICATED_TEST_DATA", __NEXT_PROCESSED_ENV: "true",
    });
    for (const [, , options] of calls) {
      expect(options.env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
      expect(options.env.SUPABASE_ACCESS_TOKEN).toBeUndefined();
      expect(options.env.ILGAMCHECK_TEST_A_PASSWORD).toBeUndefined();
      expect(options.env.ILGAMCHECK_TEST_A_EMAIL).toBeUndefined();
      expect(options.shell).toBe(false);
    }
  });

  it("keeps the explicitly selected legacy Vercel/password verification usable", () => {
    const calls = [];
    expect(runRecoveryVerificationChecks({ env: { ...env, ILGAMCHECK_RELEASE_PLATFORM: "vercel" },
      spawnSyncImpl: (...args) => { calls.push(args); return { status: 0 }; },
    })).toBe(0);
    expect(calls[0][1][0]).toBe("scripts/remote-smoke.mjs");
    expect(calls[1][2].env.ILGAMCHECK_TEST_A_PASSWORD).toBe("unused-password");
  });

  it.each([{ status: 2 }, { error: new Error("child failed"), status: null }])(
    "stops before destructive hosted verification when smoke fails: %o", (failure) => {
      let calls = 0;
      expect(runRecoveryVerificationChecks({ env, spawnSyncImpl: () => { calls++; return failure; } })).not.toBe(0);
      expect(calls).toBe(1);
    },
  );

  it("rejects an unknown platform before starting any child", () => {
    let called = false;
    expect(() => runRecoveryVerificationChecks({ env: { ...env, ILGAMCHECK_RELEASE_PLATFORM: "unknown" },
      spawnSyncImpl: () => { called = true; return { status: 0 }; },
    })).toThrow(/platform/);
    expect(called).toBe(false);
  });
});
