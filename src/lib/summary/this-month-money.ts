import { jobFee, type Job } from "@/lib/domain";
import { monthlySummary } from "./monthly";

/**
 * 오늘 화면 '이번 달 돈' 카드 숫자. 새 계산 규칙을 만들지 않고 기존 함수만 묶는다.
 * - 작업 중 = 월별 정리의 '진행 중' 합계(진행 중 일감 전체, 월별 정리 화면과 같은 값)
 * - 완료 = 월별 정리의 그달 완료 합계
 * - 수수료 = 진행 중 일감마다 jobFee + 월별 정리의 그달 완료 수수료
 * - 받을 돈 = 작업 중 + 완료 − 수수료(수수료가 0이면 그냥 합계)
 */
export type ThisMonthMoney = {
  total: number;
  inProgress: { amount: number; count: number };
  completed: { amount: number; count: number };
  fee: number;
};

export function thisMonthMoney(jobs: Job[], month: string, timeZone: string): ThisMonthMoney {
  const summary = monthlySummary(jobs, month, timeZone);
  const activeFee = jobs.filter((job) => job.status === "active").reduce((sum, job) => sum + jobFee(job), 0);
  const fee = activeFee + summary.totals.fee;
  return {
    total: summary.inProgress.amount + summary.totals.amount - fee,
    inProgress: { amount: summary.inProgress.amount, count: summary.inProgress.count },
    completed: { amount: summary.totals.amount, count: summary.totals.count },
    fee,
  };
}
