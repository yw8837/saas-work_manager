import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const worker = resolve(process.cwd(), ".open-next", "worker.js");
const assets = resolve(process.cwd(), ".open-next", "assets");
const requiredModules = [
  ".build/durable-objects/queue.js",
  ".build/durable-objects/sharded-tag-cache.js",
  ".build/durable-objects/bucket-cache-purge.js",
];

if (!existsSync(worker) || !existsSync(assets)) {
  throw new Error("OpenNext Worker 산출물 또는 정적 assets가 없습니다. npm run build:worker를 먼저 실행하세요.");
}

const source = readFileSync(worker, "utf8");
if (!source.includes("fetch")) {
  throw new Error("Worker 산출물에 fetch handler를 찾지 못했습니다.");
}

for (const relativePath of requiredModules) {
  const artifactPath = resolve(process.cwd(), ".open-next", relativePath);
  if (!existsSync(artifactPath)) {
    throw new Error(`Worker가 참조하는 ${relativePath} 파일이 없습니다. npm run build:worker를 마지막에 다시 실행하세요.`);
  }
}

console.log("worker output verified");
