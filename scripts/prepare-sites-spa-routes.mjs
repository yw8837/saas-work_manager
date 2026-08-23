import { copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Sites serves a static artifact before the Worker sees a route miss. Materialize
// the finite app routes so direct bookmarks preserve their original URL.
export const SITES_STATIC_SPA_ROUTES = [
  "today", "jobs", "jobs/new", "packages", "settings", "feedback", "auth/reset", "privacy", "terms",
];

export async function prepareSitesSpaRoutes(clientDirectory) {
  const directory = resolve(clientDirectory);
  const shell = resolve(directory, "index.html");
  for (const route of SITES_STATIC_SPA_ROUTES) {
    const destinationDirectory = resolve(directory, route);
    await mkdir(destinationDirectory, { recursive: true });
    await copyFile(shell, resolve(destinationDirectory, "index.html"));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await prepareSitesSpaRoutes(process.argv[2] ?? "dist/client");
}
