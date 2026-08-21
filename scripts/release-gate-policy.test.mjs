import { describe, expect, it } from "vitest";
import {
  HOSTED_BUILD_CONTRACT_ENV,
  releaseGateChildEnvironment,
  releaseGateSteps,
} from "./release-gate-policy.mjs";

describe("release gate", () => {
  it("keeps local E2E deterministic and leaves a hosted build as the final artifact", () => {
    const steps = releaseGateSteps();
    expect(steps.map((step) => step.label)).toEqual([
      "unit",
      "lint",
      "typecheck",
      "production dependency audit",
      "local production build",
      "local production E2E",
      "hosted fail-closed production build",
    ]);
    expect(steps.find((step) => step.label === "local production E2E")?.storageMode).toBe("local");
    expect(steps[0]?.args).toEqual(["test", "--", "--pool=threads", "--maxWorkers=1", "--testTimeout=15000"]);
    expect(steps.at(-1)?.args).toEqual(["run", "check:deploy"]);
    expect(steps.at(-1)?.env).toEqual(HOSTED_BUILD_CONTRACT_ENV);
    expect(HOSTED_BUILD_CONTRACT_ENV).toEqual({
      NEXT_PUBLIC_STORAGE_MODE: "hosted",
      NEXT_PUBLIC_SUPABASE_URL: "https://ci-contract.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_ci_contract_only",
      NEXT_PUBLIC_OPERATOR_NAME: "CI contract operator",
      NEXT_PUBLIC_SUPPORT_EMAIL: "release-contract@ilgamcheck.test",
      NEXT_PUBLIC_BETA_SIGNUP_ENABLED: "false",
      SUPABASE_SERVICE_ROLE_KEY: "sb_secret_ci_contract_only",
    });
  });

  it("does not pass deployment secrets or test credentials to npm children", () => {
    const step = releaseGateSteps().at(-1);
    const env = releaseGateChildEnvironment({
      PATH: "C:\\bin",
      USERPROFILE: "C:\\Users\\tester",
      SUPABASE_ACCESS_TOKEN: "pat-secret",
      SUPABASE_SERVICE_ROLE_KEY: "real-service-secret",
      VERCEL_TOKEN: "vercel-secret",
      ILGAMCHECK_TEST_A_PASSWORD: "test-password",
      AWS_SECRET_ACCESS_KEY: "aws-secret",
      CI: "true",
    }, step);

    expect(env).toMatchObject({
      PATH: "C:\\bin",
      USERPROFILE: "C:\\Users\\tester",
      CI: "true",
      __NEXT_PROCESSED_ENV: "true",
      ...HOSTED_BUILD_CONTRACT_ENV,
    });
    expect(env.SUPABASE_ACCESS_TOKEN).toBeUndefined();
    expect(env.VERCEL_TOKEN).toBeUndefined();
    expect(env.ILGAMCHECK_TEST_A_PASSWORD).toBeUndefined();
    expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe(HOSTED_BUILD_CONTRACT_ENV.SUPABASE_SERVICE_ROLE_KEY);
  });
});
