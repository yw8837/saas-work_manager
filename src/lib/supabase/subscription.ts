import type { SupabaseClient } from "@supabase/supabase-js";

import type { Plan } from "@/lib/domain";

/**
 * 서버가 알고 있는 구독 상태.
 * 브라우저 상태는 화면을 빨리 그리기 위한 것이고, 실제 권한의 근거는 이쪽이다.
 */
export type HostedSubscription = {
  plan: Plan;
  trialEndsAt: string | null;
  betaEndsAt: string | null;
  currentPeriodEnd: string | null;
};

function asPlan(value: unknown): Plan {
  return value === "solo" || value === "pro" ? value : "free";
}

function asIsoOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/**
 * 내 구독 행을 읽는다. RLS가 owner_id = auth.uid()로 제한하므로 남의 것은 보이지 않는다.
 * 행이 없으면 무료다 — 아직 아무 권한도 받지 않은 상태다.
 */
export async function loadHostedSubscription(
  client: SupabaseClient,
  ownerId: string,
): Promise<HostedSubscription> {
  const { data, error } = await client
    .from("subscriptions")
    .select("plan, trial_ends_at, beta_ends_at, current_period_end")
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (error) {
    throw new Error(`구독 상태를 불러오지 못했어요: ${error.message}`);
  }
  if (!data) {
    return { plan: "free", trialEndsAt: null, betaEndsAt: null, currentPeriodEnd: null };
  }

  return {
    plan: asPlan(data.plan),
    trialEndsAt: asIsoOrNull(data.trial_ends_at),
    betaEndsAt: asIsoOrNull(data.beta_ends_at),
    currentPeriodEnd: asIsoOrNull(data.current_period_end),
  };
}

export type InviteRedeemStatus = "ok" | "invalid" | "already_redeemed" | "rate_limited";

export type InviteRedeemResult = {
  status: InviteRedeemStatus;
  /** 성공했을 때만 채워진다. */
  endsAt: string | null;
};

function asStatus(value: unknown): InviteRedeemStatus {
  return value === "ok" || value === "already_redeemed" || value === "rate_limited"
    ? value
    : "invalid";
}

/**
 * 서버가 코드를 검증하고 구독에 기간을 적어준다.
 * 사용자 입력 오류는 예외가 아니라 status로 온다 — 서버가 시도 기록을 남겨야 하기 때문이다.
 * 연결 실패 같은 진짜 오류만 throw한다.
 */
export async function redeemHostedInviteCode(
  client: SupabaseClient,
  code: string,
): Promise<InviteRedeemResult> {
  const { data, error } = await client.rpc("redeem_invite_code", { p_code: code });

  if (error) {
    throw new Error(`초대 코드를 확인하지 못했어요: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") {
    return { status: "invalid", endsAt: null };
  }

  const record = row as { status?: unknown; ends_at?: unknown };
  return { status: asStatus(record.status), endsAt: asIsoOrNull(record.ends_at) };
}
