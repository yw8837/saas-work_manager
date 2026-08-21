import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import nextEnv from "@next/env";
import { minimalChildEnvironment } from "./minimal-child-environment.mjs";
import { supabaseNpxInvocation } from "./supabase-cli-policy.mjs";
import { verifyLinkedSupabaseProject } from "./supabase-project-guard.mjs";
import { vercelNpxInvocation, verifyLinkedVercelProject } from "./vercel-project-guard.mjs";

const ACTIONS = Object.freeze({
  "supabase-login": { provider: "Supabase", args: ["login"] },
  "supabase-migrations": { provider: "Supabase", args: ["migration", "list"] },
  "vercel-login": { provider: "Vercel", args: ["login"] },
  "vercel-link": { provider: "Vercel", args: ["link"] },
});

export function isolatedCliInvocation(action, platform = process.platform, runtime = {}) {
  const config = ACTIONS[action];
  if (!config) throw new Error("허용된 CLI 작업이 아닙니다.");
  const command = config.provider === "Supabase"
    ? supabaseNpxInvocation(config.args, platform, runtime)
    : vercelNpxInvocation(config.args, platform, runtime);
  return { ...command, provider: config.provider };
}

export function runIsolatedCli({
  action,
  root = process.cwd(),
  env = process.env,
  spawn = spawnSync,
  logger = console,
} = {}) {
  const command = isolatedCliInvocation(action);
  const childEnv = minimalChildEnvironment(env);

  if (action === "supabase-migrations") {
    verifyLinkedSupabaseProject({ root, env, spawn });
  }

  const result = spawn(command.executable, command.args, {
    cwd: root,
    env: childEnv,
    stdio: "inherit",
    shell: false,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${command.provider} CLI 작업이 실패했습니다.`);
  }

  if (action === "vercel-link") {
    const linked = verifyLinkedVercelProject({ root, env, spawn });
    logger.log(`[isolated-cli] Vercel link 검증 완료: ${linked.projectName}`);
  }
  return 0;
}

async function main() {
  const action = process.argv[2];
  if (process.argv.includes("--help") || !action) {
    console.log("사용법: node scripts/isolated-cli.mjs supabase-login|supabase-migrations|vercel-login|vercel-link");
    return;
  }
  const { loadEnvConfig } = nextEnv;
  loadEnvConfig(process.cwd());
  try {
    runIsolatedCli({ action });
  } catch (error) {
    console.error(`[isolated-cli] FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

const isMain = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) await main();
