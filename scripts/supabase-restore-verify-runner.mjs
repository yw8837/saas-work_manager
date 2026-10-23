import { spawnSync } from "node:child_process";
import { minimalChildEnvironment } from "./minimal-child-environment.mjs";
import { VERCEL_PUBLIC_RUNTIME_ENV_NAMES } from "./vercel-env-push-policy.mjs";

export function runRecoveryVerificationChecks({ env, root = process.cwd(), spawnSyncImpl = spawnSync }) {
  const platform = env.ILGAMCHECK_RELEASE_PLATFORM ?? "sites";
  if (!["sites", "vercel"].includes(platform)) throw new Error("지원하지 않는 release platform입니다.");
  const steps = [
    { args: [platform === "sites" ? "scripts/sites-remote-smoke.mjs" : "scripts/remote-smoke.mjs", env.ILGAMCHECK_RECOVERY_DEPLOYMENT_URL], envNames: [] },
    { args: ["scripts/verify-hosted-runtime.mjs"], envNames: [
      ...VERCEL_PUBLIC_RUNTIME_ENV_NAMES,
      "ILGAMCHECK_TEST_A_EMAIL", "ILGAMCHECK_TEST_A_PASSWORD",
      "ILGAMCHECK_TEST_B_EMAIL", "ILGAMCHECK_TEST_B_PASSWORD", "ILGAMCHECK_HOSTED_VERIFY_ACK",
      "ILGAMCHECK_TEST_A_ACCESS_TOKEN", "ILGAMCHECK_TEST_A_REFRESH_TOKEN",
      "ILGAMCHECK_TEST_B_ACCESS_TOKEN", "ILGAMCHECK_TEST_B_REFRESH_TOKEN",
    ].filter((name) => platform !== "sites" || !/^ILGAMCHECK_TEST_[AB]_(EMAIL|PASSWORD)$/.test(name)) },
  ];
  for (const step of steps) {
    const childEnv = minimalChildEnvironment(env, step.envNames);
    childEnv.__NEXT_PROCESSED_ENV = "true";
    const result = spawnSyncImpl(process.execPath, step.args, { cwd: root, env: childEnv, stdio: "inherit", shell: false });
    if (result.error || result.status !== 0) return result.status || 1;
  }
  return 0;
}
