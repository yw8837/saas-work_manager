import { runRemoteSmoke } from "./remote-smoke-policy.mjs";

if (process.argv.includes("--help")) {
  console.log("사용법: npm run smoke:remote -- https://YOUR_PREVIEW.vercel.app [--require-policy-finalized]");
  console.log("또는 DEPLOYMENT_URL 환경변수에 HTTPS 배포 origin을 지정하세요.");
  process.exit(0);
}

const target = process.argv.slice(2).find((argument) => !argument.startsWith("--")) ?? process.env.DEPLOYMENT_URL;
const requirePolicyFinalized = process.argv.includes("--require-policy-finalized");

try {
  const result = await runRemoteSmoke(target, fetch, { requirePolicyFinalized });
  for (const check of result.checks) console.log(`[remote-smoke] PASS ${check}`);
  console.log(`[remote-smoke] PASS ${result.baseUrl} 공개 배포 기본 계약 확인 완료.`);
} catch (error) {
  console.error(`[remote-smoke] FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
