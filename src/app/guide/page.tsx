import type { Metadata } from "next";

import { UserGuide } from "@/components/user-guide";

export const metadata: Metadata = {
  title: "사용설명서",
  description: "주문 등록, 시작 안내, 수정 범위 정리, 상황별 문구, 월별 정리를 그림으로 보는 일감체크 사용설명서",
  alternates: { canonical: "/guide" },
};

export default function GuidePage() {
  return <UserGuide />;
}
