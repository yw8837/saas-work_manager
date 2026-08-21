import nextEnv from "@next/env";
import { collectDeployEnvIssues } from "./deploy-env-policy.mjs";
import { collectRepositoryPreflightIssues } from "./deploy-preflight-policy.mjs";

const { loadEnvConfig } = nextEnv;
const root = process.cwd();
loadEnvConfig(root);

const issues = [
  ...collectDeployEnvIssues(process.env),
  ...collectRepositoryPreflightIssues(root),
];

if (issues.length) {
  for (const issue of issues) console.error(`[deploy-preflight] ${issue}`);
  console.error(`[deploy-preflight] 실패: ${issues.length}개 문제를 고친 뒤 다시 실행하세요.`);
  process.exitCode = 1;
} else {
  console.log("[deploy-preflight] Hosted env·비밀값 경계·Vercel·Supabase migration 계약 확인 완료.");
}
