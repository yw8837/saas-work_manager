import type { SupabaseClient } from "@supabase/supabase-js";

import {
  PRIVACY_VERSION,
  TERMS_VERSION,
  type PolicyAcceptance,
} from "@/lib/policies";

export async function hasCurrentPolicyAcceptance(client: SupabaseClient): Promise<boolean> {
  const { data, error } = await client
    .from("policy_acceptances")
    .select("accepted_at")
    .eq("terms_version", TERMS_VERSION)
    .eq("privacy_version", PRIVACY_VERSION)
    .maybeSingle();

  if (error) {
    throw new Error(`정책 동의 기록을 확인하지 못했어요: ${error.message}`);
  }

  return Boolean(data);
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
