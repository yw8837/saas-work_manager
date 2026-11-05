import type { Metadata } from "next";

import { IndustryExamples } from "@/components/industry-examples";

export const metadata: Metadata = {
  title: "업종별 예시 패키지",
  description: "웹·디자인·영상·촬영 예시 패키지의 금액·기간·포함 수정 횟수·시작 전 받을 자료를 보고 그대로 시작해요. 금액과 횟수는 예시예요.",
  alternates: { canonical: "/examples" },
};

export default function ExamplesPage() {
  return <IndustryExamples />;
}
