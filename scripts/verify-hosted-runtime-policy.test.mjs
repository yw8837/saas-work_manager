import { describe, expect, it } from "vitest";
import * as verificationPolicy from "./verify-hosted-runtime-policy.mjs";

const {
  collectHostedVerificationEnvIssues,
  createHostedVerificationState,
  hostedVerificationCredential,
  HOSTED_VERIFY_ACK,
} = verificationPolicy;

const validEnv = {
  NEXT_PUBLIC_STORAGE_MODE: "hosted",
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_example",
  NEXT_PUBLIC_OPERATOR_NAME: "일감체크 테스트 운영자",
  NEXT_PUBLIC_SUPPORT_EMAIL: "support@ilgamcheck.test",
  NEXT_PUBLIC_BETA_SIGNUP_ENABLED: "true",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_example",
  ILGAMCHECK_TEST_A_EMAIL: "a@example.com",
  ILGAMCHECK_TEST_A_PASSWORD: "password-a",
  ILGAMCHECK_TEST_B_EMAIL: "b@example.com",
  ILGAMCHECK_TEST_B_PASSWORD: "password-b",
  ILGAMCHECK_HOSTED_VERIFY_ACK: HOSTED_VERIFY_ACK,
};

describe("Hosted runtime verification safety", () => {
  it("requires dedicated A/B credentials and explicit overwrite consent", () => {
    expect(collectHostedVerificationEnvIssues(validEnv)).toEqual([]);
    const withoutServiceRole = { ...validEnv };
    delete withoutServiceRole.SUPABASE_SERVICE_ROLE_KEY;
    expect(collectHostedVerificationEnvIssues(withoutServiceRole)).toEqual([]);
    expect(collectHostedVerificationEnvIssues({ ...validEnv, ILGAMCHECK_HOSTED_VERIFY_ACK: "yes" })[0])
      .toContain(HOSTED_VERIFY_ACK);
    expect(collectHostedVerificationEnvIssues({ ...validEnv, ILGAMCHECK_TEST_B_EMAIL: "A@example.com" })[0])
      .toContain("서로 달라야");
    expect(collectHostedVerificationEnvIssues({}).some((issue) => issue.includes("서로 달라야"))).toBe(false);
  });

  it("accepts complete A/B sessions when password login is disabled", () => {
    const sessionEnv = { ...validEnv };
    for (const name of [
      "ILGAMCHECK_TEST_A_EMAIL",
      "ILGAMCHECK_TEST_A_PASSWORD",
      "ILGAMCHECK_TEST_B_EMAIL",
      "ILGAMCHECK_TEST_B_PASSWORD",
    ]) delete sessionEnv[name];
    Object.assign(sessionEnv, {
      ILGAMCHECK_TEST_A_ACCESS_TOKEN: "access-a",
      ILGAMCHECK_TEST_A_REFRESH_TOKEN: "refresh-a",
      ILGAMCHECK_TEST_B_ACCESS_TOKEN: "access-b",
      ILGAMCHECK_TEST_B_REFRESH_TOKEN: "refresh-b",
    });

    expect(collectHostedVerificationEnvIssues(sessionEnv)).toEqual([]);
    expect(hostedVerificationCredential(sessionEnv, "A")).toEqual({
      mode: "session",
      accessToken: "access-a",
      refreshToken: "refresh-a",
    });
  });

  it("rejects an incomplete session instead of silently falling back", () => {
    const incomplete = { ...validEnv };
    delete incomplete.ILGAMCHECK_TEST_A_EMAIL;
    delete incomplete.ILGAMCHECK_TEST_A_PASSWORD;
    incomplete.ILGAMCHECK_TEST_A_ACCESS_TOKEN = "access-a";

    expect(collectHostedVerificationEnvIssues(incomplete)).toContain(
      "ILGAMCHECK_TEST_A는 이메일/비밀번호 또는 access/refresh token 한 쌍이 필요합니다.",
    );

    const refreshOnly = { ...validEnv };
    delete refreshOnly.ILGAMCHECK_TEST_A_EMAIL;
    delete refreshOnly.ILGAMCHECK_TEST_A_PASSWORD;
    refreshOnly.ILGAMCHECK_TEST_A_REFRESH_TOKEN = "refresh-a";
    expect(collectHostedVerificationEnvIssues(refreshOnly)).toContain(
      "ILGAMCHECK_TEST_A는 이메일/비밀번호 또는 access/refresh token 한 쌍이 필요합니다.",
    );
  });

  it("fails closed when any temporary cleanup operation fails", () => {
    expect(() => verificationPolicy.assertVerificationCleanupResults([
      { label: "VERIFYA 코드 삭제", error: null },
      { label: "임시 사용자 삭제", error: { message: "permission denied" } },
    ])).toThrow("임시 사용자 삭제: permission denied");
  });

  it("creates a valid unique 256-bit portal fixture", () => {
    const fixture = createHostedVerificationState(new Date("2026-08-16T00:00:00.000Z"));
    expect(fixture.state.version).toBe(2);
    expect(fixture.state.jobs[0].id).toBe(fixture.jobId);
    expect(fixture.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(fixture.state.jobs[0].revisionPortalEnabled).toBe(true);
  });
});
