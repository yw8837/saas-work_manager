import type { Job, OrderSource } from "./types";

/** 받은 곳 고르기 순서. 새 일감 칩·일감 화면·목록 거르기가 이 순서를 쓴다. */
export const ORDER_SOURCES: OrderSource[] = ["kmong", "soomgo", "referral", "direct", "other"];

export const ORDER_SOURCE_LABELS: Record<OrderSource, string> = {
  kmong: "크몽",
  soomgo: "숨고",
  referral: "소개",
  direct: "직접 문의",
  other: "기타",
};

/** 저장본·주소에서 읽은 값을 받은 곳으로 바꾼다. 모르는 값은 받은 곳이 없는 것으로 본다. */
export function normalizeOrderSource(value: unknown): OrderSource | undefined {
  return typeof value === "string" && (ORDER_SOURCES as string[]).includes(value) ? (value as OrderSource) : undefined;
}

/** 화면에 보일 받은 곳 이름. 없거나 모르는 값이면 undefined. 고객에게 가는 문구·링크에는 쓰지 않는다. */
export function orderSourceLabel(value: unknown): string | undefined {
  const source = normalizeOrderSource(value);
  return source ? ORDER_SOURCE_LABELS[source] : undefined;
}

/**
 * 완료 시각 칸이 생기기 전에 완료한 일감은 월별 정리가 마지막 수정 시각으로 달을 정한다.
 * 완료한 일감을 고칠 때(받은 곳·작업 링크) 먼저 지금의 마지막 수정 시각을 완료 시각으로 굳혀, 고친 뒤에도 원래 달에 남게 한다.
 */
export function pinLegacyCompletedAt(job: Job): Job {
  if (job.status !== "completed" || job.completedAt) return job;
  return { ...job, completedAt: job.updatedAt };
}

/**
 * 받은 곳을 바꾸거나 지운다(undefined면 칸 자체를 뺀다). 같은 값이면 일감을 그대로 돌려준다.
 * 받은 곳은 고객 링크·수정 횟수와 상관없어 완료한 일감에도 쓴다(지난달 정리를 고칠 수 있게).
 */
export function setJobSource(job: Job, source: OrderSource | undefined, now = new Date().toISOString()): Job {
  const next = normalizeOrderSource(source);
  if (job.source === next && (next !== undefined || !("source" in job))) return job;
  const updated: Job = { ...pinLegacyCompletedAt(job), updatedAt: now };
  if (next) updated.source = next;
  else delete updated.source;
  return updated;
}

/**
 * 새 일감의 받은 곳 기본값: 받은 곳이 있는 일감 중 가장 늦게 만든 일감의 값.
 * 설정 칸에 따로 저장하지 않는다. 두 기기가 거의 동시에 다른 곳으로 일감을 만들면 설정 칸이 충돌해 자동 병합이 멈추기 때문이다.
 */
export function latestOrderSource(jobs: Job[]): OrderSource | undefined {
  let latest: { source: OrderSource; createdAt: string } | undefined;
  for (const job of jobs) {
    const source = normalizeOrderSource(job.source);
    if (!source) continue;
    if (!latest || job.createdAt > latest.createdAt) latest = { source, createdAt: job.createdAt };
  }
  return latest?.source;
}
