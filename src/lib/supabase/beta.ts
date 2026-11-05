import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  BetaConcurrentJobs,
  BetaOrderChannel,
  BetaParticipation,
  BetaWorkType,
} from "@/lib/beta/apply-copy";
import type { BetaAdStatus, BetaNoticeKind } from "@/lib/beta/rules";

/** 베타 신청·광고 동의 RPC. 표는 직접 읽지 않고 migration 20261104010000의 함수만 부른다. */

export type BetaApplicationInput = {
  email: string;
  workType: BetaWorkType;
  sellsPackages: boolean;
  concurrentJobs: BetaConcurrentJobs;
  orderChannels: BetaOrderChannel[];
  participation: BetaParticipation;
  privacyConsent: boolean;
  adConsent: boolean;
  copyVersion: string;
};

export type BetaApplicationReceipt =
  | { status: "received"; adEvent: { kind: "consent"; at: string; dueAt: string } | null }
  | { status: "rate_limited" };

function firstRow<T>(data: unknown): T | null {
  return Array.isArray(data) ? (data[0] as T | undefined) ?? null : (data as T | null);
}

export async function submitBetaApplication(
  client: SupabaseClient,
  input: BetaApplicationInput,
): Promise<BetaApplicationReceipt> {
  const { data, error } = await client.rpc("submit_beta_application", {
    p_email: input.email,
    p_work_type: input.workType,
    p_sells_packages: input.sellsPackages,
    p_concurrent_jobs: input.concurrentJobs,
    p_order_channels: input.orderChannels,
    p_participation: input.participation,
    p_privacy_consent: input.privacyConsent,
    p_ad_consent: input.adConsent,
    p_copy_version: input.copyVersion,
  });
  if (error) {
    if (error.message?.includes("privacy_consent_required")) throw new Error("개인정보 수집·이용에 동의해야 신청할 수 있어요.");
    if (error.message?.includes("invalid_beta_application")) throw new Error("입력한 내용을 다시 확인해 주세요.");
    throw new Error("신청을 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
  }
  const row = firstRow<{ status: string; ad_event_kind: string | null; ad_event_at: string | null; ad_notice_due_at: string | null }>(data);
  if (!row) throw new Error("신청을 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
  if (row.status === "rate_limited") return { status: "rate_limited" };
  return {
    status: "received",
    adEvent: row.ad_event_kind === "consent" && row.ad_event_at && row.ad_notice_due_at
      ? { kind: "consent", at: row.ad_event_at, dueAt: row.ad_notice_due_at }
      : null,
  };
}

export type BetaConfirmResult = {
  status: "confirmed" | "already_confirmed" | "expired" | "invalid" | "rate_limited";
  /** 이 주소의 광고 수신 동의가 지금 유효한지(주소 전체 이력 기준, 발송 대상 판정과 같다). 이 신청 건만의 상태가 아니다. */
  adActive: boolean;
};

export async function confirmBetaEmail(client: SupabaseClient, token: string): Promise<BetaConfirmResult> {
  const { data, error } = await client.rpc("confirm_beta_email", { p_token: token });
  if (error) throw new Error("확인을 처리하지 못했어요.");
  const row = firstRow<{ status: BetaConfirmResult["status"]; ad_active: boolean }>(data);
  if (!row) throw new Error("확인을 처리하지 못했어요.");
  return { status: row.status, adActive: Boolean(row.ad_active) };
}

export type BetaUnsubscribeResult = {
  status: "withdrawn" | "refused" | "already" | "invalid" | "rate_limited";
  eventKind: "refuse" | "withdraw" | null;
  eventAt: string | null;
  /**
   * 처리결과 통지 상태.
   * - email_pending: 메일로 보낼 예정(새 의사표시) 또는 아직 보내지 않음(다시 누른 링크)
   * - emailed: 이미 메일로 보냄(다시 누른 링크)
   * - screen_only: 주소가 이미 정리돼 화면 통지만 함
   */
  noticeState: "email_pending" | "emailed" | "screen_only" | null;
};

export async function unsubscribeBetaAds(client: SupabaseClient, token: string): Promise<BetaUnsubscribeResult> {
  const { data, error } = await client.rpc("unsubscribe_beta_ads", { p_token: token });
  if (error) throw new Error("수신거부를 처리하지 못했어요.");
  const row = firstRow<{
    status: BetaUnsubscribeResult["status"]; event_kind: BetaUnsubscribeResult["eventKind"]; event_at: string | null;
    notice_state: BetaUnsubscribeResult["noticeState"];
  }>(data);
  if (!row) throw new Error("수신거부를 처리하지 못했어요.");
  return { status: row.status, eventKind: row.event_kind, eventAt: row.event_at, noticeState: row.notice_state ?? null };
}

export type BetaOpsApplication = {
  id: string;
  email: string;
  workType: BetaWorkType;
  sellsPackages: boolean;
  concurrentJobs: BetaConcurrentJobs;
  orderChannels: BetaOrderChannel[];
  participation: BetaParticipation;
  eligible: boolean;
  adChecked: boolean;
  createdAt: string;
  confirmExpiresAt: string;
  emailConfirmedAt: string | null;
  outcome: "not_matched" | "not_selected" | "interview" | "beta" | null;
  resultSentAt: string | null;
  interviewDoneAt: string | null;
  betaEndedAt: string | null;
  purgeAfter: string | null;
  adStatus: BetaAdStatus;
  suppressed: boolean;
  adTarget: boolean;
  confirmToken: string | null;
  unsubscribeToken: string | null;
};

export type BetaOpsNotice = {
  eventId: string;
  kind: BetaNoticeKind;
  source: "apply_form" | "unsubscribe_link" | "deletion_request";
  occurredAt: string;
  confirmedAt: string | null;
  noticeShownAt: string | null;
  noticeDueAt: string;
  noticeEmailedAt: string | null;
  applicationId: string | null;
  /** 통지를 보낼 주소. 신청이 삭제 요청으로 지워졌어도 삭제 결과 안내를 끝낼 때까지는 남아 있다. */
  recipientEmail: string | null;
  /** 의사표시 때 주소가 이미 정리돼 이메일로 통지할 수 없었고 화면 통지만 한 건. */
  emailUnavailable: boolean;
};

export type BetaOpsDeletion = {
  id: string;
  /** 삭제 결과 안내를 보냈다고 표시하면 지워진다(null). */
  email: string | null;
  requestedAt: string;
  deletedCount: number;
  resultEmailedAt: string | null;
  pendingNotices: number;
};

export class BetaNotOperatorError extends Error {
  constructor() {
    super("운영자 계정이 아닙니다.");
    this.name = "BetaNotOperatorError";
  }
}

export class BetaNoticesPendingError extends Error {
  constructor() {
    super("같은 주소의 처리결과 통지를 먼저 보내고 '통지 보냄 표시'를 남겨 주세요.");
    this.name = "BetaNoticesPendingError";
  }
}

function opsError(error: { message?: string; code?: string }): Error {
  if (error.code === "42501" || error.message?.includes("not_operator") || error.message?.includes("permission denied")) {
    return new BetaNotOperatorError();
  }
  if (error.message?.includes("notices_pending")) return new BetaNoticesPendingError();
  return new Error("운영 기록을 처리하지 못했어요.");
}

type ApplicationRow = {
  id: string; email: string; work_type: BetaWorkType; sells_packages: boolean; concurrent_jobs: BetaConcurrentJobs;
  order_channels: BetaOrderChannel[] | null; participation: BetaParticipation; eligible: boolean; ad_checked: boolean;
  created_at: string; confirm_expires_at: string; email_confirmed_at: string | null; outcome: BetaOpsApplication["outcome"];
  result_sent_at: string | null; interview_done_at: string | null; beta_ended_at: string | null; purge_after: string | null;
  ad_status: BetaAdStatus; suppressed: boolean; ad_target: boolean; confirm_token: string | null; unsubscribe_token: string | null;
};

export async function listBetaApplications(client: SupabaseClient): Promise<BetaOpsApplication[]> {
  const { data, error } = await client.rpc("beta_ops_list_applications");
  if (error) throw opsError(error);
  return ((data ?? []) as ApplicationRow[]).map((row) => ({
    id: row.id,
    email: row.email,
    workType: row.work_type,
    sellsPackages: row.sells_packages,
    concurrentJobs: row.concurrent_jobs,
    orderChannels: row.order_channels ?? [],
    participation: row.participation,
    eligible: row.eligible,
    adChecked: row.ad_checked,
    createdAt: row.created_at,
    confirmExpiresAt: row.confirm_expires_at,
    emailConfirmedAt: row.email_confirmed_at,
    outcome: row.outcome,
    resultSentAt: row.result_sent_at,
    interviewDoneAt: row.interview_done_at,
    betaEndedAt: row.beta_ended_at,
    purgeAfter: row.purge_after,
    adStatus: row.ad_status,
    suppressed: row.suppressed,
    adTarget: row.ad_target,
    confirmToken: row.confirm_token,
    unsubscribeToken: row.unsubscribe_token,
  }));
}

type NoticeRow = {
  event_id: string; kind: BetaNoticeKind; source: BetaOpsNotice["source"]; occurred_at: string; confirmed_at: string | null;
  notice_shown_at: string | null; notice_due_at: string; notice_emailed_at: string | null; application_id: string | null;
  recipient_email: string | null;
  email_unavailable: boolean | null;
};

export async function listBetaNotices(client: SupabaseClient): Promise<BetaOpsNotice[]> {
  const { data, error } = await client.rpc("beta_ops_list_notices");
  if (error) throw opsError(error);
  return ((data ?? []) as NoticeRow[]).map((row) => ({
    eventId: row.event_id,
    kind: row.kind,
    source: row.source,
    occurredAt: row.occurred_at,
    confirmedAt: row.confirmed_at,
    noticeShownAt: row.notice_shown_at,
    noticeDueAt: row.notice_due_at,
    noticeEmailedAt: row.notice_emailed_at,
    applicationId: row.application_id,
    recipientEmail: row.recipient_email,
    emailUnavailable: Boolean(row.email_unavailable),
  }));
}

type DeletionRow = {
  id: string; email: string | null; requested_at: string; deleted_count: number;
  result_emailed_at: string | null; pending_notices: number;
};

export async function listBetaDeletions(client: SupabaseClient): Promise<BetaOpsDeletion[]> {
  const { data, error } = await client.rpc("beta_ops_list_deletions");
  if (error) throw opsError(error);
  return ((data ?? []) as DeletionRow[]).map((row) => ({
    id: row.id,
    email: row.email,
    requestedAt: row.requested_at,
    deletedCount: Number(row.deleted_count),
    resultEmailedAt: row.result_emailed_at,
    pendingNotices: Number(row.pending_notices),
  }));
}

export async function markBetaDeletionEmailed(client: SupabaseClient, deletionId: string): Promise<string> {
  const { data, error } = await client.rpc("beta_ops_mark_deletion_emailed", { p_deletion_id: deletionId });
  if (error) throw opsError(error);
  return String(data);
}

export async function markBetaNoticeEmailed(client: SupabaseClient, eventId: string): Promise<string> {
  const { data, error } = await client.rpc("beta_ops_mark_notice_emailed", { p_event_id: eventId });
  if (error) throw opsError(error);
  return String(data);
}

export type BetaMilestone = "result_sent" | "interview_done" | "beta_ended";

export async function recordBetaMilestone(
  client: SupabaseClient,
  applicationId: string,
  kind: BetaMilestone,
  outcome: BetaOpsApplication["outcome"],
): Promise<string | null> {
  const { data, error } = await client.rpc("beta_ops_record_milestone", {
    p_application_id: applicationId,
    p_kind: kind,
    p_outcome: outcome,
  });
  if (error) throw opsError(error);
  return (data as string | null) ?? null;
}

export type BetaDeletionReceipt = {
  deletedCount: number;
  withdrawEventId: string | null;
  withdrawAt: string | null;
  deletionId: string | null;
};

export async function deleteBetaApplication(
  client: SupabaseClient,
  applicationId: string,
): Promise<BetaDeletionReceipt> {
  const { data, error } = await client.rpc("beta_ops_delete_application", { p_application_id: applicationId });
  if (error) throw opsError(error);
  const row = firstRow<{ deleted_count: number; withdraw_event_id: string | null; withdraw_at: string | null; deletion_id: string | null }>(data);
  return {
    deletedCount: Number(row?.deleted_count ?? 0),
    withdrawEventId: row?.withdraw_event_id ?? null,
    withdrawAt: row?.withdraw_at ?? null,
    deletionId: row?.deletion_id ?? null,
  };
}

export type BetaPurgeResult = {
  deletedCount: number;
  /** 정리할 수 있는데 이번에 못 한 주소 수(한 번에 주소 100개까지라 다음 실행 몫). */
  remainingCount: number;
  /** 보내지 않은 처리결과 통지 때문에 정리를 미룬 주소 수(통지를 보낸 뒤 정리된다). */
  heldCount: number;
};

export type BetaCounterPruneResult = {
  deletedRows: number;
  /** 아직 남은 2일 지난 호출 제한 기록 행 수. 5,001개까지만 세므로 5,001이면 '5,000행 넘게 남음'이다. */
  remainingRows: number;
};

export async function purgeExpiredBetaApplications(client: SupabaseClient): Promise<BetaPurgeResult> {
  const { data, error } = await client.rpc("beta_ops_purge_expired");
  if (error) throw opsError(error);
  const row = firstRow<{ deleted_count: number; remaining_count: number; held_count: number }>(data);
  return {
    deletedCount: Number(row?.deleted_count ?? 0),
    remainingCount: Number(row?.remaining_count ?? 0),
    heldCount: Number(row?.held_count ?? 0),
  };
}

/** 2일 지난 호출 제한 기록 정리. 신청 정리와 따로 부른다(별도 트랜잭션, 이메일 잠금 없음). */
export async function pruneBetaCallCounters(client: SupabaseClient): Promise<BetaCounterPruneResult> {
  const { data, error } = await client.rpc("beta_ops_prune_call_counters");
  if (error) throw opsError(error);
  const row = firstRow<{ deleted_rows: number; remaining_rows: number }>(data);
  return { deletedRows: Number(row?.deleted_rows ?? 0), remainingRows: Number(row?.remaining_rows ?? 0) };
}
