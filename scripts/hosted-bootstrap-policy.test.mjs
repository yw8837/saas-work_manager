import { describe, expect, it } from "vitest";
import {
  hostedBootstrapChildEnvironment,
  nextHostedBootstrapAction,
} from "./hosted-bootstrap-policy.mjs";

function result(blockedIds) {
  const all = ["hosted-env", "supabase-link", "supabase-remote", "migration-apply", "vercel-link", "auth-origin", "vercel-deployment", "runtime-contract-current", "auth-config-apply", "auth-config-current"];
  return {
    automatedReady: blockedIds.length === 0,
    checks: all.map((id) => ({ id, status: blockedIds.includes(id) ? "blocked" : "pass" })),
  };
}

describe("Hosted resumable bootstrap", () => {
  it("guides environment, Supabase, Vercel, and Preview in dependency order", () => {
    expect(nextHostedBootstrapAction(result(["hosted-env", "supabase-link"]))).toMatch(/\.env\.local/);
    expect(nextHostedBootstrapAction(result(["supabase-link", "vercel-link"]))).toMatch(/Supabase Seoul/);
    expect(nextHostedBootstrapAction(result(["migration-apply", "vercel-link"]))).toMatch(/supabase:push/);
    expect(nextHostedBootstrapAction(result(["vercel-link"]))).toMatch(/vercel:link/);
    expect(nextHostedBootstrapAction(result(["auth-origin"]))).toMatch(/READY Preview/);
    expect(nextHostedBootstrapAction(result(["runtime-contract-current"]))).toMatch(/api\/health/);
    expect(nextHostedBootstrapAction(result(["auth-config-apply"]))).toMatch(/supabase:config:push/);
    expect(nextHostedBootstrapAction(result(["auth-config-current"]))).toMatch(/SUPABASE_ACCESS_TOKEN/);
  });

  it("never claims external manual gates are complete", () => {
    expect(nextHostedBootstrapAction(result([]))).toMatch(/check:external-inputs/);
  });

  it("passes only the shell PAT to domain-ready and strips unrelated secrets", () => {
    const env = {
      PATH: "C:\\safe-bin",
      SUPABASE_ACCESS_TOKEN: "shell-pat",
      SUPABASE_SERVICE_ROLE_KEY: "server-secret",
      VERCEL_TOKEN: "vercel-secret",
      ILGAMCHECK_TEST_A_PASSWORD: "a-secret",
    };
    const statusEnv = hostedBootstrapChildEnvironment(env, { includeSupabaseAccessToken: true });
    expect(statusEnv.SUPABASE_ACCESS_TOKEN).toBe("shell-pat");
    expect(statusEnv).not.toHaveProperty("SUPABASE_SERVICE_ROLE_KEY");
    expect(statusEnv).not.toHaveProperty("VERCEL_TOKEN");
    expect(statusEnv).not.toHaveProperty("ILGAMCHECK_TEST_A_PASSWORD");
    expect(hostedBootstrapChildEnvironment(env)).not.toHaveProperty("SUPABASE_ACCESS_TOKEN");
  });
});
