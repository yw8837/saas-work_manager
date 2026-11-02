export type SecurityHeader = { key: string; value: string };

export function buildBearerRouteHeaders(): SecurityHeader[] {
  return [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }];
}

/**
 * 작업 화면(로그인 뒤)·API는 검색 결과에 남지 않게 한다. robots.txt로 막지 않고 이 헤더와
 * 작업 화면 layout의 robots 메타로 막는다(robots.txt로 막으면 크롤러가 noindex를 못 읽는다).
 */
export function buildPrivateAreaHeaders(): SecurityHeader[] {
  return [{ key: "X-Robots-Tag", value: "noindex, nofollow" }];
}

/** Next `headers()`에 거는 작업 화면·API 경로. `:path*`는 그 경로 자체와 하위 경로를 모두 맞춘다. */
export const PRIVATE_AREA_ROUTE_SOURCES = [
  "/today/:path*",
  "/jobs/:path*",
  "/packages/:path*",
  "/settings/:path*",
  "/feedback/:path*",
  "/auth/:path*",
  "/api/:path*",
] as const;

/** Sites Worker가 쓰는 같은 경로 판정(위 목록과 같은 경로). */
export function isPrivateAreaPath(pathname: string): boolean {
  return /^\/(?:today|jobs|packages|settings|feedback|auth|api)(?:\/|$)/.test(pathname);
}

function configuredSupabaseSources(value = process.env.NEXT_PUBLIC_SUPABASE_URL): string[] {
  if (!value) return [];

  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return [];
    return [url.origin, `wss://${url.host}`];
  } catch {
    return [];
  }
}

export function buildContentSecurityPolicy(
  isDevelopment = process.env.NODE_ENV === "development",
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL,
): string {
  const connectSources = ["'self'", ...configuredSupabaseSources(supabaseUrl)];
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connectSources.join(" ")}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];

  if (!isDevelopment) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

export function buildSecurityHeaders(
  isDevelopment = process.env.NODE_ENV === "development",
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL,
): SecurityHeader[] {
  const headers = [
    { key: "Content-Security-Policy", value: buildContentSecurityPolicy(isDevelopment, supabaseUrl) },
    { key: "Referrer-Policy", value: "no-referrer" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  ];
  if (!isDevelopment) {
    headers.push({ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" });
  }
  return headers;
}
