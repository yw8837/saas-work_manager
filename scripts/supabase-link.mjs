import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import nextEnv from "@next/env";
import { minimalChildEnvironment } from "./minimal-child-environment.mjs";
import { projectRefIssue, supabaseNpxInvocation } from "./supabase-cli-policy.mjs";
import { verifyLinkedSupabaseProject } from "./supabase-project-guard.mjs";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

if (process.argv.includes("--help")) {
  console.log("사용법: npm run supabase:link -- --project-ref abcdefghijklmnopqrst");
  console.log("먼저 npm run supabase:login 을 실행하세요.");
  process.exit(0);
}

const flagIndex = process.argv.indexOf("--project-ref");
const projectRef = (flagIndex >= 0 ? process.argv[flagIndex + 1] : undefined) ?? process.env.SUPABASE_PROJECT_REF;
const issue = projectRefIssue(projectRef);

if (issue) {
  console.error(`[supabase-link] ${issue}`);
  console.error("[supabase-link] 사용법: npm run supabase:link -- --project-ref abcdefghijklmnopqrst");
  process.exit(1);
}

if (!existsSync(join(process.cwd(), "supabase", "config.toml"))) {
  console.error("[supabase-link] supabase/config.toml이 없습니다.");
  process.exit(1);
}

const command = supabaseNpxInvocation(["link", "--project-ref", projectRef]);
const result = spawnSync(command.executable, command.args, {
  cwd: process.cwd(),
  env: minimalChildEnvironment(process.env),
  stdio: "inherit",
  shell: false,
});
if (result.error) {
  console.error(`[supabase-link] CLI 실행 실패: ${result.error.message}`);
  process.exit(1);
}
if (result.status !== 0) process.exit(result.status ?? 1);
try {
  const linked = verifyLinkedSupabaseProject();
  console.log(`[supabase-link] ${linked.region} 원격 프로젝트 연결 검증 완료. project ref는 Git에서 제외된 supabase/.temp에만 저장됩니다.`);
} catch (error) {
  console.error(`[supabase-link] 연결 후 원격 대상 검증 실패: ${error.message}`);
  process.exit(1);
}
