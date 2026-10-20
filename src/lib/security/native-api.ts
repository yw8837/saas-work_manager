const origins = new Set(["https://localhost", "capacitor://localhost"]);
const paths = new Map([
  ["/api/public-config", { methods: ["GET", "HEAD"], headers: [] }],
  ["/api/account/delete", { methods: ["POST"], headers: ["authorization", "content-type", "x-ilgamcheck-delete-confirm"] }],
]);

// Origin is a browser transport restriction, never proof of identity.
export function trustedAccountDeletionOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  if (origins.has(origin)) return true;
  try {
    return request.headers.get("sec-fetch-site") === "same-origin"
      && origin === new URL(request.url).origin;
  } catch { return false; }
}

export function withNativeApiCors(response: Response, request: Request): Response {
  const origin = request.headers.get("origin");
  if (!origin || !origins.has(origin) || !paths.has(new URL(request.url).pathname)) return response;
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  const vary = headers.get("Vary");
  headers.set("Vary", vary ? `${vary}, Origin` : "Origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function nativeApiPreflight(request: Request): Response {
  const origin = request.headers.get("origin");
  const contract = paths.get(new URL(request.url).pathname);
  const method = request.headers.get("access-control-request-method") ?? "";
  const headers = (request.headers.get("access-control-request-headers") ?? "")
    .split(",").map((name) => name.trim().toLowerCase()).filter(Boolean);
  if (request.method !== "OPTIONS" || !origin || !origins.has(origin) || !contract
    || !contract.methods.includes(method) || headers.some((name) => !contract.headers.includes(name))) {
    return new Response(null, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  return withNativeApiCors(new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store",
      "Access-Control-Allow-Methods": contract.methods.join(", "),
      "Access-Control-Allow-Headers": contract.headers.join(", "),
      "Vary": "Access-Control-Request-Method, Access-Control-Request-Headers",
    },
  }), request);
}
