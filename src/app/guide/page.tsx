import type { Metadata } from "next";

import { UserGuide } from "@/components/user-guide";

export const metadata: Metadata = {
  title: "사용설명서",
  description: "가입부터 패키지·주문 등록, 고객 수정요청 링크와 추가 요청 처리까지 그림으로 보는 일감체크 사용설명서",
};

export default function GuidePage() {
  return <UserGuide />;
}
