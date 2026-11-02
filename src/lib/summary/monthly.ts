import {
  displayJobTitle,
  normalizeOrderSource,
  ORDER_SOURCE_LABELS,
  ORDER_SOURCES,
  orderSourceLabel,
  type Job,
  type OrderSource,
} from "@/lib/domain";

/**
 * 월별 정리(세금 신고 때 참고할 매출·원가 모음). 세금 계산이나 신고 금액은 만들지 않는다.
 * 달 경계는 넘겨받은 시간대로 나눈다(시스템 시간대에 기대지 않음 — CI는 UTC).
 * 기준 달은 완료한 달이고, 완료 시각이 없던 예전 완료 일감은 마지막 수정 시각으로 넣고 추정이라고 표시한다.
 */

export type MonthlySummaryRow = { job: Job; completedAt: string; completedAtEstimated: boolean };

export type MonthlySummary = {
  month: string;
  totals: { amount: number; estimatedCost: number; margin: number; count: number };
  bySource: Array<{ source: OrderSource | "none"; label: string; amount: number; count: number }>;
  rows: MonthlySummaryRow[];
  inProgress: { amount: number; count: number };
};

export type SummaryCsvRange = { kind: "month"; month: string } | { kind: "year"; year: string };

export const NO_SOURCE_LABEL = "받은 곳 없음";

const CSV_HEADER = "완료일,고객,일감,받은 곳,패키지,금액,예상 원가,남는 돈,시작일,마감일";
/** 엑셀이 수식으로 읽을 수 있는 첫 글자(OWASP CSV 주입 목록: = + - @ 탭 CR). */
const FORMULA_START = /^[=+\-@\t\r]/;

function zonedDateParts(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(iso));
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return { year: pick("year"), month: pick("month"), day: pick("day") };
}

/** 넘겨받은 시간대에서 그 시각이 속한 달(`YYYY-MM`). */
export function monthKeyOf(iso: string, timeZone: string): string {
  const { year, month } = zonedDateParts(iso, timeZone);
  return `${year}-${month}`;
}

/** 넘겨받은 시간대에서 그 시각의 날짜(`YYYY-MM-DD`). */
export function dateKeyOf(iso: string, timeZone: string): string {
  const { year, month, day } = zonedDateParts(iso, timeZone);
  return `${year}-${month}-${day}`;
}

/** `YYYY-MM`에서 몇 달 앞뒤로 옮긴 달. */
export function shiftMonth(month: string, delta: number): string {
  const [year, value] = month.split("-").map(Number);
  const index = year * 12 + (value - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

function isValidTime(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

/** 완료 일감의 기준 시각. 완료 시각이 없던 예전 저장본은 마지막 수정 시각으로 넣고 추정이라고 표시한다. */
function completionOf(job: Job): Omit<MonthlySummaryRow, "job"> | null {
  if (job.status !== "completed") return null;
  if (isValidTime(job.completedAt)) return { completedAt: job.completedAt, completedAtEstimated: false };
  if (isValidTime(job.updatedAt)) return { completedAt: job.updatedAt, completedAtEstimated: true };
  return null;
}

function completedRows(jobs: Job[], inRange: (month: string) => boolean, timeZone: string): MonthlySummaryRow[] {
  const rows: MonthlySummaryRow[] = [];
  for (const job of jobs) {
    const completion = completionOf(job);
    if (completion && inRange(monthKeyOf(completion.completedAt, timeZone))) rows.push({ job, ...completion });
  }
  return rows;
}

/** 한 달 정리: 그달 완료 주문 합계·받은 곳별 합계·목록(늦게 완료한 것부터), 진행 중 주문은 합계 밖 한 줄. */
export function monthlySummary(jobs: Job[], month: string, timeZone: string): MonthlySummary {
  const rows = completedRows(jobs, (key) => key === month, timeZone)
    .sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt));
  const totals = { amount: 0, estimatedCost: 0, margin: 0, count: rows.length };
  const groups = new Map<OrderSource | "none", { amount: number; count: number }>();
  for (const { job } of rows) {
    totals.amount += job.amount;
    totals.estimatedCost += job.estimatedCost;
    const key = normalizeOrderSource(job.source) ?? "none";
    const group = groups.get(key) ?? { amount: 0, count: 0 };
    groups.set(key, { amount: group.amount + job.amount, count: group.count + 1 });
  }
  totals.margin = totals.amount - totals.estimatedCost;

  const bySource: MonthlySummary["bySource"] = [];
  for (const key of [...ORDER_SOURCES, "none" as const]) {
    const group = groups.get(key);
    if (group) bySource.push({ source: key, label: key === "none" ? NO_SOURCE_LABEL : ORDER_SOURCE_LABELS[key], ...group });
  }

  const active = jobs.filter((job) => job.status === "active");
  return {
    month,
    totals,
    bySource,
    rows,
    inProgress: { amount: active.reduce((sum, job) => sum + job.amount, 0), count: active.length },
  };
}

/** 글 칸: 큰따옴표로 감싸고(안의 "는 ""), 수식으로 읽힐 첫 글자 앞에는 '를 붙인다. */
function textCell(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** 숫자 칸: 엑셀이 숫자로 더할 수 있게 따옴표 없이 둔다(손해인 음수도 숫자). */
function numberCell(value: number): string {
  return Number.isFinite(value) ? String(Math.round(value)) : "0";
}

/**
 * 표 파일(CSV). 엑셀에서 한글이 안 깨지게 BOM, 줄바꿈 CRLF, 완료일 순(오래된 것부터).
 * 링크 토큰·수정 요청 내용은 넣지 않는다. 브라우저 안에서 만들어 사용자 기기로만 내려간다.
 */
export function summaryCsv(jobs: Job[], range: SummaryCsvRange, timeZone: string): string {
  const inRange = range.kind === "month"
    ? (key: string) => key === range.month
    : (key: string) => key.startsWith(`${range.year}-`);
  const rows = completedRows(jobs, inRange, timeZone)
    .sort((a, b) => Date.parse(a.completedAt) - Date.parse(b.completedAt));
  const lines = [CSV_HEADER];
  for (const { job, completedAt } of rows) {
    lines.push([
      textCell(dateKeyOf(completedAt, timeZone)),
      textCell(job.clientLabel),
      textCell(displayJobTitle(job)),
      textCell(orderSourceLabel(job.source) ?? ""),
      textCell(job.packageSnapshot.name),
      numberCell(job.amount),
      numberCell(job.estimatedCost),
      numberCell(job.amount - job.estimatedCost),
      textCell(job.startDate),
      textCell(job.dueDate),
    ].join(","));
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}

export function summaryCsvFileName(range: SummaryCsvRange): string {
  return `ilgamcheck-매출-${range.kind === "month" ? range.month : range.year}.csv`;
}
