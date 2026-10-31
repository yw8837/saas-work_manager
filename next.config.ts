import type { NextConfig } from "next";
import { buildBearerRouteHeaders, buildSecurityHeaders } from "./src/lib/security/headers";

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
      {
        // 베타 신청 주소 확인·수신거부 링크는 메일로만 전달하는 토큰 주소다. 운영자 화면도 검색에 노출하지 않는다.
        source: "/apply/confirm/:path*",
        headers: buildBearerRouteHeaders(),
      },
      {
        source: "/u/:path*",
        headers: buildBearerRouteHeaders(),
      },
      {
        source: "/ops/:path*",
        headers: buildBearerRouteHeaders(),
      },
    ];
  },
};

export default nextConfig;
