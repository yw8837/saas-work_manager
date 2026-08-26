import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Sites serves a static artifact before the Worker sees a route miss. Materialize
// the finite app routes so direct bookmarks preserve their original URL.
export const SITES_STATIC_SPA_ROUTES = [
  "today", "jobs", "jobs/new", "packages", "settings", "feedback", "auth/reset", "privacy", "terms",
];

export const SITES_STATIC_SECURITY_HEADERS = `/*
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests
  Referrer-Policy: no-referrer
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), microphone=(), geolocation=(), browsing-topics=()
  Strict-Transport-Security: max-age=31536000; includeSubDomains
`;

export async function prepareSitesSpaRoutes(clientDirectory) {
  const directory = resolve(clientDirectory);
  const shell = resolve(directory, "index.html");
  for (const route of SITES_STATIC_SPA_ROUTES) {
    const destinationDirectory = resolve(directory, route);
    await mkdir(destinationDirectory, { recursive: true });
    await copyFile(shell, resolve(destinationDirectory, "index.html"));
  }
  await writeFile(resolve(directory, "_headers"), SITES_STATIC_SECURITY_HEADERS, "utf8");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await prepareSitesSpaRoutes(process.argv[2] ?? "dist/client");
}
