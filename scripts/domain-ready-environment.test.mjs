import { describe, expect, it } from "vitest";

import {
  isSecretChildEnvironmentName,
  snapshotAndSanitizeDomainReadyEnvironment,
} from "./domain-ready-environment.mjs";

describe("domain-ready child environment isolation", () => {
  it("keeps a policy snapshot but removes secrets before any CLI child can inherit them", () => {
    const env = {
      NEXT_PUBLIC_STORAGE_MODE: "hosted",
      NEXT_PUBLIC_OPERATOR_NAME: "일감체크 운영자",
      SUPABASE_AUTH_SITE_URL: "https://preview.example.com",
      SUPABASE_ACCESS_TOKEN: "shell-or-env-file-pat",
      SUPABASE_SERVICE_ROLE_KEY: "sb_secret_server-only",
      VERCEL_TOKEN: "vercel-secret",
      ILGAMCHECK_TEST_A_PASSWORD: "password-a",
      ILGAMCHECK_HOSTED_B_PASSWORD: "password-b",
      DATABASE_URL: "postgresql://private",
      THIRD_PARTY_CLIENT_SECRET: "client-secret",
      NPM_TOKEN: "npm-secret",
      GH_TOKEN: "github-secret",
      AWS_SECRET_ACCESS_KEY: "aws-secret",
      ILGAMCHECK_HOSTED_VERIFY_ACK: "non-secret-ack",
      PATH: "C:\\bin",
      USERPROFILE: "C:\\Users\\tester",
    };

    const policyEnv = snapshotAndSanitizeDomainReadyEnvironment(env);

    expect(policyEnv).toMatchObject({
      SUPABASE_SERVICE_ROLE_KEY: "sb_secret_server-only",
      NEXT_PUBLIC_STORAGE_MODE: "hosted",
    });
    expect(env).toEqual({ PATH: "C:\\bin", USERPROFILE: "C:\\Users\\tester" });
  });

  it("does not classify browser-safe public configuration as a child secret", () => {
    expect(isSecretChildEnvironmentName("NEXT_PUBLIC_SUPABASE_ANON_KEY")).toBe(false);
    expect(isSecretChildEnvironmentName("NEXT_PUBLIC_SUPPORT_EMAIL")).toBe(false);
    expect(isSecretChildEnvironmentName("SUPABASE_SERVICE_ROLE_KEY")).toBe(true);
    expect(isSecretChildEnvironmentName("supabase_service_role_key")).toBe(true);
    expect(isSecretChildEnvironmentName("ILGAMCHECK_HOSTED_A_PASSWORD")).toBe(true);
  });
});
