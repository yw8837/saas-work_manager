import type { Job } from "./types";

/**
 * 고객 화면에 보여 주는 진행 단계. 할 일 이름·금액은 내보내지 않고 단계 번호만 계산한다.
 * 규칙(단순하고 예측 가능하게):
 * - 일감 완료, 또는 취소를 뺀 할 일이 모두 끝남 → 납품
 * - 되돌리지 않은 수정 요청이 하나라도 있음 → 수정
 * - 할 일이 절반 이상 끝남 → 시안 확인
 * - 그 밖 → 작업 중
 */
export const CUSTOMER_STAGE_LABELS = ["작업 중", "시안 확인", "수정", "납품"] as const;
export type CustomerStage = 0 | 1 | 2 | 3;

export type CustomerProgress = {
  /** 취소를 뺀 할 일 수 */
  total: number;
  done: number;
  hasOpenRevision: boolean;
  completed?: boolean;
};

/** 서버(get_workspace_revision_view)가 내려 준 개수로도 같은 규칙을 쓰려고 분리했다. */
export function customerStageFromProgress({ total, done, hasOpenRevision, completed }: CustomerProgress): CustomerStage {
  if (completed || (total > 0 && done === total)) return 3;
  if (hasOpenRevision) return 2;
  if (total > 0 && done * 2 >= total) return 1;
  return 0;
}

export function customerProgressOf(job: Pick<Job, "status" | "tasks" | "revisions">): CustomerProgress {
  const tasks = job.tasks.filter((task) => task.status !== "cancelled");
  return {
    total: tasks.length,
    done: tasks.filter((task) => task.status === "done").length,
    hasOpenRevision: job.revisions.some((revision) => !revision.revertedAt),
    completed: job.status === "completed",
  };
}

export function customerStageOf(job: Pick<Job, "status" | "tasks" | "revisions">): CustomerStage {
  return customerStageFromProgress(customerProgressOf(job));
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
