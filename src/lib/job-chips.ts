import { getRevisionSummary, type Job } from "@/lib/domain";

/**
 * 상태 칩(알약, 디자인 A 3절 4번). 색 규칙: 파랑=진행·수정, 주황=기다림(자료 대기·고객 대기·확인 대기·수정 거의 다 씀),
 * 빨강=지연만, 초록=완료만, 회색=끝난 일감의 보조 정보.
 * 판정 기준은 오늘 화면이 쓰던 것을 그대로 옮겼다(새 규칙 없음).
 */
export type ChipTone = "blue" | "amber" | "red" | "green" | "gray";
export type Chip = { label: string; tone: ChipTone };

/** 받을 자료나 착수 전 질문의 답이 남은 진행 중 일감(오늘 화면 '자료 대기'와 같은 기준). */
export function hasMaterialWaiting(job: Job): boolean {
  return job.status === "active" && (
    (job.intakeItems ?? []).some((item) => !item.receivedAt)
    || (job.briefQuestions ?? []).some((question) => !question.answeredAt)
  );
}

/**
 * 수정 거의 다 씀(오늘 화면과 같은 기준): 수정을 쓰기 시작한(추가 작업 포함) 진행 중 일감 중 남은 수정 1회 이하.
 * 수정을 한 번도 안 쓴 일감까지 세면 포함 수정 1회짜리 패키지는 만들자마자 뜬다.
 */
export function isNearRevisionLimit(job: Job): boolean {
  if (job.status !== "active") return false;
  const summary = getRevisionSummary(job);
  return (summary.used > 0 || summary.extraScope > 0) && summary.remaining <= 1;
}

export function jobChips(job: Job, today: string): { status: Chip; extras: Chip[]; revision: Chip } {
  const revision = getRevisionSummary(job);
  const waiting = job.tasks.some((task) => task.status === "waiting");
  const status: Chip = job.status === "completed"
    ? { label: "완료", tone: "green" }
    : waiting
      ? { label: "고객 대기", tone: "amber" }
      : job.dueDate < today
        ? { label: "지연", tone: "red" }
        : { label: "작업 중", tone: "blue" };
  const extras: Chip[] = [];
  if (job.status === "active") {
    if (hasMaterialWaiting(job)) extras.push({ label: "자료 대기", tone: "amber" });
    if (revision.pending > 0) extras.push({ label: `확인 대기 ${revision.pending}건`, tone: "amber" });
  }
  return {
    status,
    extras,
    revision: {
      label: `수정 ${revision.used}/${revision.included}`,
      tone: job.status !== "active" ? "gray" : isNearRevisionLimit(job) ? "amber" : "blue",
    },
  };
}
