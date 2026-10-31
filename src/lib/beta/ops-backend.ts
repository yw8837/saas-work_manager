import type { SupabaseClient } from "@supabase/supabase-js";

import {
  deleteBetaApplication,
  listBetaApplications,
  listBetaNotices,
  markBetaNoticeEmailed,
  purgeExpiredBetaApplications,
  recordBetaMilestone,
  type BetaMilestone,
  type BetaOpsApplication,
  type BetaOpsNotice,
} from "@/lib/supabase/beta";
import { noticeDueAt } from "./rules";

/** 운영자 화면이 쓰는 기능. 실제(Supabase RPC)와 로컬 미리보기(메모리, 가상 예시)를 같은 모양으로 맞춘다. */
export type BetaOpsBackend = {
  listApplications(): Promise<BetaOpsApplication[]>;
  listNotices(): Promise<BetaOpsNotice[]>;
  markNoticeEmailed(eventId: string): Promise<void>;
  recordMilestone(applicationId: string, kind: BetaMilestone, outcome: BetaOpsApplication["outcome"]): Promise<void>;
  deleteApplication(applicationId: string): Promise<{ deletedCount: number; withdrawEventId: string | null; withdrawAt: string | null }>;
  purgeExpired(): Promise<number>;
};

export function hostedBetaOpsBackend(client: SupabaseClient): BetaOpsBackend {
  return {
    listApplications: () => listBetaApplications(client),
    listNotices: () => listBetaNotices(client),
    markNoticeEmailed: async (eventId) => { await markBetaNoticeEmailed(client, eventId); },
    recordMilestone: async (applicationId, kind, outcome) => { await recordBetaMilestone(client, applicationId, kind, outcome); },
    deleteApplication: (applicationId) => deleteBetaApplication(client, applicationId),
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
  };
  let applications: BetaOpsApplication[] = [
    { ...base, id: "preview-a", email: "test-a@example.invalid", sellsPackages: true, concurrentJobs: "2-3", participation: "both", eligible: true, adChecked: true, createdAt: at(30), confirmExpiresAt: addMonths(at(30), 1), adStatus: "pending", adTarget: false, confirmToken: previewToken("ConfirmA"), unsubscribeToken: previewToken("UnsubA") },
    { ...base, id: "preview-b", email: "test-b@example.invalid", sellsPackages: true, concurrentJobs: "4+", participation: "interview", eligible: true, adChecked: false, createdAt: at(20), confirmExpiresAt: addMonths(at(20), 1), adStatus: "none", adTarget: false, confirmToken: previewToken("ConfirmB"), unsubscribeToken: previewToken("UnsubB") },
    { ...base, id: "preview-c", email: "test-c@example.invalid", workType: "design", sellsPackages: false, concurrentJobs: "1", participation: "beta", eligible: false, adChecked: true, createdAt: at(10), confirmExpiresAt: addMonths(at(10), 1), adStatus: "pending", adTarget: false, confirmToken: previewToken("ConfirmC"), unsubscribeToken: previewToken("UnsubC") },
    { ...base, id: "preview-d", email: "test-d@example.invalid", sellsPackages: true, concurrentJobs: "2-3", participation: "beta", eligible: true, adChecked: true, createdAt: at(5), emailConfirmedAt: at(4), confirmExpiresAt: addMonths(at(5), 1), adStatus: "active", adTarget: true, confirmToken: previewToken("ConfirmD"), unsubscribeToken: previewToken("UnsubD") },
  ];
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
    }));

  return {
    listApplications: async () => applications.map((application) => ({ ...application })),
    listNotices: async () => notices.map((notice) => ({ ...notice })),
    markNoticeEmailed: async (eventId) => {
      notices = notices.map((notice) => notice.eventId === eventId
        ? { ...notice, noticeEmailedAt: notice.noticeEmailedAt ?? new Date().toISOString() }
        : notice);
    },
    recordMilestone: async (applicationId, kind, outcome) => {
      const stamp = new Date().toISOString();
      applications = applications.map((application) => {
        if (application.id !== applicationId) return application;
        const next = { ...application };
        if (kind === "result_sent") { next.outcome = outcome; next.resultSentAt = stamp; }
        if (kind === "interview_done") next.interviewDoneAt = stamp;
        if (kind === "beta_ended") next.betaEndedAt = stamp;
        next.purgeAfter = next.outcome === "not_matched" || next.outcome === "not_selected"
          ? addMonths(next.resultSentAt!, 1)
          : next.outcome === "interview" && next.interviewDoneAt ? addMonths(next.interviewDoneAt, 6)
            : next.outcome === "beta" && next.betaEndedAt ? addMonths(next.betaEndedAt, 6) : null;
        next.adTarget = next.adStatus === "active" && next.eligible && !next.suppressed
          && next.outcome !== "not_matched" && next.outcome !== "not_selected";
        return next;
      });
    },
    deleteApplication: async (applicationId) => {
      const target = applications.find((application) => application.id === applicationId);
      if (!target) throw new Error("이미 지워진 신청이에요.");
      const same = applications.filter((application) => application.email === target.email);
      applications = applications.filter((application) => application.email !== target.email);
      const withdrawAt = new Date().toISOString();
      const withdraws = target.adStatus === "active" || target.adStatus === "pending";
      const withdrawEventId = withdraws ? `${applicationId}-deletion` : null;
      notices = notices.map((notice) => same.some((application) => application.id === notice.applicationId)
        ? { ...notice, applicationId: null }
        : notice);
      if (withdrawEventId) {
        notices = [{
          eventId: withdrawEventId, kind: "withdraw", source: "deletion_request", occurredAt: withdrawAt, confirmedAt: null,
          noticeShownAt: null, noticeDueAt: noticeDueAt(new Date(withdrawAt)).toISOString(), noticeEmailedAt: null, applicationId: null,
        }, ...notices];
      }
      return { deletedCount: same.length, withdrawEventId, withdrawAt: withdraws ? withdrawAt : null };
    },
    purgeExpired: async () => {
      const cutoff = Date.now();
      const before = applications.length;
      applications = applications.filter((application) => !application.purgeAfter || new Date(application.purgeAfter).getTime() > cutoff);
      return before - applications.length;
    },
  };
}
