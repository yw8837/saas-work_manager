import { buildBearerRouteHeaders, buildSecurityHeaders } from "@/lib/security/headers";
import { POLICY_PUBLICATION_MANIFEST } from "@/lib/policies";
import {
  ILGAMCHECK_PUBLIC_ENV_KEYS,
  type IlgamcheckPublicEnvironment,
} from "@/lib/public-environment";
import {
  ILGAMCHECK_POLICY_PUBLICATION_CONTRACT,
  ILGAMCHECK_RUNTIME_CONTRACT,
} from "@/lib/supabase/runtime-contract";
import { probeHostedServiceRoleContract } from "@/lib/supabase/server-runtime-contract";
import { configuredSupabaseProjectRef } from "@/lib/supabase/mode";

export type SitesAssetBinding = {
  fetch(request: Request): Promise<Response>;
};

export type SitesEnvironment = {
  ASSETS?: SitesAssetBinding;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
} & IlgamcheckPublicEnvironment;

const unavailable = () => new Response("일감체크 정적 파일을 불러오지 못했습니다.", { status: 503 });
const NATIVE_PUBLIC_CONFIG_ORIGINS = new Set(["capacitor://localhost", "https://localhost"]);
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

function responseBody(response: Response): ReadableStream<Uint8Array> | null {
  return NULL_BODY_STATUSES.has(response.status) ? null : response.body;
}

function json(body: unknown, status: number, environment?: SitesEnvironment) {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  for (const { key, value } of buildSecurityHeaders(false, environment?.NEXT_PUBLIC_SUPABASE_URL)) {
    headers.set(key, value);
  }
  return new Response(JSON.stringify(body), {
    status,
    headers,
  });
}

