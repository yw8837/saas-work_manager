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

/**
 * Sites Worker가 쓰는 같은 경로 판정(위 목록과 같은 경로). Sites 라우터처럼 대소문자를 가리지 않는다
 * (`/JOBS`도 같은 화면이 열린다). 끝 슬래시(`/jobs/`)는 `(?:\/|$)`가 이미 받는다.
 */
export function isPrivateAreaPath(pathname: string): boolean {
  return /^\/(?:today|jobs|packages|settings|feedback|auth|api)(?:\/|$)/i.test(pathname);
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

/**
 * Microsoft Clarity(방문 기록 도구)에 여는 주소. 공식 CSP 안내(learn.microsoft.com/clarity/setup-and-installation/clarity-csp)는
 * `https://*.clarity.ms https://c.bing.com`을 default-src에 넣으라고 한다. 우리 CSP는 script-src·connect-src·img-src를 따로 두므로
 * 그 셋에만 넣는다. 불러오기 스크립트(www.clarity.ms/tag/ID)와 본체(scripts.clarity.ms)는 script, 기록 전송([a-z].clarity.ms/collect)은
 * connect, 불러오기 스크립트가 부르는 c.clarity.ms/c.gif 그림은 img로 쓴다(2026-11-13 공개 불러오기 스크립트에서 확인).
 * c.bing.com은 안내 목록에 있어 그림으로만 연다(어디서 부르는지는 확인하지 못했다).
 */
const CLARITY_SCRIPT_SOURCES = ["https://*.clarity.ms"];
const CLARITY_CONNECT_SOURCES = ["https://*.clarity.ms"];
const CLARITY_IMAGE_SOURCES = ["https://*.clarity.ms", "https://c.bing.com"];

export type ContentSecurityPolicyOptions = {
  /** Clarity를 쓰는 화면(메인·둘러보기) 문서에만 true. 다른 화면 문서는 Clarity 주소를 열지 않는다. */
  clarity?: boolean;
};

export function buildContentSecurityPolicy(
  isDevelopment = process.env.NODE_ENV === "development",
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL,
  { clarity = false }: ContentSecurityPolicyOptions = {},
): string {
  const scriptSources = ["'self'", "'unsafe-inline'", ...(isDevelopment ? ["'unsafe-eval'"] : []), ...(clarity ? CLARITY_SCRIPT_SOURCES : [])];
  const imageSources = ["'self'", "data:", "blob:", ...(clarity ? CLARITY_IMAGE_SOURCES : [])];
  const connectSources = ["'self'", ...configuredSupabaseSources(supabaseUrl), ...(clarity ? CLARITY_CONNECT_SOURCES : [])];
  const directives = [
    "default-src 'self'",
    `script-src ${scriptSources.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${imageSources.join(" ")}`,
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

/**
 * Clarity를 쓰는 두 화면(메인·둘러보기) 문서의 CSP. next.config.ts가 전역 CSP 뒤에 이 경로들만 덮어쓴다
 * (같은 헤더 이름이면 뒤 규칙이 이긴다: Next headers 문서, OpenNext getNextConfigHeaders도 같다).
 * 전역에 넣지 않는 이유: 작업 화면·고객 화면으로 처음 연 문서는 Clarity를 아예 받을 수 없게 해 두려는 것이다.
 */
export function buildClarityPageHeaders(
  isDevelopment = process.env.NODE_ENV === "development",
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL,
): SecurityHeader[] {
  return [{ key: "Content-Security-Policy", value: buildContentSecurityPolicy(isDevelopment, supabaseUrl, { clarity: true }) }];
}
