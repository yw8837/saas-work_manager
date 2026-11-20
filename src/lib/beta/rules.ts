import type { BetaConcurrentJobs } from "./apply-copy";

/**
 * 적격: 패키지 판매 = 예 그리고 동시 진행 2~3건 또는 4건 이상(신청폼-항목 v3).
 * 하는 일(웹·디자인·기타)은 판정을 바꾸지 않는다. DB(submit_beta_application)와 같은 규칙이다.
 */
export function isBetaEligible(sellsPackages: boolean, concurrentJobs: BetaConcurrentJobs): boolean {
  return sellsPackages && (concurrentJobs === "2-3" || concurrentJobs === "4+");
}

export type BetaAdStatus = "none" | "pending" | "active" | "withdrawn";

export const AD_STATUS_LABELS: Record<BetaAdStatus, string> = {
  none: "신규 미동의",
  pending: "동의(확인 대기)",
  active: "동의(유효)",
  withdrawn: "철회·거부",
};

export type BetaNoticeKind = "consent" | "refuse" | "withdraw";

export const NOTICE_KIND_LABELS: Record<BetaNoticeKind, string> = {
  consent: "동의",
  refuse: "거부",
  withdraw: "철회",
};

/** 처리결과 통지 마감: 의사표시일부터 14일. */
export const NOTICE_DEADLINE_DAYS = 14;

export function noticeDueAt(occurredAt: Date): Date {
  return new Date(occurredAt.getTime() + NOTICE_DEADLINE_DAYS * 24 * 60 * 60 * 1000);
}

/** 한국 시간 기준 YYYY-MM-DD. */
export function koreanDate(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) throw new Error("INVALID_DATE");
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function normalizeBetaEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** DB의 주소 형식 검사와 같은 식. 화면에서 먼저 알려 주기 위한 것이고, 최종 판정은 DB가 한다. */
export function isValidBetaEmail(value: string): boolean {
  const email = normalizeBetaEmail(value);
  return email.length >= 6 && email.length <= 254
    && /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(email);
}

/** 확인·수신거부 링크 토큰 형식(43~128자 base64url). 형식이 틀리면 서버에 묻지 않는다. */
export function isWellFormedBetaToken(token: string): boolean {
  return token.length >= 43 && token.length <= 128 && /^[A-Za-z0-9_-]+$/.test(token);
}
