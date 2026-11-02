import type { NextConfig } from "next";
import {
  buildBearerRouteHeaders,
  buildPrivateAreaHeaders,
  buildSecurityHeaders,
  PRIVATE_AREA_ROUTE_SOURCES,
} from "./src/lib/security/headers";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: buildSecurityHeaders(),
      },
      {
        source: "/r/:path*",
        headers: buildBearerRouteHeaders(),
      },
      {
        // 로그인 없이 여는 고객 화면 체험 링크. 콜드메일로 돌리므로 검색에는 노출하지 않는다.
        source: "/demo/:path*",
        headers: buildBearerRouteHeaders(),
      },
      // 작업 화면·API(초대 주소 `/today?invite=`, JSON 포함)는 검색에서 뺀다. 공개 페이지(/, /guide, /privacy, /terms)는 그대로 둔다.
      ...PRIVATE_AREA_ROUTE_SOURCES.map((source) => ({ source, headers: buildPrivateAreaHeaders() })),
    ];
  },
};

export default nextConfig;
