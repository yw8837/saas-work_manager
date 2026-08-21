import { fixtureOutsideRepo } from "./test-fixtures.mjs";
import { describe, expect, it } from "vitest";
import { evaluateExternalInputReadiness } from "./external-intake-policy.mjs";
import { HOSTED_VERIFY_ACK } from "./verify-hosted-runtime-policy.mjs";

const validEnv = {
  NEXT_PUBLIC_STORAGE_MODE: "hosted",
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_browser_key",
  NEXT_PUBLIC_OPERATOR_NAME: "일감체크 운영자",
  NEXT_PUBLIC_SUPPORT_EMAIL: "support@ilgamcheck.kr",
  NEXT_PUBLIC_BETA_SIGNUP_ENABLED: "false",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_server_key",
  SUPABASE_AUTH_SITE_URL: "https://app.ilgamcheck.kr",
  ILGAMCHECK_FINAL_ORIGIN: "https://app.ilgamcheck.kr",
  ILGAMCHECK_SMTP_FROM_DOMAIN: "mail.ilgamcheck.kr",
  ILGAMCHECK_SMTP_RETURN_PATH_DOMAIN: "bounce.ilgamcheck.kr",
  ILGAMCHECK_SMTP_DMARC_DOMAIN: "ilgamcheck.kr",
  ILGAMCHECK_SMTP_DKIM_SELECTORS: "selector1,selector2",
  ILGAMCHECK_SMTP_EVIDENCE_PATH: fixtureOutsideRepo("EncryptedOps", "smtp-evidence.json"),
  ILGAMCHECK_OPERATIONAL_EVIDENCE_PATH: fixtureOutsideRepo("EncryptedOps", "operational-evidence.json"),
  ILGAMCHECK_TEST_A_EMAIL: "a@example.net",
  ILGAMCHECK_TEST_A_PASSWORD: "password-a",
  ILGAMCHECK_TEST_B_EMAIL: "b@example.org",
  ILGAMCHECK_TEST_B_PASSWORD: "password-b",
};

describe("external input readiness", () => {
  it("reports every missing input at once without echoing secrets", () => {
    const secret = "sb_secret_never_echo_this";
    const result = evaluateExternalInputReadiness({
      env: { SUPABASE_SERVICE_ROLE_KEY: secret },
      state: {},
    });
    expect(result.inputReady).toBe(false);
    expect(result.checks.filter((item) => item.status === "blocked").length).toBeGreaterThan(8);
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(result.manualLocations.map((item) => item.id)).toEqual(expect.arrayContaining([
      "supabase-project",
      "custom-smtp",
      "legal-policy",
      "backup-recovery",
    ]));
  });

  it("passes the input-location gate without claiming remote evidence", () => {
    const result = evaluateExternalInputReadiness({
      env: validEnv,
      shellSupabaseAccessToken: "shell-management-token",
      shellHostedVerificationAcknowledgement: HOSTED_VERIFY_ACK,
      state: {
        supabaseLinked: true,
        vercelLinked: true,
        deploymentReceiptPresent: true,
      },
    });
    expect(result.inputReady).toBe(true);
    expect(result.checks.every((item) => item.status === "pass")).toBe(true);
    expect(result.manualLocations.length).toBeGreaterThan(0);
  });

  it("requires the final Auth origin to equal the custom domain", () => {
    const result = evaluateExternalInputReadiness({
      env: { ...validEnv, SUPABASE_AUTH_SITE_URL: "https://preview.vercel.app" },
      shellSupabaseAccessToken: "shell-management-token",
      shellHostedVerificationAcknowledgement: HOSTED_VERIFY_ACK,
      state: {
        supabaseLinked: true,
        vercelLinked: true,
        deploymentReceiptPresent: true,
      },
    });
    expect(result.checks.find((item) => item.id === "auth-final-origin")?.status).toBe("blocked");
  });

  it("does not accept env-file-only destructive inputs", () => {
    const result = evaluateExternalInputReadiness({
      env: {
        ...validEnv,
        SUPABASE_ACCESS_TOKEN: "from-env-file",
        ILGAMCHECK_HOSTED_VERIFY_ACK: HOSTED_VERIFY_ACK,
      },
      state: {
        supabaseLinked: true,
        vercelLinked: true,
        deploymentReceiptPresent: true,
      },
    });
    expect(result.checks.find((item) => item.id === "supabase-management-token")?.status).toBe("blocked");
    expect(result.checks.find((item) => item.id === "hosted-destructive-ack")?.status).toBe("blocked");
  });
});
