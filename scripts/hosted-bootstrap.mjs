import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import {
  hostedBootstrapChildEnvironment,
  nextHostedBootstrapAction,
} from "./hosted-bootstrap-policy.mjs";

const root = process.cwd();
const envPath = join(root, ".env.local");

function runNode(script, args = [], { includeSupabaseAccessToken = false } = {}) {
  return spawnSync(process.execPath, [join(root, "scripts", script), ...args], {
    cwd: root,
    encoding: "utf8",
    env: hostedBootstrapChildEnvironment(process.env, { includeSupabaseAccessToken }),
    shell: false,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });
}

if (!existsSync(envPath)) {
  const init = runNode("init-hosted-env.mjs");
  if (init.stdout) process.stdout.write(init.stdout);
  if (init.stderr) process.stderr.write(init.stderr);
  if (init.error || init.status !== 0) process.exit(init.status ?? 1);
  console.log("[hosted-bootstrap] NEXT .env.local의 placeholder를 실제 값으로 바꾼 뒤 같은 명령을 다시 실행하세요.");
  process.exit(1);
}

const status = runNode("domain-ready-status.mjs", ["--json"], { includeSupabaseAccessToken: true });
let result;
try {
  result = JSON.parse(status.stdout ?? "");
} catch {
  console.error("[hosted-bootstrap] 상태 JSON을 읽지 못했습니다. npm run status:domain-ready를 직접 실행하세요.");
  process.exit(1);
}

for (const item of result.checks) {
  console.log(`[hosted-bootstrap] ${item.status === "pass" ? "PASS" : "BLOCKED"} ${item.id}: ${item.message}`);
}
console.log(`[hosted-bootstrap] NEXT ${nextHostedBootstrapAction(result)}`);
if (!result.automatedReady) process.exit(1);
