import type { SupabaseClient } from "@supabase/supabase-js";

import {
  BetaNoticesPendingError,
  deleteBetaApplication,
  listBetaApplications,
  listBetaDeletions,
  listBetaNotices,
  markBetaDeletionEmailed,
  markBetaNoticeEmailed,
  purgeExpiredBetaApplications,
  recordBetaMilestone,
  type BetaDeletionReceipt,
  type BetaMilestone,
  type BetaOpsApplication,
  type BetaOpsDeletion,
  type BetaOpsNotice,
} from "@/lib/supabase/beta";
import { noticeDueAt } from "./rules";

/** 운영자 화면이 쓰는 기능. 실제(Supabase RPC)와 로컬 미리보기(메모리, 가상 예시)를 같은 모양으로 맞춘다. */
export type BetaOpsBackend = {
  listApplications(): Promise<BetaOpsApplication[]>;
  listNotices(): Promise<BetaOpsNotice[]>;
  listDeletions(): Promise<BetaOpsDeletion[]>;
  markNoticeEmailed(eventId: string): Promise<void>;
  recordMilestone(applicationId: string, kind: BetaMilestone, outcome: BetaOpsApplication["outcome"]): Promise<void>;
  deleteApplication(applicationId: string): Promise<BetaDeletionReceipt>;
  markDeletionEmailed(deletionId: string): Promise<void>;
  purgeExpired(): Promise<number>;
};

export function hostedBetaOpsBackend(client: SupabaseClient): BetaOpsBackend {
  return {
    listApplications: () => listBetaApplications(client),
    listNotices: () => listBetaNotices(client),
    listDeletions: () => listBetaDeletions(client),
    markNoticeEmailed: async (eventId) => { await markBetaNoticeEmailed(client, eventId); },
    recordMilestone: async (applicationId, kind, outcome) => { await recordBetaMilestone(client, applicationId, kind, outcome); },
    deleteApplication: (applicationId) => deleteBetaApplication(client, applicationId),
    markDeletionEmailed: async (deletionId) => { await markBetaDeletionEmailed(client, deletionId); },
    purgeExpired: () => purgeExpiredBetaApplications(client),
  };
}

function addMonths(iso: string, months: number): string {
  const date = new Date(iso);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString();
}

function previewToken(seed: string): string {
  return `preview${seed}`.padEnd(43, "x");
}

/** DB(beta_ops_list_applications)와 같은 규칙: 광고 대상은 주소 단위로 한 번만 계산한다. */
function withAdTargets(applications: BetaOpsApplication[]): BetaOpsApplication[] {
  return applications.map((application) => {
    const same = applications.filter((item) => item.email === application.email);
    const latest = same.reduce((a, b) => (a.createdAt >= b.createdAt ? a : b));
    const excluded = same.some((item) => item.outcome === "not_matched" || item.outcome === "not_selected");
    return { ...application, adTarget: application.adStatus === "active" && !application.suppressed && latest.eligible && !excluded };
  });
}

/**
 * 로컬 모드(서버 없음) 미리보기용 가상 신청. 실제 사람의 정보는 넣지 않는다(example.invalid).
 * DB 규칙의 정답은 PGlite 시험(scripts/test-beta-consent-db.mjs)이 맡고, 여기서는 화면 흐름만 보여 준다.
 */
