import { jobFee, type Job } from "@/lib/domain";
import { monthlySummary } from "./monthly";

/**
 * 오늘 화면 '받을 돈' 카드 숫자. 새 계산 규칙을 만들지 않고 기존 함수만 묶는다.
 * - 진행 중 = 월별 정리의 '진행 중' 합계(진행 중 일감 전체, 월별 정리 화면과 같은 값)
 * - 수수료 = 진행 중 일감마다 jobFee
 * - 받을 돈 = 진행 중 − 수수료. 이미 끝난 일감은 더하지 않는다(마감이 다음 달인 진행 중 일감도 있어서 '이번 달'이라 부르지 않음).
 * - 완료 = 월별 정리의 그달 완료 합계(따로 보여 주기만 함)
 */
export type ThisMonthMoney = {
  receivable: number;
  inProgress: { amount: number; count: number };
  completed: { amount: number; count: number };
  fee: number;
};

export function thisMonthMoney(jobs: Job[], month: string, timeZone: string): ThisMonthMoney {
  const summary = monthlySummary(jobs, month, timeZone);
  const fee = jobs.filter((job) => job.status === "active").reduce((sum, job) => sum + jobFee(job), 0);
  return {
    receivable: summary.inProgress.amount - fee,
    inProgress: { amount: summary.inProgress.amount, count: summary.inProgress.count },
    completed: { amount: summary.totals.amount, count: summary.totals.count },
    fee,
  };
}
