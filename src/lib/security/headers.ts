export type SecurityHeader = { key: string; value: string };

export function buildBearerRouteHeaders(): SecurityHeader[] {
  return [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }];
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

export function buildContentSecurityPolicy(isDevelopment = process.env.NODE_ENV === "development"): string {
  const connectSources = ["'self'", ...configuredSupabaseSources()];
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

export function buildSecurityHeaders(isDevelopment = process.env.NODE_ENV === "development"): SecurityHeader[] {
  const headers = [
    { key: "Content-Security-Policy", value: buildContentSecurityPolicy(isDevelopment) },
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
