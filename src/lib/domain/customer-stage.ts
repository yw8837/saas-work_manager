import type { Job, Revision } from "./types";

/**
 * 고객 화면에 보여 주는 진행 단계. 할 일 이름·금액은 내보내지 않고 단계 번호만 계산한다.
 * 규칙(단순하고 예측 가능하게):
 * - 일감 완료, 또는 취소를 뺀 할 일이 모두 끝남 → 납품
 * - '시작 전 받을 자료'가 아직 남음 → 자료 받는 중 (자료 없이 '수정'으로 보이던 문제)
 * - 되돌리지 않은 수정 요청이 하나라도 있음 → 수정
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
    hasOpenRevision: job.revisions.some((revision) => !revision.revertedAt),
    completed: job.status === "completed",
    intakePending: (job.intakeItems ?? []).filter((item) => !item.receivedAt).length,
  };
}

export function customerStageOf(job: Pick<Job, "status" | "tasks" | "revisions" | "intakeItems">): CustomerStage {
  return customerStageFromProgress(customerProgressOf(job));
}

/**
 * 고객 화면의 '남기신 요청' 한 줄. 고객이 링크로 남긴 원문과 처리 상태만 담는다.
 * 작업자 메모(반려 사유)·이름·접수 채널·내부 분류명은 넣지 않는다.
 * pending 확인 대기 / done 수정 완료(회차) / extra 추가 작업 검토 / rejected 반려(되돌림 포함)
 */
export type CustomerRequestStatus = "pending" | "done" | "extra" | "rejected";
export type CustomerRequest = {
  status: CustomerRequestStatus;
  sequence?: number;
  submittedAt?: string;
  body: string;
};
export const CUSTOMER_REQUEST_LIMIT = 20;

export function customerRequestStatusOf(revision: Pick<Revision, "usage" | "revertedAt">): CustomerRequestStatus {
  if (revision.revertedAt) return "rejected";
  if (revision.usage === "used") return "done";
  if (revision.usage === "extra_scope") return "extra";
  return "pending";
}

/** 서버(get_workspace_revision_view의 requests)와 같은 규칙: 고객 링크 요청만, 최근 것부터 20건. */
export function customerRequestsOf(job: Pick<Job, "revisions">): CustomerRequest[] {
  const result: CustomerRequest[] = [];
  for (let index = job.revisions.length - 1; index >= 0 && result.length < CUSTOMER_REQUEST_LIMIT; index -= 1) {
    const revision = job.revisions[index];
    const body = revision.body.trim();
    if (revision.source !== "public" || !body) continue;
    const status = customerRequestStatusOf(revision);
    result.push({
      status,
      ...(status === "done" && revision.sequence ? { sequence: revision.sequence } : {}),
      ...(revision.submittedAt ? { submittedAt: revision.submittedAt } : {}),
      body,
    });
  }
  return result;
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
