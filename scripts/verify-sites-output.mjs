import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const required = [
  "dist/server/index.js",
  "dist/client/index.html",
  "dist/.openai/hosting.json",
];

for (const relativePath of required) {
  if (!existsSync(resolve(root, relativePath))) {
    console.error(`[verify-sites-output] missing ${relativePath}`);
    process.exit(1);
  }
}

const worker = readFileSync(resolve(root, "dist/server/index.js"), "utf8");
if (!worker.includes("__ILGAMCHECK_PUBLIC_ENV__") || !worker.includes("/api/health")) {
  console.error("[verify-sites-output] Worker runtime contract is incomplete");
  process.exit(1);
}

console.log("Sites output verified");
