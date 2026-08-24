import { describe, expect, it } from "vitest";
import {
  browserSafeSupabaseKeyIssue,
  collectDeployEnvIssues,
  publicOperatorNameIssue,
  publicSupportEmailIssue,
  serverSupabaseAdminKeyIssue,
  supabaseProjectUrlIssue,
} from "./deploy-env-policy.mjs";

const jwt = (payload) => `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;

describe("browserSafeSupabaseKeyIssue", () => {
  it("accepts browser-safe publishable and legacy anon keys", () => {
    expect(browserSafeSupabaseKeyIssue("sb_publishable_example")).toBeNull();
    expect(browserSafeSupabaseKeyIssue(jwt({ role: "anon" }))).toBeNull();
  });

  it("rejects Supabase secret and service-role keys", () => {
    expect(browserSafeSupabaseKeyIssue("sb_secret_example")).toMatch(/secret key/);
    expect(browserSafeSupabaseKeyIssue(jwt({ role: "service_role" }))).toMatch(/service_role/);
  });

  it("fails closed for unknown public-key shapes", () => {
    expect(browserSafeSupabaseKeyIssue("PUBLIC_ANON_KEY")).toMatch(/형식/);
    expect(browserSafeSupabaseKeyIssue(jwt({ role: "authenticated" }))).toMatch(/anon JWT/);
  });

  it("accepts only a server-side Supabase admin key", () => {
    expect(serverSupabaseAdminKeyIssue("sb_secret_example")).toBeNull();
    expect(serverSupabaseAdminKeyIssue(jwt({ role: "service_role" }))).toBeNull();
    expect(serverSupabaseAdminKeyIssue("sb_publishable_example")).toMatch(/secret key/);
    expect(serverSupabaseAdminKeyIssue(jwt({ role: "anon" }))).toMatch(/service_role/);
  });

  it("accepts only the project origin URL", () => {
    expect(supabaseProjectUrlIssue("https://abcdefghijklmnopqrst.supabase.co")).toBeNull();
    expect(supabaseProjectUrlIssue("http://abcdefghijklmnopqrst.supabase.co")).toMatch(/HTTPS/);
    expect(supabaseProjectUrlIssue("https://example.com")).toMatch(/supabase\.co/);
    expect(supabaseProjectUrlIssue("https://abcdefghijklmnopqrst.supabase.co/rest/v1")).toMatch(/origin/);
  });

  it("requires hosted values and rejects any public secret-shaped variable", () => {
    const valid = {
      NEXT_PUBLIC_STORAGE_MODE: "hosted",
      NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_example",
      NEXT_PUBLIC_OPERATOR_NAME: "일감체크 테스트 운영자",
      NEXT_PUBLIC_SUPPORT_EMAIL: "support@ilgamcheck.test",
      NEXT_PUBLIC_BETA_SIGNUP_ENABLED: "true",
      SUPABASE_SERVICE_ROLE_KEY: "sb_secret_example",
    };
    expect(collectDeployEnvIssues(valid)).toEqual([]);
    expect(collectDeployEnvIssues({ ...valid, NEXT_PUBLIC_INTERNAL_SECRET: "hello" })).toEqual([
      expect.stringContaining("NEXT_PUBLIC_INTERNAL_SECRET"),
    ]);
    expect(collectDeployEnvIssues({ ...valid, NEXT_PUBLIC_LEAK: "sb_secret_example" })).toEqual([
      expect.stringContaining("secret key"),
    ]);
    expect(collectDeployEnvIssues({ ...valid, NEXT_PUBLIC_OPERATOR_NAME: "" }))
      .toEqual(expect.arrayContaining([expect.stringContaining("NEXT_PUBLIC_OPERATOR_NAME")]));
    expect(collectDeployEnvIssues({ ...valid, NEXT_PUBLIC_SUPPORT_EMAIL: "not-an-email" }))
      .toEqual(expect.arrayContaining([expect.stringContaining("지원 이메일")]));
    expect(collectDeployEnvIssues({ ...valid, NEXT_PUBLIC_BETA_SIGNUP_ENABLED: "false" }))
      .toEqual(expect.arrayContaining([expect.stringContaining("신규 가입")]));
  });

  it("rejects public operator/support placeholders", () => {
    expect(publicOperatorNameIssue("PUBLIC_LEGAL_OR_BUSINESS_OPERATOR_NAME")).toMatch(/placeholder/);
    expect(publicSupportEmailIssue("support@YOUR_DOMAIN")).toMatch(/placeholder/);
  });
});