export function previewBetaOpsBackend(now: Date = new Date()): BetaOpsBackend {
  const at = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000).toISOString();
  const base = {
    workType: "web" as const,
    orderChannels: ["kmong" as const],
    emailConfirmedAt: null,
    outcome: null,
    resultSentAt: null,
    interviewDoneAt: null,
    betaEndedAt: null,
    purgeAfter: null,
    suppressed: false,
    adTarget: false,
  };
  let applications: BetaOpsApplication[] = withAdTargets([
    { ...base, id: "preview-a", email: "test-a@example.invalid", sellsPackages: true, concurrentJobs: "2-3", participation: "both", eligible: true, adChecked: true, createdAt: at(30), confirmExpiresAt: addMonths(at(30), 1), adStatus: "pending", confirmToken: previewToken("ConfirmA"), unsubscribeToken: previewToken("UnsubA") },
    { ...base, id: "preview-b", email: "test-b@example.invalid", sellsPackages: true, concurrentJobs: "4+", participation: "interview", eligible: true, adChecked: false, createdAt: at(20), confirmExpiresAt: addMonths(at(20), 1), adStatus: "none", confirmToken: previewToken("ConfirmB"), unsubscribeToken: previewToken("UnsubB") },
    { ...base, id: "preview-c", email: "test-c@example.invalid", workType: "design", sellsPackages: false, concurrentJobs: "1", participation: "beta", eligible: false, adChecked: true, createdAt: at(10), confirmExpiresAt: addMonths(at(10), 1), adStatus: "pending", confirmToken: previewToken("ConfirmC"), unsubscribeToken: previewToken("UnsubC") },
    { ...base, id: "preview-d", email: "test-d@example.invalid", sellsPackages: true, concurrentJobs: "2-3", participation: "beta", eligible: true, adChecked: true, createdAt: at(5), emailConfirmedAt: at(4), confirmExpiresAt: addMonths(at(5), 1), adStatus: "active", confirmToken: previewToken("ConfirmD"), unsubscribeToken: previewToken("UnsubD") },
  ]);
  let notices: BetaOpsNotice[] = applications
    .filter((application) => application.adChecked)
    .map((application) => ({
      eventId: `${application.id}-consent`,
      kind: "consent" as const,
      source: "apply_form" as const,
      occurredAt: application.createdAt,
      confirmedAt: application.emailConfirmedAt,
      noticeShownAt: application.createdAt,
      noticeDueAt: noticeDueAt(new Date(application.createdAt)).toISOString(),
      noticeEmailedAt: null,
      applicationId: application.id,
      recipientEmail: application.email,
      emailUnavailable: false,
    }));
  let deletions: Array<BetaOpsDeletion & { key: string }> = [];

  const pendingFor = (email: string) => notices.filter((notice) => notice.recipientEmail === email && !notice.noticeEmailedAt).length;

  return {
    listApplications: async () => applications.map((application) => ({ ...application })),
    listNotices: async () => notices.map((notice) => ({ ...notice })),
    listDeletions: async () => deletions.map(({ key, ...deletion }) => ({ ...deletion, pendingNotices: pendingFor(key) })),
    markNoticeEmailed: async (eventId) => {
      notices = notices.map((notice) => notice.eventId === eventId
        ? { ...notice, noticeEmailedAt: notice.noticeEmailedAt ?? new Date().toISOString() }
        : notice);
    },
    recordMilestone: async (applicationId, kind, outcome) => {
      const stamp = new Date().toISOString();
      applications = withAdTargets(applications.map((application) => {
        if (application.id !== applicationId) return application;
        const next = { ...application };
        if (kind === "result_sent") { next.outcome = outcome; next.resultSentAt = stamp; }
        if (kind === "interview_done") next.interviewDoneAt = stamp;
        if (kind === "beta_ended") next.betaEndedAt = stamp;
        next.purgeAfter = next.outcome === "not_matched" || next.outcome === "not_selected"
          ? addMonths(next.resultSentAt!, 1)
          : next.outcome === "interview" && next.interviewDoneAt ? addMonths(next.interviewDoneAt, 6)
            : next.outcome === "beta" && next.betaEndedAt ? addMonths(next.betaEndedAt, 6) : null;
        return next;
      }));
    },
    deleteApplication: async (applicationId) => {
      const target = applications.find((application) => application.id === applicationId);
      if (!target) throw new Error("이미 지워진 신청이에요.");
      const same = applications.filter((application) => application.email === target.email);
      applications = withAdTargets(applications.filter((application) => application.email !== target.email));
      const requestedAt = new Date().toISOString();
      const withdraws = target.adStatus === "active" || target.adStatus === "pending";
      const withdrawEventId = withdraws ? `${applicationId}-deletion` : null;
      notices = notices.map((notice) => same.some((application) => application.id === notice.applicationId)
        ? { ...notice, applicationId: null }
        : notice);
      if (withdrawEventId) {
        notices = [{
          eventId: withdrawEventId, kind: "withdraw", source: "deletion_request", occurredAt: requestedAt, confirmedAt: null,
          noticeShownAt: null, noticeDueAt: noticeDueAt(new Date(requestedAt)).toISOString(), noticeEmailedAt: null,
          applicationId: null, recipientEmail: target.email, emailUnavailable: false,
        }, ...notices];
      }
      const deletionId = `${applicationId}-deletion-request`;
      deletions = [{
        key: target.email, id: deletionId, email: target.email, requestedAt, deletedCount: same.length,
        resultEmailedAt: null, pendingNotices: 0,
      }, ...deletions];
      return { deletedCount: same.length, withdrawEventId, withdrawAt: withdraws ? requestedAt : null, deletionId };
    },
    markDeletionEmailed: async (deletionId) => {
      const deletion = deletions.find((item) => item.id === deletionId);
      if (!deletion || deletion.resultEmailedAt) return;
      if (pendingFor(deletion.key) > 0) throw new BetaNoticesPendingError();
      const stamp = new Date().toISOString();
      deletions = deletions.map((item) => item.id === deletionId ? { ...item, email: null, resultEmailedAt: stamp } : item);
      notices = notices.map((notice) => notice.recipientEmail === deletion.key ? { ...notice, recipientEmail: null } : notice);
    },
    purgeExpired: async () => {
      const cutoff = Date.now();
      const before = applications.length;
      applications = withAdTargets(applications.filter((application) => !application.purgeAfter
        || new Date(application.purgeAfter).getTime() > cutoff
        || pendingFor(application.email) > 0));
      return before - applications.length;
    },
  };
}
