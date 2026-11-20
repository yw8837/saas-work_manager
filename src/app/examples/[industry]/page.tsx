import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { IndustryExamples, INDUSTRY_PAGE_LEAD } from "@/components/industry-examples";
import { INDUSTRY_LABELS, INDUSTRY_ORDER, type Industry } from "@/lib/store/industry-starters";

// 업종마다 주소를 따로 준다(2026-11-20 허니북 벤치마킹: 홈의 업종 카드가 업종 전용 페이지로 간다).
export const dynamicParams = false;

export function generateStaticParams() {
  return INDUSTRY_ORDER.map((industry) => ({ industry }));
}

function asIndustry(value: string): Industry | null {
  return (INDUSTRY_ORDER as string[]).includes(value) ? (value as Industry) : null;
}

export async function generateMetadata({ params }: { params: Promise<{ industry: string }> }): Promise<Metadata> {
  const industry = asIndustry((await params).industry);
  if (!industry) return {};
  return {
    title: `${INDUSTRY_LABELS[industry]} 예시 패키지`,
    description: `${INDUSTRY_PAGE_LEAD[industry]} 금액·기간·포함 수정 횟수·시작 전 받을 자료를 보고 그대로 시작해요. 금액과 횟수는 예시예요.`,
    alternates: { canonical: `/examples/${industry}` },
  };
}

export default async function IndustryExamplesPage({ params }: { params: Promise<{ industry: string }> }) {
  const industry = asIndustry((await params).industry);
  if (!industry) notFound();
  return <IndustryExamples only={industry} />;
}