function withNativePublicConfigCors(response: Response, request: Request): Response {
  const origin = request.headers.get("origin");
  if (!origin || !NATIVE_PUBLIC_CONFIG_ORIGINS.has(origin)) return response;
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Vary", "Origin");
  return new Response(responseBody(response), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function isHtmlNavigation(request: Request) {
  return request.method === "GET" && (
    new URL(request.url).pathname === "/"
    || request.headers.get("accept")?.includes("text/html")
  );
}

function withSecurityHeaders(
  response: Response,
  request: Request,
  environment: SitesEnvironment,
): Response {
  const headers = new Headers(response.headers);
  for (const { key, value } of buildSecurityHeaders(false, environment.NEXT_PUBLIC_SUPABASE_URL)) {
    headers.set(key, value);
  }
  if (/^\/r\/[^/]+$/.test(new URL(request.url).pathname)) {
    for (const { key, value } of buildBearerRouteHeaders()) headers.set(key, value);
  }
  return new Response(request.method === "HEAD" ? null : responseBody(response), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function publicEnvironment(environment: SitesEnvironment): IlgamcheckPublicEnvironment {
  const exposed: IlgamcheckPublicEnvironment = {};
  for (const key of ILGAMCHECK_PUBLIC_ENV_KEYS) {
    const value = environment[key];
    if (typeof value === "string") exposed[key] = value;
  }
  return exposed;
}

function serializedPublicEnvironment(environment: SitesEnvironment): string {
  return JSON.stringify(publicEnvironment(environment))
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

async function finalizeStaticResponse(
  response: Response,
  request: Request,
  environment: SitesEnvironment,
): Promise<Response> {
  const secured = withSecurityHeaders(response, request, environment);
  if (request.method === "HEAD" || NULL_BODY_STATUSES.has(secured.status)) return secured;
  if (!isHtmlNavigation(request) || !secured.headers.get("content-type")?.includes("text/html")) {
    return secured;
  }

  const html = await secured.text();
  const runtimeScript = `<script>globalThis.__ILGAMCHECK_PUBLIC_ENV__=${serializedPublicEnvironment(environment)};</script>`;
  const injectedHtml = html.includes("</head>")
    ? html.replace("</head>", `${runtimeScript}</head>`)
    : `${runtimeScript}${html}`;
  const headers = new Headers(secured.headers);
  headers.delete("content-length");
  return new Response(injectedHtml, {
    status: secured.status,
    statusText: secured.statusText,
    headers,
  });
}

async function serveStatic(request: Request, environment: SitesEnvironment): Promise<Response> {
  if (!environment.ASSETS) return unavailable();
  const response = await environment.ASSETS.fetch(request);
  const location = response.headers.get("location");
  const redirectsUnknownRouteToRoot = (response.status === 307 || response.status === 308)
    && location === "/";
  const { pathname } = new URL(request.url);
  const isRootHead = request.method === "HEAD" && pathname === "/";
  // Dynamic route identifiers may contain dots; missing files and APIs must not become the SPA.
  const isAssetOrApi = /^\/(?:api|assets)(?:\/|$)/.test(pathname)
    || (/\/[^/]+\.[^/]+$/.test(pathname) && !/^\/(?:jobs|r)\/[^/]+$/.test(pathname));
  if ((response.status !== 404 && !redirectsUnknownRouteToRoot)
    || isAssetOrApi
    || (!isHtmlNavigation(request) && !isRootHead)) {
    return finalizeStaticResponse(response, request, environment);
  }

  const appShellUrl = new URL(request.url);
  appShellUrl.pathname = "/app-shell.payload";
  appShellUrl.search = "";
  const appShell = await environment.ASSETS.fetch(new Request(appShellUrl, request));
  const appShellHeaders = new Headers(appShell.headers);
  appShellHeaders.set("Content-Type", "text/html; charset=utf-8");
  return finalizeStaticResponse(
    new Response(appShell.body, {
      status: appShell.status,
      statusText: appShell.statusText,
      headers: appShellHeaders,
    }),
    request,
    environment,
  );
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function normalizedText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function normalizedEmail(value: unknown): string | null {
  const normalized = normalizedText(value);
  return normalized && /^\S+@\S+\.\S+$/.test(normalized) ? normalized : null;
}

async function publicConfigState(environment: SitesEnvironment) {
  const operatorName = normalizedText(environment.NEXT_PUBLIC_OPERATOR_NAME);
  const supportEmail = normalizedEmail(environment.NEXT_PUBLIC_SUPPORT_EMAIL);
  const betaSignupEnabled = environment.NEXT_PUBLIC_BETA_SIGNUP_ENABLED === "true";
  const canonical = JSON.stringify({
    schema: "ilgamcheck-public-config/v1",
    operatorName,
    supportEmail,
    betaSignupEnabled,
  });
  return {
    publicConfigDigest: await sha256(canonical),
    publicIdentityConfigured: Boolean(operatorName && supportEmail),
    signupPolicyConfigured: betaSignupEnabled,
  };
}

async function health(environment: SitesEnvironment): Promise<Response> {
  const projectRef = configuredSupabaseProjectRef(environment.SUPABASE_URL);
  const publicProjectRef = configuredSupabaseProjectRef(environment.NEXT_PUBLIC_SUPABASE_URL);
  const hostedConfigured = Boolean(
    environment.NEXT_PUBLIC_STORAGE_MODE === "hosted"
    && projectRef
    && publicProjectRef === projectRef
    && environment.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
    && environment.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
  const [serviceRoleContractCurrent, publicConfig] = await Promise.all([
    hostedConfigured
      ? probeHostedServiceRoleContract(
        environment.SUPABASE_URL,
        environment.SUPABASE_SERVICE_ROLE_KEY,
      )
      : false,
    publicConfigState(environment),
  ]);
  const ready = Boolean(
    hostedConfigured
    && serviceRoleContractCurrent
    && publicConfig.publicIdentityConfigured
    && publicConfig.signupPolicyConfigured,
  );
  const policyPublication = {
    finalized: POLICY_PUBLICATION_MANIFEST.finalized,
    bundleDigest: POLICY_PUBLICATION_MANIFEST.bundleDigest,
    termsVersion: POLICY_PUBLICATION_MANIFEST.documents.terms.version,
    privacyVersion: POLICY_PUBLICATION_MANIFEST.documents.privacy.version,
    termsContentDigest: POLICY_PUBLICATION_MANIFEST.documents.terms.contentDigest,
    privacyContentDigest: POLICY_PUBLICATION_MANIFEST.documents.privacy.contentDigest,
    databaseExpected: ILGAMCHECK_POLICY_PUBLICATION_CONTRACT,
    databaseDetected: serviceRoleContractCurrent ? ILGAMCHECK_POLICY_PUBLICATION_CONTRACT : null,
    databaseMatches: serviceRoleContractCurrent,
  };

  return json({
    status: ready ? "ok" : "misconfigured",
    ready,
    service: "ilgamcheck",
    version: "0.1.0",
    runtimeRequested: "hosted",
    runtimeEffective: hostedConfigured ? "hosted" : "local",
    hostedConfigured,
    supabaseProjectRefConfigured: projectRef,
    hostedAdapterReady: hostedConfigured,
    publicConfigDigest: publicConfig.publicConfigDigest,
    publicIdentityConfigured: publicConfig.publicIdentityConfigured,
    signupPolicyConfigured: publicConfig.signupPolicyConfigured,
    databaseContractExpected: ILGAMCHECK_RUNTIME_CONTRACT,
    databaseContractDetected: serviceRoleContractCurrent ? ILGAMCHECK_RUNTIME_CONTRACT : null,
    serviceRoleContractCurrent,
    policyPublication,
  }, ready ? 200 : 503, environment);
}

const siteWorker = {
  async fetch(request: Request, environment: SitesEnvironment): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/public-config") {
      return withNativePublicConfigCors(
        json({ config: publicEnvironment(environment) }, 200, environment),
        request,
      );
    }
    if (pathname === "/api/health") return health(environment);
    if (pathname === "/api/account/delete" && request.method === "POST") {
      return handleAccountDeletion(request, environment);
    }
    return serveStatic(request, environment);
  },
};

export default siteWorker;
import { handleAccountDeletion } from "./account-delete";
