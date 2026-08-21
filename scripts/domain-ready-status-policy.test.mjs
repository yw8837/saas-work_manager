import { HOSTED_RUNTIME_CONTRACT } from "./verify-hosted-runtime-policy.mjs";
import { describe, expect, it } from "vitest";
import {
  evaluateDomainReadyStatus,
  parseDomainReadyVercelTarget,
} from "./domain-ready-status-policy.mjs";
import { POLICY_BUNDLE_DIGEST } from "./deployment-receipt.mjs";

const ref = "abcdefghijklmnopqrst";
const migrationFingerprint = "a".repeat(64);
const now = new Date("2026-08-17T00:02:00.000Z");
const validEnv = {
  NEXT_PUBLIC_STORAGE_MODE: "hosted",
  NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_browser_key",
  NEXT_PUBLIC_OPERATOR_NAME: "일감체크 운영자",
  NEXT_PUBLIC_SUPPORT_EMAIL: "support@ilgamcheck.kr",
  NEXT_PUBLIC_BETA_SIGNUP_ENABLED: "false",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_server_only",
  SUPABASE_AUTH_SITE_URL: "https://preview-ilgamcheck.vercel.app",
};

function evaluate(overrides = {}) {
  return evaluateDomainReadyStatus({
    envLocalExists: true,
    env: validEnv,
    supabaseProjectRef: ref,
    migrationFingerprint,
    deploymentReceipt: {
      schemaVersion: 1,
      migrations: { projectRef: ref, runtimeContract: HOSTED_RUNTIME_CONTRACT, policyBundleDigest: POLICY_BUNDLE_DIGEST, migrationFingerprint, appliedAt: "2026-08-17T00:00:00.000Z" },
      authConfig: {
        projectRef: ref,
        origin: validEnv.SUPABASE_AUTH_SITE_URL,
        signupDisabled: true,
        pushedAt: "2026-08-17T00:01:00.000Z",
      },
    },
    supabaseRemoteIssue: null,
    runtimeContractRemoteIssue: null,
    authConfigRemoteIssue: null,
    vercelIdentity: {
      projectId: "prj_123",
      orgId: "team_123",
      deploymentId: "dpl_123",
    },
    vercelDeploymentIssue: null,
    now,
    ...overrides,
  });
}

describe("domain-ready status policy", () => {
  it("passes automated linkage without claiming manual external gates", () => {
    const result = evaluate();
    expect(result.automatedReady).toBe(true);
    expect(result.checks.every((item) => item.status === "pass")).toBe(true);
    expect(result.manualGates).toEqual(expect.arrayContaining([
      expect.stringContaining("SMTP"),
      expect.stringContaining("A/B"),
      expect.stringContaining("백업"),
    ]));
  });

  it("fails closed when local env and cloud links are absent", () => {
    const result = evaluate({
      envLocalExists: false,
      env: {},
      supabaseProjectRef: "",
      supabaseRemoteIssue: "Supabase 연결 정보가 없습니다.",
      runtimeContractRemoteIssue: "Preview health를 확인할 수 없습니다.",
      authConfigRemoteIssue: "Auth config를 확인할 수 없습니다.",
      vercelIdentity: null,
      vercelDeploymentIssue: "Vercel 연결 정보가 없습니다.",
    });
    expect(result.automatedReady).toBe(false);
    expect(result.checks.filter((item) => item.status === "blocked")).toHaveLength(10);
  });

  it("does not pass before migration and Auth config push receipts exist", () => {
    const result = evaluate({ deploymentReceipt: null });
    expect(result.automatedReady).toBe(false);
    expect(result.checks.find((item) => item.id === "migration-apply")?.status).toBe("blocked");
    expect(result.checks.find((item) => item.id === "auth-config-apply")?.status).toBe("blocked");
  });

  it("fails when the Auth origin is not a deployment of the linked Vercel project", () => {
    const result = evaluate({ vercelDeploymentIssue: "다른 project입니다." });
    expect(result.automatedReady).toBe(false);
    expect(result.checks.find((item) => item.id === "vercel-deployment")?.status).toBe("blocked");
  });

  it("never treats an absent captured deployment identity as a valid Vercel link", () => {
    const result = evaluate({ vercelIdentity: null, vercelDeploymentIssue: null });
    expect(result.automatedReady).toBe(false);
    expect(result.checks.find((item) => item.id === "vercel-link")?.status).toBe("blocked");
    expect(result.checks.find((item) => item.id === "vercel-deployment")?.status).toBe("blocked");
  });

  it("accepts only the non-overridable production target option used by the final gate", () => {
    expect(parseDomainReadyVercelTarget([])).toBeUndefined();
    expect(parseDomainReadyVercelTarget(["--json", "--expected-vercel-target=production"])).toBe("production");
    expect(() => parseDomainReadyVercelTarget(["--expected-vercel-target=preview"])).toThrow(/production/);
    expect(() => parseDomainReadyVercelTarget([
      "--expected-vercel-target=production",
      "--expected-vercel-target=production",
    ])).toThrow(/production/);
  });

  it("does not treat local receipts as current remote DB/Auth proof", () => {
    const result = evaluate({
      runtimeContractRemoteIssue: "health 조회 실패",
      authConfigRemoteIssue: "Management API 조회 실패",
    });
    expect(result.automatedReady).toBe(false);
    expect(result.checks.find((item) => item.id === "runtime-contract-current")?.status).toBe("blocked");
    expect(result.checks.find((item) => item.id === "auth-config-current")?.status).toBe("blocked");
  });

  it("rejects structurally incomplete local receipts before remote checks", () => {
    const result = evaluate({
      deploymentReceipt: {
        migrations: { projectRef: ref, runtimeContract: HOSTED_RUNTIME_CONTRACT },
        authConfig: { projectRef: ref, origin: validEnv.SUPABASE_AUTH_SITE_URL, signupDisabled: true },
      },
    });
    expect(result.checks.find((item) => item.id === "migration-apply")?.status).toBe("blocked");
    expect(result.checks.find((item) => item.id === "auth-config-apply")?.status).toBe("blocked");
  });

  it("fails when the logged-in account cannot prove the Seoul project", () => {
    const result = evaluate({ supabaseRemoteIssue: "Seoul region이 아닙니다." });
    expect(result.automatedReady).toBe(false);
    expect(result.checks.find((item) => item.id === "supabase-remote")?.status).toBe("blocked");
  });

  it("rejects a Supabase ref and project URL mismatch", () => {
    const result = evaluate({ supabaseProjectRef: "12345678901234567890" });
    expect(result.automatedReady).toBe(false);
    expect(result.checks.find((item) => item.id === "supabase-link")?.message).toMatch(/서로 다릅니다/);
  });

  it("rejects bootstrap and documentation-only Auth origins", () => {
    for (const siteUrl of [
      "https://bootstrap.invalid",
      "https://preview.example.com",
      "https://YOUR_PREVIEW_OR_DOMAIN",
      "https://preview.test",
    ]) {
      const result = evaluate({ env: { ...validEnv, SUPABASE_AUTH_SITE_URL: siteUrl } });
      expect(result.checks.find((item) => item.id === "auth-origin")?.status).toBe("blocked");
    }
  });

  it("does not echo secret values in status messages", () => {
    const secret = "sb_secret_should_never_be_printed";
    const result = evaluate({ env: { ...validEnv, SUPABASE_SERVICE_ROLE_KEY: secret } });
    expect(JSON.stringify(result)).not.toContain(secret);
  });
});
