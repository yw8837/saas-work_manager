import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function normalizeIosPackagePaths(source) {
  return source.replace(/path:\s*"([^"]*)"/g, (_, path) => `path: "${path.replaceAll("\\", "/")}"`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const file = resolve("ios/App/CapApp-SPM/Package.swift");
  if (!existsSync(file)) throw new Error("Run cap sync ios before normalizing Swift package paths.");
  const source = readFileSync(file, "utf8");
  const normalized = normalizeIosPackagePaths(source);
  if (normalized !== source) writeFileSync(file, normalized);
  console.log("[mobile-ios] Generated Swift package paths normalized; Xcode compilation still required.");
}
