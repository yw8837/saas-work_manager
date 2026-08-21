import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import nextEnv from "@next/env";
import {
  readRuntimeContract,
  runtimePublicConfigDigestFromEnv,
} from "./runtime-contract-readback-policy.mjs";

const { loadEnvConfig } = nextEnv;

export function loadRuntimeReadbackEnvironment({
  root = process.cwd(),
  env = process.env,
  argvTarget,
  loadEnv = loadEnvConfig,
} = {}) {
  loadEnv(root);
  return {
    target: argvTarget ?? env.SUPABASE_AUTH_SITE_URL ?? env.DEPLOYMENT_URL,
    expectedPublicConfigDigest: runtimePublicConfigDigestFromEnv(env),
  };
}

async function main() {
  if (process.argv.includes("--help")) {
    console.log("사용법: node scripts/runtime-contract-readback.mjs https://YOUR_DEPLOYMENT.example");
    console.log("인자를 생략하면 .env.local의 SUPABASE_AUTH_SITE_URL 또는 DEPLOYMENT_URL을 사용합니다.");
    console.log("연결된 supabase/.temp/project-ref와 health의 공개 project ref·설정 digest를 비교합니다.");
    return;
  }

  const { target, expectedPublicConfigDigest } = loadRuntimeReadbackEnvironment({
    argvTarget: process.argv[2],
  });

  try {
    let linkedProjectRef;
    try {
      linkedProjectRef = readFileSync(
        join(process.cwd(), "supabase", ".temp", "project-ref"),
        "utf8",
      ).trim();
    } catch {
      throw new Error("BLOCKED: Supabase 연결 정보가 없습니다. 먼저 supabase:link를 실행하세요.");
    }

    const result = await readRuntimeContract(target, linkedProjectRef, undefined, {
      expectedPublicConfigDigest,
    });
    console.log(
      `[runtime-contract-readback] PASS ${result.origin} Supabase ${result.supabaseProjectRefConfigured} runtime ${result.runtimeContract} service-role current policy ${result.policyPublication.bundleDigest}`,
    );
  } catch (error) {
    console.error(
      `[runtime-contract-readback] FAIL ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}

const isMain = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) await main();
