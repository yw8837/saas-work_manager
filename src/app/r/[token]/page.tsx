import type { Metadata } from "next";

import { PublicRevisionForm } from "@/components/public-revision-form";
import { CUSTOMER_LINK_OPEN_GRAPH, CUSTOMER_LINK_TWITTER } from "@/lib/site-meta";

// 공유 미리보기는 소개용 슬로건·그림 대신 차분한 값(고객이 광고로 오해하지 않게).
export const metadata: Metadata = {
  robots: "noindex, nofollow, noarchive",
  openGraph: CUSTOMER_LINK_OPEN_GRAPH,
  twitter: CUSTOMER_LINK_TWITTER,
};

export default async function RevisionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicRevisionForm token={token} />;
}
