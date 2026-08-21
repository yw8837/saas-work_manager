import nextEnv from "@next/env";
import { collectDeployEnvIssues } from "./deploy-env-policy.mjs";
import { verifyLinkedSupabaseProject } from "./supabase-project-guard.mjs";
import { verifySupabaseServiceRoleBinding } from "./supabase-service-role-binding.mjs";
import { verifyLinkedVercelProject } from "./vercel-project-guard.mjs";
import {
  captureVercelRuntimeEnvironment,
  vercelEnvApplyAck,
} from "./vercel-env-push-policy.mjs";
import { pushVercelRuntimeEnvironment } from "./vercel-env-push-runner.mjs";

const { loadEnvConfig } = nextEnv;
const shellVercelEnvAcknowledgement = process.env.ILGAMCHECK_VERCEL_ENV_PUSH_ACK;
loadEnvConfig(process.cwd());
delete process.env.ILGAMCHECK_VERCEL_ENV_PUSH_ACK;
if (shellVercelEnvAcknowledgement) {
  process.env.ILGAMCHECK_VERCEL_ENV_PUSH_ACK = shellVercelEnvAcknowledgement;
}

const targetIndex = process.argv.indexOf("--target");
const target = targetIndex >= 0 ? process.argv[targetIndex + 1] : "preview";
if (!["preview", "production"].includes(target)) {
  console.error("[vercel-env] --target preview 또는 --target production만 허용합니다.");
  process.exit(1);
}

const issues = collectDeployEnvIssues(process.env);
if (issues.length) {
  for (const issue of issues) console.error(`[vercel-env] ${issue}`);
  process.exit(1);
}

// Capture once so the exact URL/key pair probed below is also the pair written
// to Vercel after the asynchronous network check.
const runtimeValues = captureVercelRuntimeEnvironment(process.env);

let supabaseProject;
try {
  supabaseProject = verifyLinkedSupabaseProject({
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: runtimeValues.NEXT_PUBLIC_SUPABASE_URL,
    },
  });
} catch (error) {
  console.error(`[vercel-env] Supabase 원격 대상 검증 실패: ${error.message}`);
  process.exit(1);
}

try {
  await verifySupabaseServiceRoleBinding({
    projectUrl: runtimeValues.NEXT_PUBLIC_SUPABASE_URL,
    expectedProjectRef: supabaseProject.projectRef,
    serviceRoleKey: runtimeValues.SUPABASE_SERVICE_ROLE_KEY,
  });
  console.log(`[vercel-env] PASS Supabase ${supabaseProject.projectRef} service-role key/runtime contract 결합`);
} catch (error) {
  console.error(`[vercel-env] Supabase service-role key 결합 검증 실패: ${error.message}`);
  process.exit(1);
}

let vercelProject;
try {
  vercelProject = verifyLinkedVercelProject();
} catch (error) {
  console.error(`[vercel-env] Vercel 원격 대상 검증 실패: ${error.message}`);
  process.exit(1);
}

const requiredAck = vercelEnvApplyAck(target, vercelProject.projectId);
if (process.env.ILGAMCHECK_VERCEL_ENV_PUSH_ACK !== requiredAck) {
  console.error(`[vercel-env] ILGAMCHECK_VERCEL_ENV_PUSH_ACK=${requiredAck} 확인이 필요합니다.`);
  process.exit(1);
}

const pushResult = pushVercelRuntimeEnvironment({
  target,
  vercelProject,
  values: runtimeValues,
  env: process.env,
  onPass: (name) => console.log(`[vercel-env] PASS ${name}`),
});
if (!pushResult.ok) {
  console.error(`[vercel-env] ${pushResult.name} 등록 실패. 이미 반영된 앞 항목은 같은 명령 재실행 시 안전하게 갱신됩니다.`);
  process.exit(pushResult.status);
}

console.log(`[vercel-env] PASS 연결된 Vercel ${target} 환경에 Hosted runtime 7개를 등록했습니다.`);
