import type { Job, OrderSource } from "./types";

/**
 * 받은 곳(크몽·숨고 등)에서 떼이는 비율(%). 작업자가 자기 계약·정산 내역대로 적고, 기본값은 전부 비어 있다(0 = 안 뗌).
 * 플랫폼·중개 수수료만 다룬다. 세금(원천징수 등) 계산은 하지 않는다. 고객 문구·고객 링크에는 쓰지 않는다.
 */

export type FeeRates = Partial<Record<OrderSource, number>>;

/** 정할 수 있는 가장 큰 비율(%). */
export const FEE_RATE_MAX = 100;

/** 저장본·설정에서 읽은 비율을 믿을 수 있는 값으로 바꾼다. 0~100 숫자만 받고 소수점 한 자리로 맞춘다. 아니면 0. */
export function normalizeFeeRate(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > FEE_RATE_MAX) return 0;
  return Math.round(value * 10) / 10;
}

/** 입력 글을 비율로 바꾼다. 빈칸은 0(안 뗌), 0~100에 소수점 한 자리까지만 받는다. 아니면 undefined. */
export function parseFeeRateInput(value: string): number | undefined {
  const text = value.trim();
  if (!text) return 0;
  if (!/^\d{1,3}(\.\d)?$/.test(text)) return undefined;
  const rate = Number(text);
  return rate <= FEE_RATE_MAX ? rate : undefined;
}

/** 설정에서 그 받은 곳의 비율. 받은 곳이 없거나 적지 않았으면 0. */
export function feeRateForSource(rates: FeeRates | undefined, source: OrderSource | undefined): number {
  if (!source || !rates) return 0;
  return normalizeFeeRate(rates[source]);
}

/** 일감을 만들 때 남긴 비율(스냅숏). 칸이 없던 예전 일감은 0. */
export function jobFeeRate(job: Pick<Job, "feeRate">): number {
  return normalizeFeeRate(job.feeRate);
}

/** 금액에서 떼이는 돈(원 단위 반올림). 소수 오차가 없게 비율을 10배 정수로 바꿔 곱한다. */
export function feeOf(amount: number, rate: number): number {
  const tenths = Math.round(normalizeFeeRate(rate) * 10);
  if (!Number.isFinite(amount) || tenths === 0) return 0;
  return Math.round((amount * tenths) / 1000);
}

/** 이 일감에서 떼이는 돈. 금액(주문 조건 + 확정한 추가요청) 전체에 같은 비율을 쓴다. */
export function jobFee(job: Pick<Job, "amount" | "feeRate">): number {
  return feeOf(job.amount, jobFeeRate(job));
}

/** 수수료 빼고 받는 돈. */
export function jobNetAmount(job: Pick<Job, "amount" | "feeRate">): number {
  return job.amount - jobFee(job);
}

/** 남는 돈(예상) = 금액 − 수수료 − 예상 원가. 일감의 `margin`은 늘 이 값으로 남긴다. */
export function marginAfterFee(amount: number, estimatedCost: number, rate: number): number {
  return amount - feeOf(amount, rate) - estimatedCost;
}

/** 확정한 추가요청 금액 합계(초안·취소는 뺀다). */
export function confirmedAddonAmount(job: Pick<Job, "addons">): number {
  return job.addons.reduce((sum, addon) => (addon.status === "confirmed" ? sum + addon.amountDelta : sum), 0);
}
