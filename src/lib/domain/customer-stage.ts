import type { Job, Revision, RevisionChannel } from "./types";

/**
 * 고객 화면에 보여 주는 진행 단계. 할 일 이름·금액은 내보내지 않고 단계 번호만 계산한다.
 * 규칙(단순하고 예측 가능하게):
 * - 일감 완료, 또는 취소를 뺀 할 일이 모두 끝남 → 납품
 * - '시작 전 받을 자료'가 아직 남음 → 자료 받는 중 (자료 없이 '수정'으로 보이던 문제)
 * - 확인 대기 중인(되돌리지 않은) 수정 요청이 하나라도 있음 → 수정
 * - 할 일이 절반 이상 끝남 → 시안 확인
 * - 그 밖 → 작업 중
 */
export const CUSTOMER_STAGE_LABELS = ["자료 받는 중", "작업 중", "시안 확인", "수정", "납품"] as const;
export type CustomerStage = 0 | 1 | 2 | 3 | 4;
/** 이 단계보다 앞(자료 받는 중·작업 중)이면 고객이 아직 시안을 못 봤다. */
export const CUSTOMER_DRAFT_STAGE: CustomerStage = 2;

export type CustomerProgress = {
  /** 취소를 뺀 할 일 수 */
  total: number;
  done: number;
  hasOpenRevision: boolean;
  completed?: boolean;
  /** 아직 받지 못한 '시작 전 받을 자료' 수. 모르면 비워 둔다. */
  intakePending?: number;
};

/** 서버(get_workspace_revision_view)가 내려 준 개수로도 같은 규칙을 쓰려고 분리했다. */
export function customerStageFromProgress({ total, done, hasOpenRevision, completed, intakePending }: CustomerProgress): CustomerStage {
  if (completed || (total > 0 && done === total)) return 4;
  if ((intakePending ?? 0) > 0) return 0;
  if (hasOpenRevision) return 3;
  if (total > 0 && done * 2 >= total) return 2;
  return 1;
}

export function customerProgressOf(job: Pick<Job, "status" | "tasks" | "revisions" | "intakeItems">): CustomerProgress {
  const tasks = job.tasks.filter((task) => task.status !== "cancelled");
  return {
    total: tasks.length,
    done: tasks.filter((task) => task.status === "done").length,
    // 열린 요청 = 아직 확인 대기인 요청. 수정 완료·추가 작업으로 처리한 요청까지 세면 고객 단계가 '수정'에 머문다.
    // DB 함수 get_workspace_revision_view(migration 20261103180000)와 같은 규칙이다.
    hasOpenRevision: job.revisions.some((revision) => !revision.revertedAt && revision.usage === "pending"),
    completed: job.status === "completed",
    intakePending: (job.intakeItems ?? []).filter((item) => !item.receivedAt).length,
  };
}

export function customerStageOf(job: Pick<Job, "status" | "tasks" | "revisions" | "intakeItems">): CustomerStage {
  return customerStageFromProgress(customerProgressOf(job));
}

/**
 * 고객 화면 요청 목록의 한 줄. 처리 상태와 접수 시각을 담는다.
 * - 고객이 링크로 남긴 요청: 고객이 쓴 원문(body)을 함께 담는다. source는 비워 둔다(옛 서버와 같은 모양).
 * - 작업자가 직접 적은 요청(source "manual"): 받은 경로(channel)만 담고 원문은 담지 않는다.
 *   작업자가 자기 말로 옮겨 적은 메모라 고객에게 보일 글이 아닐 수 있다.
 * 작업자 메모(반려 사유)·이름·참고 링크·내부 분류명은 어느 쪽에도 넣지 않는다.
 * pending 확인 대기 / done 수정 완료(회차) / extra 추가 작업 검토 / rejected 반려(되돌림 포함, 고객 링크 요청만 — 되돌린 직접 기록은 목록에서 뺀다)
 */
export type CustomerRequestStatus = "pending" | "done" | "extra" | "rejected";
type CustomerRequestBase = {
  status: CustomerRequestStatus;
  sequence?: number;
  submittedAt?: string;
};
export type CustomerRequest =
  | (CustomerRequestBase & { source?: "public"; body: string })
  | (CustomerRequestBase & { source: "manual"; channel: RevisionChannel; body?: never });
export const CUSTOMER_REQUEST_LIMIT = 20;

const CUSTOMER_REQUEST_CHANNELS: readonly RevisionChannel[] = ["kakao", "kmong", "soomgo", "instagram", "discord", "phone", "other"];

/** 받은 경로는 앱의 선택지 일곱 개만 통과시킨다. 없거나 모르는 값은 "other"(서버 함수와 같은 규칙). */
export function customerRequestChannelOf(value: unknown): RevisionChannel {
  return CUSTOMER_REQUEST_CHANNELS.includes(value as RevisionChannel) ? (value as RevisionChannel) : "other";
}

