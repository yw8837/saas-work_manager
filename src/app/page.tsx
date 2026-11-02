import type { Metadata } from "next";

import { MarketingHome } from "@/components/marketing-home";
import { LANDING_DESCRIPTION, LANDING_TITLE, landingJsonLd, SITE_OPEN_GRAPH } from "@/lib/site-meta";

// 랜딩 전용 검색 제목·설명. 루트 layout의 제목 틀("%s | 일감체크")은 쓰지 않는다.
export const metadata: Metadata = {
  title: { absolute: LANDING_TITLE },
  description: LANDING_DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: { ...SITE_OPEN_GRAPH, url: "/" },
};

export default function HomePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: landingJsonLd() }} />
      <MarketingHome />
    </>
  );
}
