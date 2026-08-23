import { buildBearerRouteHeaders, buildSecurityHeaders } from "@/lib/security/headers";

export type SitesAssetBinding = {
  fetch(request: Request): Promise<Response>;
};

export type SitesEnvironment = {
  ASSETS?: SitesAssetBinding;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

const unavailable = () => new Response("일감체크 정적 파일을 불러오지 못했습니다.", { status: 503 });

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function isHtmlNavigation(request: Request) {
  return request.method === "GET" && request.headers.get("accept")?.includes("text/html");
}

function withSecurityHeaders(response: Response, request: Request): Response {
  const headers = new Headers(response.headers);
  for (const { key, value } of buildSecurityHeaders(false)) headers.set(key, value);
  if (/^\/r\/[^/]+$/.test(new URL(request.url).pathname)) {
    for (const { key, value } of buildBearerRouteHeaders()) headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function serveStatic(request: Request, environment: SitesEnvironment): Promise<Response> {
  if (!environment.ASSETS) return unavailable();
  const response = await environment.ASSETS.fetch(request);
  const location = response.headers.get("location");
  const redirectsUnknownRouteToRoot = (response.status === 307 || response.status === 308)
    && location === "/";
  if ((response.status !== 404 && !redirectsUnknownRouteToRoot) || !isHtmlNavigation(request)) {
    return withSecurityHeaders(response, request);
  }

  const appShellUrl = new URL(request.url);
  appShellUrl.pathname = redirectsUnknownRouteToRoot ? "/" : "/index.html";
  appShellUrl.search = "";
  return withSecurityHeaders(await environment.ASSETS.fetch(new Request(appShellUrl, request)), request);
}

function health(environment: SitesEnvironment): Response {
  const configured = Boolean(
    environment.SUPABASE_URL?.startsWith("https://")
    && environment.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
  return configured
    ? json({ status: "ok", ready: true }, 200)
    : json({ status: "misconfigured", ready: false }, 503);
}

const siteWorker = {
  async fetch(request: Request, environment: SitesEnvironment): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/health") return health(environment);
    if (pathname === "/api/account/delete" && request.method === "POST") {
      return handleAccountDeletion(request, environment);
    }
    return serveStatic(request, environment);
  },
};

export default siteWorker;
import { handleAccountDeletion } from "./account-delete";
