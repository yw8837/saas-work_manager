import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { releaseGateChildEnvironment, releaseGateSteps } from "./release-gate-policy.mjs";

const npmCli = process.env.npm_execpath;
if (!npmCli || !existsSync(npmCli)) {
  console.error("[release-gate] npm run check:release 로 실행해야 합니다(npm_execpath 누락).");
  process.exit(1);
}

for (const step of releaseGateSteps()) {
  console.log(`[release-gate] START ${step.label}`);
  const env = releaseGateChildEnvironment(process.env, step);
  const result = spawnSync(process.execPath, [npmCli, ...step.args], {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) {
    console.error(`[release-gate] FAIL ${step.label}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[release-gate] FAIL ${step.label}: exit ${result.status ?? 1}`);
    process.exit(result.status ?? 1);
  }
  console.log(`[release-gate] PASS ${step.label}`);
}

console.log("[release-gate] PASS unit/lint/typecheck/audit/local E2E/hosted build 전체 게이트 통과.");
