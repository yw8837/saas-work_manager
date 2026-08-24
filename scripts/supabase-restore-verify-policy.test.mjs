import { describe, expect, it } from "vitest";
import {
  collectRecoveryVerificationIssues,
  recoveryProductionBindingIssue,
  RECOVERY_VERIFY_ACK,
} from "./supabase-restore-verify-policy.mjs";
import { HOSTED_VERIFY_ACK } from "./verify-hosted-runtime-policy.mjs";

const recoveryRef = "abcdefghijklmnopqrst";
const validEnv = {
  NEXT_PUBLIC_STORAGE_MODE: "hosted",
  NEXT_PUBLIC_SUPABASE_URL: `https://${recoveryRef}.supabase.co`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_example",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_example",
  NEXT_PUBLIC_OPERATOR_NAME: "테스트 운영자",
  NEXT_PUBLIC_SUPPORT_EMAIL: "support@example.com",
  NEXT_PUBLIC_BETA_SIGNUP_ENABLED: "true",
  ILGAMCHECK_TEST_A_EMAIL: "recovery-a@example.com",
  ILGAMCHECK_TEST_A_PASSWORD: "password-a",
  ILGAMCHECK_TEST_B_EMAIL: "recovery-b@example.com",
  ILGAMCHECK_TEST_B_PASSWORD: "password-b",
  ILGAMCHECK_HOSTED_VERIFY_ACK: HOSTED_VERIFY_ACK,
  ILGAMCHECK_RECOVERY_PROJECT_REF: recoveryRef,
  ILGAMCHECK_PRODUCTION_PROJECT_REF: "1234567890abcdefghij",
  ILGAMCHECK_RECOVERY_DEPLOYMENT_URL: "https://recovery-preview.vercel.app",
  ILGAMCHECK_RECOVERY_VERIFY_ACK: RECOVERY_VERIFY_ACK,
};

describe("recovery verification safety", () => {
  it("accepts a dedicated recovery project with explicit consent", () => {
    expect(collectRecoveryVerificationIssues(validEnv)).toEqual([]);
  });

  it("blocks production reuse, ref mismatch, and missing acknowledgement", () => {
    const issues = collectRecoveryVerificationIssues({
      ...validEnv,
      NEXT_PUBLIC_SUPABASE_URL: "https://zzzzzzzzzzzzzzzzzzzz.supabase.co",
      ILGAMCHECK_PRODUCTION_PROJECT_REF: recoveryRef,
      ILGAMCHECK_RECOVERY_VERIFY_ACK: "yes",
    });
    expect(issues).toEqual(expect.arrayContaining([
      expect.stringContaining("production project ref"),
      expect.stringContaining("recovery project ref와 다릅니다"),
      expect.stringContaining(RECOVERY_VERIFY_ACK),
    ]));
  });

  it("requires an exact production ref even for dry-run verification", () => {
    const withoutProductionRef = { ...validEnv };
    delete withoutProductionRef.ILGAMCHECK_PRODUCTION_PROJECT_REF;
    expect(collectRecoveryVerificationIssues(withoutProductionRef)).toEqual(expect.arrayContaining([
      expect.stringContaining("ILGAMCHECK_PRODUCTION_PROJECT_REF"),
    ]));
  });

  it("binds recovery verification to the currently linked production project", () => {
    const productionRef = validEnv.ILGAMCHECK_PRODUCTION_PROJECT_REF;
    expect(recoveryProductionBindingIssue({
      linkedProductionRef: productionRef,
      declaredProductionRef: productionRef,
      recoveryRef,
    })).toBeNull();
    expect(recoveryProductionBindingIssue({
      linkedProductionRef: "zzzzzzzzzzzzzzzzzzzz",
      declaredProductionRef: productionRef,
      recoveryRef,
    })).toContain("linked Supabase ref");
    expect(recoveryProductionBindingIssue({
      linkedProductionRef: recoveryRef,
      declaredProductionRef: recoveryRef,
      recoveryRef,
    })).toContain("recovery project ref");
  });
});
