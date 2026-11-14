import type { Metadata } from "next";

import { ClarityLoader, ClarityNotice } from "@/components/clarity";
import { TryTour } from "@/components/try-tour";

export const metadata: Metadata = {
  title: "가입 없이 둘러보기",
  description: "패키지 고르기, 고객 링크 보내기, 고객 수정 요청, 수정 완료 때 1회 차감까지 예시로 직접 눌러 보는 일감체크 소개 페이지",
  alternates: { canonical: "/try" },
};

export default function TryPage() {
  return (
    <>
      <TryTour footerNote={<ClarityNotice />} />
      <ClarityLoader />
    </>
  );
}
