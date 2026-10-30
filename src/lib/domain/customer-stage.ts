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

export function customerStageOf(job: Pick<Job, "status" | "tasks" | "revisions">): CustomerStage {
  const tasks = job.tasks.filter((task) => task.status !== "cancelled");
  const done = tasks.filter((task) => task.status === "done").length;
  if (job.status === "completed" || (tasks.length > 0 && done === tasks.length)) return 3;
  if (job.revisions.some((revision) => !revision.revertedAt)) return 2;
  if (tasks.length > 0 && done * 2 >= tasks.length) return 1;
  return 0;
}
