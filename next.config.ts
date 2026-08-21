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
    ];
  },
};

export default nextConfig;
