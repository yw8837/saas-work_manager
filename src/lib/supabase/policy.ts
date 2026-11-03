import type { SupabaseClient } from "@supabase/supabase-js";

import {
  PRIVACY_VERSION,
  TERMS_VERSION,
  type PolicyAcceptance,
} from "@/lib/policies";

/** current: 지금 버전에 동의함 / outdated: 예전 버전에만 동의함(약관이 바뀜) / none: 동의 기록 없음(처음 가입) */
export type PolicyAcceptanceState = "current" | "outdated" | "none";

export async function readPolicyAcceptanceState(client: SupabaseClient): Promise<PolicyAcceptanceState> {
  // 같은 테이블·같은 select 권한이다. RLS(policy_acceptances_owner_select)가 본인 행만 돌려준다.
  const { data, error } = await client
    .from("policy_acceptances")
    .select("terms_version, privacy_version");

  if (error) {
    throw new Error(`정책 동의 기록을 확인하지 못했어요: ${error.message}`);
  }

  const rows = (data ?? []) as Array<{ terms_version: string; privacy_version: string }>;
  if (rows.some((row) => row.terms_version === TERMS_VERSION && row.privacy_version === PRIVACY_VERSION)) {
    return "current";
  }
  return rows.length > 0 ? "outdated" : "none";
}

export async function recordCurrentPolicyAcceptance(
  client: SupabaseClient,
  acceptance: PolicyAcceptance,
): Promise<void> {
  if (
    acceptance.termsVersion !== TERMS_VERSION
    || acceptance.privacyVersion !== PRIVACY_VERSION
  ) {
    throw new Error("최신 약관과 개인정보처리방침을 다시 확인해주세요.");
  }

  const { error } = await client.rpc("accept_current_policies", {
    p_terms_version: acceptance.termsVersion,
    p_privacy_version: acceptance.privacyVersion,
  });

  if (error) {
    throw new Error(`정책 동의 기록을 저장하지 못했어요: ${error.message}`);
  }
}
