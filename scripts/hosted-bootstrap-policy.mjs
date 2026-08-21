import { minimalChildEnvironment } from "./minimal-child-environment.mjs";

export function hostedBootstrapChildEnvironment(env, { includeSupabaseAccessToken = false } = {}) {
  return minimalChildEnvironment(
    env,
    includeSupabaseAccessToken ? ["SUPABASE_ACCESS_TOKEN"] : [],
  );
}

export function nextHostedBootstrapAction(result) {
  if (!result || !Array.isArray(result.checks)) {
    return "상태 JSON을 읽을 수 없습니다. npm run status:domain-ready를 직접 실행하세요.";
  }
  if (result.automatedReady) {
    return "자동 연결 상태 PASS. npm run check:external-inputs -- --json으로 도메인·A/B·SMTP·운영 evidence 입력을 한 번에 점검하세요.";
  }
  const blocked = new Set(result.checks.filter((item) => item.status !== "pass").map((item) => item.id));
  if (blocked.has("hosted-env")) {
    return ".env.local의 실제 Supabase URL·browser key·server key·운영자명·지원메일을 채우세요.";
  }
  if (blocked.has("supabase-link") || blocked.has("supabase-remote")) {
    return "Supabase Seoul 프로젝트를 만든 뒤 supabase:login과 supabase:link를 실행하세요. 프로젝트 생성·DB 비밀번호는 사람 승인 단계입니다.";
  }
  if (blocked.has("migration-apply")) {
    return "ref 결합 승인값으로 supabase:push를 실행하고 원격 migration 목록을 확인하세요.";
  }
  if (blocked.has("vercel-link")) {
    return "vercel:login과 vercel:link를 실행한 뒤 project ID 결합 승인값으로 Preview env를 등록하세요.";
  }
  if (blocked.has("auth-origin") || blocked.has("vercel-deployment")) {
    return "Preview env를 등록하고 첫 READY Preview를 만든 뒤 SUPABASE_AUTH_SITE_URL을 그 origin으로 바꾸세요.";
  }
  if (blocked.has("runtime-contract-current")) {
    return "현재 Auth origin의 /api/health를 확인하세요. 최신 DB runtime contract가 감지되지 않으면 migration 적용과 Preview env를 다시 점검하세요.";
  }
  if (blocked.has("auth-config-apply")) {
    return "ref 결합 승인값으로 supabase:config:push를 실행하고 Dashboard의 Site URL·가입 OFF를 교차 확인하세요.";
  }
  if (blocked.has("auth-config-current")) {
    return "auth_config_read 권한의 SUPABASE_ACCESS_TOKEN을 현재 셸에만 넣고 status:domain-ready로 Site URL·가입 OFF를 원격 재확인하세요.";
  }
  return "docs/DEPLOYMENT.md의 현재 BLOCKED 단계와 status:domain-ready 출력을 확인하세요.";
}
