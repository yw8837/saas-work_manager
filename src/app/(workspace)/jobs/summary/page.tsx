import type { Metadata } from "next";
import { MonthlySummary } from "@/components/monthly-summary";

export const metadata: Metadata = { title: "월별 정리" };

// 정적 경로라 `/jobs/[id]`보다 먼저 맞는다. 달 경계는 화면(브라우저)의 시간대로 나눈다.
export default function MonthlySummaryPage() {
  return <MonthlySummary />;
}
