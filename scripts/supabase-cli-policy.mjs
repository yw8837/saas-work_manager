import { pinnedNpxInvocation } from "./pinned-npx.mjs";

export const SUPABASE_CLI_VERSION = "2.114.0";

export function projectRefIssue(rawRef) {
  const projectRef = rawRef?.trim();
  if (!projectRef) return "Supabase project ref가 없습니다.";
  if (!/^[a-z0-9]{20}$/.test(projectRef)) {
    return "project ref는 Dashboard URL에 표시되는 영문 소문자·숫자 20자리여야 합니다.";
  }
  return null;
}

export function supabaseNpxInvocation(commandArgs, platform = process.platform, runtime = {}) {
  return pinnedNpxInvocation(`supabase@${SUPABASE_CLI_VERSION}`, commandArgs, platform, runtime);
}