// 정렬에 쓰는 접수 시각 형식. 앱의 toISOString 모양(YYYY-MM-DDTHH:MM:SS.sssZ)만 통과시킨다.
// 길이·시간대가 같아야 글자 순서가 시각 순서와 같다. 이 형식이 아니면 정렬에서 맨 뒤로 보낸다(서버 함수의 c_sort_iso와 같다).
const CUSTOMER_REQUEST_SORT_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function customerRequestStatusOf(revision: Pick<Revision, "usage" | "revertedAt">): CustomerRequestStatus {
  if (revision.revertedAt) return "rejected";
  if (revision.usage === "used") return "done";
  if (revision.usage === "extra_scope") return "extra";
  return "pending";
}

/**
 * 서버(get_workspace_revision_view의 requests, migration 20261118120000)와 같은 규칙:
 * 고객 링크 요청과 작업자가 직접 적은 요청을 접수 시각이 늦은 것부터 20건. 시각이 같거나 형식이 틀리면 나중에 기록한 것 먼저.
 * 직접 적은 요청은 원문 없이 받은 경로만 담는다. 되돌린 직접 기록은 담지 않는다(지울 방법이 없어 잘못 적은 기록이 '반려'로 보이면 안 된다).
 * 20건은 뺀 뒤에 센다. 고객 링크 요청은 되돌려도 지금처럼 '반려'로 담는다.
 */
export function customerRequestsOf(job: Pick<Job, "revisions">): CustomerRequest[] {
  const listed: { request: CustomerRequest; sortAt?: string; index: number }[] = [];
  job.revisions.forEach((revision, index) => {
    const body = revision.body.trim();
    if ((revision.source !== "public" && revision.source !== "manual") || !body) return;
    if (revision.source === "manual" && revision.revertedAt) return;
    const status = customerRequestStatusOf(revision);
    const base = {
      status,
      ...(status === "done" && revision.sequence ? { sequence: revision.sequence } : {}),
      ...(revision.submittedAt ? { submittedAt: revision.submittedAt } : {}),
    };
    listed.push({
      request: revision.source === "manual"
        ? { ...base, source: "manual", channel: customerRequestChannelOf(revision.channel) }
        : { ...base, body },
      sortAt: CUSTOMER_REQUEST_SORT_ISO.test(revision.submittedAt ?? "") ? revision.submittedAt : undefined,
      index,
    });
  });
  listed.sort((a, b) => {
    if (a.sortAt !== b.sortAt) {
      if (a.sortAt === undefined) return 1;
      if (b.sortAt === undefined) return -1;
      return a.sortAt < b.sortAt ? 1 : -1;
    }
    return b.index - a.index;
  });
  return listed.slice(0, CUSTOMER_REQUEST_LIMIT).map((entry) => entry.request);
}

/** ISO 시각을 이 브라우저 날짜 "O월 O일"로. 형식이 틀리면 비운다. */
export function customerCompletedLabel(iso: string | undefined): string | undefined {
  if (!iso || !/^\d{4}-\d{2}-\d{2}T/.test(iso)) return undefined;
  const time = new Date(iso);
  if (Number.isNaN(time.getTime())) return undefined;
  return `${time.getMonth() + 1}월 ${time.getDate()}일`;
}

/**
 * 고객 화면 마감 표시. 지난 마감은 "지남" 대신 날짜만 보여 준다 —
 * 일정이 바뀌었을 수 있는데 고객 화면이 작업자를 탓하는 문구가 되면 안 된다.
 */
export function customerDueLabel(dueDate: string, today: string): string | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dueDate);
  const todayMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
  if (!match || !todayMatch) return undefined;
  const due = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const base = Date.UTC(Number(todayMatch[1]), Number(todayMatch[2]) - 1, Number(todayMatch[3]));
  if (Number.isNaN(due) || Number.isNaN(base)) return undefined;
  const date = `${Number(match[2])}월 ${Number(match[3])}일`;
  const days = Math.round((due - base) / 86_400_000);
  if (days > 0) return `${date} · ${days}일 남음`;
  if (days === 0) return `${date} · 오늘`;
  return date;
}

/** 고객 화면에 보일 추가 작업: 확정된 건수와 그로 늘어난 기간(일). 금액·이름은 담지 않는다. */
export type CustomerAddons = { count: number; days: number };

/**
 * 확정된 추가 작업만 센다(초안·취소 제외). 기간은 0 이상 정수만 더한다.
 * 서버 함수(get_workspace_revision_view, migration 20261117120000)와 같은 규칙이다.
 */
export function customerAddonsOf(job: Pick<Job, "addons">): CustomerAddons {
  const confirmed = (job.addons ?? []).filter((addon) => addon.status === "confirmed");
  const days = confirmed.reduce((sum, addon) => {
    const delta = addon.durationDaysDelta;
    return Number.isInteger(delta) && delta >= 0 && delta <= 9999 ? sum + delta : sum;
  }, 0);
  return { count: confirmed.length, days };
}
