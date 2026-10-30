import type { Metadata } from "next";

import { CustomerRevisionDemo } from "@/components/customer-revision-demo";

export const metadata: Metadata = {
  title: "고객 화면 체험",
  description: "일감체크 고객 수정요청 링크를 로그인 없이 눌러 보는 예시 화면",
  robots: "noindex, nofollow, noarchive",
};

export default function CustomerRevisionDemoPage() {
  return <CustomerRevisionDemo />;
}
