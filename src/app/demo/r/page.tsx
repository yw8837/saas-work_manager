import type { Metadata } from "next";

import { CustomerRevisionDemo } from "@/components/customer-revision-demo";
import { CUSTOMER_LINK_OPEN_GRAPH, CUSTOMER_LINK_TWITTER } from "@/lib/site-meta";

// 공유 미리보기는 실제 고객 링크와 같은 차분한 값을 쓴다(소개용 슬로건·그림 대신).
export const metadata: Metadata = {
  title: "고객 화면 체험",
  description: "일감체크 고객 수정요청 링크를 로그인 없이 눌러 보는 예시 화면",
  robots: "noindex, nofollow, noarchive",
  openGraph: CUSTOMER_LINK_OPEN_GRAPH,
  twitter: CUSTOMER_LINK_TWITTER,
};

export default function CustomerRevisionDemoPage() {
  return <CustomerRevisionDemo />;
}
