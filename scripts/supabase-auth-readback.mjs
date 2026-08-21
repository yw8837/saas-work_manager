import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import nextEnv from "@next/env";
import { supabaseAuthReadbackIssue } from "./supabase-auth-readback-policy.mjs";

const { loadEnvConfig } = nextEnv;

export function loadSupabaseAuthReadbackEnvironment({
  root = process.cwd(),
  env = process.env,
  loadEnv = loadEnvConfig,
} = {}) {
  const shellAccessToken = env.SUPABASE_ACCESS_TOKEN;
  loadEnv(root);
  const expectedOrigin = env.SUPABASE_AUTH_SITE_URL;
  delete env.SUPABASE_ACCESS_TOKEN;

  return { shellAccessToken, expectedOrigin };
}

async function main() {
  if (process.argv.includes("--help")) {
    console.log("사용법: 현재 shell에 SUPABASE_ACCESS_TOKEN을 설정한 뒤 실행하세요.");
    console.log("SUPABASE_AUTH_SITE_URL은 .env.local에서 읽습니다.");
    console.log("토큰은 .env.local, Vercel 환경변수, 명령행 인수에 저장하지 마세요. auth_config_read 권한이 필요합니다.");
    return;
  }

  const { shellAccessToken, expectedOrigin } = loadSupabaseAuthReadbackEnvironment();
  let projectRef = "";
  try {
    projectRef = readFileSync(join(process.cwd(), "supabase", ".temp", "project-ref"), "utf8").trim();
  } catch {
    console.error("[supabase-auth-readback] BLOCKED Supabase 연결 정보가 없습니다. 먼저 supabase:link를 실행하세요.");
    process.exitCode = 1;
    return;
  }

  const issue = await supabaseAuthReadbackIssue({
    projectRef,
    expectedOrigin,
    accessToken: shellAccessToken,
  });

  if (issue) {
    console.error(`[supabase-auth-readback] BLOCKED ${issue}`);
    process.exitCode = 1;
  } else {
    console.log("[supabase-auth-readback] PASS 원격 site_url과 폐쇄 베타 가입 차단 설정이 현재값과 일치합니다.");
  }
}

const isDirectExecution = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectExecution) await main();
