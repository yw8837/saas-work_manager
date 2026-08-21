import { minimalChildEnvironment } from "./minimal-child-environment.mjs";

export const HOSTED_BUILD_CONTRACT_ENV = Object.freeze({
  NEXT_PUBLIC_STORAGE_MODE: "hosted",
  NEXT_PUBLIC_SUPABASE_URL: "https://ci-contract.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_ci_contract_only",
  NEXT_PUBLIC_OPERATOR_NAME: "CI contract operator",
  NEXT_PUBLIC_SUPPORT_EMAIL: "release-contract@ilgamcheck.test",
  NEXT_PUBLIC_BETA_SIGNUP_ENABLED: "false",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_ci_contract_only",
});

const RELEASE_GATE_SAFE_ENV_NAMES = Object.freeze([
  "CI",
  "PLAYWRIGHT_BROWSERS_PATH",
  "PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD",
  "NEXT_TELEMETRY_DISABLED",
  "FORCE_COLOR",
  "NO_COLOR",
  "TERM",
]);

export function releaseGateChildEnvironment(sourceEnv, step) {
  const env = minimalChildEnvironment(sourceEnv, RELEASE_GATE_SAFE_ENV_NAMES);
  env.__NEXT_PROCESSED_ENV = "true";
  if (step.storageMode) env.NEXT_PUBLIC_STORAGE_MODE = step.storageMode;
  if (step.env) Object.assign(env, step.env);
  return env;
}

export function releaseGateSteps() {
  return [
    { label: "unit", args: ["test", "--", "--pool=threads", "--maxWorkers=1", "--testTimeout=15000"] },
    { label: "lint", args: ["run", "lint"] },
    { label: "typecheck", args: ["run", "typecheck"] },
    { label: "production dependency audit", args: ["run", "audit:prod"] },
    { label: "local production build", args: ["run", "build"], storageMode: "local" },
    { label: "local production E2E", args: ["run", "test:e2e:release"], storageMode: "local" },
    {
      label: "hosted fail-closed production build",
      args: ["run", "check:deploy"],
      env: HOSTED_BUILD_CONTRACT_ENV,
    },
  ];
}
