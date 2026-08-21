import nextEnv from "@next/env";
import { collectDeployEnvIssues } from "./deploy-env-policy.mjs";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const issues = collectDeployEnvIssues(process.env);
for (const issue of issues) console.error(`[deploy-check] ${issue}`);
if (issues.length) process.exitCode = 1;

if (!issues.length) {
  console.log("[deploy-check] Hosted 공개 환경값과 브라우저용 Supabase key 형식 확인 완료.");
}
