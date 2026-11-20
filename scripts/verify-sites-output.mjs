import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const required = [
  "dist/server/index.js",
  "dist/client/app-shell.payload",
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

if (existsSync(resolve(root, "dist/client/index.html"))
  || existsSync(resolve(root, "dist/client/today/index.html"))
  || existsSync(resolve(root, "dist/client/apply/index.html"))
  || existsSync(resolve(root, "dist/client/ops/applications/index.html"))) {
  console.error("[verify-sites-output] HTML navigation can bypass the Worker security boundary");
  process.exit(1);
}

// 베타 신청·주소 확인·수신거부·운영자 화면이 Sites 셸(SPA) 번들에 들어 있어야 Worker가 넘긴 셸에서 열린다.
const assetsDirectory = resolve(root, "dist/client/assets");
const clientBundle = existsSync(assetsDirectory)
  ? readdirSync(assetsDirectory).filter((name) => name.endsWith(".js"))
    .map((name) => readFileSync(resolve(assetsDirectory, name), "utf8")).join("\n")
  : "";
for (const marker of ["/apply/confirm/:token", "/u/:token", "/ops/applications", "submit_beta_application"]) {
  if (!clientBundle.includes(marker)) {
    console.error(`[verify-sites-output] client shell is missing ${marker}`);
    process.exit(1);
  }
}

console.log("Sites output verified");
