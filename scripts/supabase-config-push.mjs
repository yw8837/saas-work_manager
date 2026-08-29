import nextEnv from "@next/env";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  configPushInvocation,
  normalizeAuthSiteUrl,
  renderHostedSupabaseConfig,
} from "./supabase-config-push-policy.mjs";
import { authConfigApplyAck, verifyLinkedSupabaseProject } from "./supabase-project-guard.mjs";
import { verifyHostedAuthOrigin } from "./sites-origin-guard.mjs";
import { recordAuthConfigReceipt } from "./deployment-receipt.mjs";
import { minimalChildEnvironment } from "./minimal-child-environment.mjs";

if (process.argv.includes("--help")) {
  console.log("사용법: SUPABASE_AUTH_SITE_URL=https://PREVIEW_OR_DOMAIN npm run supabase:config:push");
  console.log("검증된 연결 project ref가 들어간 ILGAMCHECK_AUTH_CONFIG_PUSH_ACK 확인값도 필요합니다.");
  console.log("Google 로그인 ON·이메일 로그인 OFF와 해당 origin의 /today·/settings를 원격 Auth 설정에 반영합니다.");
  process.exit(0);
}

const { loadEnvConfig } = nextEnv;
const shellAuthConfigAcknowledgement = process.env.ILGAMCHECK_AUTH_CONFIG_PUSH_ACK;
loadEnvConfig(process.cwd());
delete process.env.ILGAMCHECK_AUTH_CONFIG_PUSH_ACK;
if (shellAuthConfigAcknowledgement) {
  process.env.ILGAMCHECK_AUTH_CONFIG_PUSH_ACK = shellAuthConfigAcknowledgement;
}

let siteUrl;
try {
  siteUrl = normalizeAuthSiteUrl(process.env.SUPABASE_AUTH_SITE_URL);
} catch (error) {
  console.error(`[supabase-config] ${error.message}`);
  process.exit(1);
}

let linkedProject;
try {
  linkedProject = verifyLinkedSupabaseProject();
} catch (error) {
  console.error(`[supabase-config] 원격 대상 검증 실패: ${error.message}`);
  process.exit(1);
}
const projectRef = linkedProject.projectRef;
try {
  verifyHostedAuthOrigin({ authOrigin: siteUrl });
} catch (error) {
  console.error(`[supabase-config] Auth origin 검증 실패: ${error.message}`);
  process.exit(1);
}
const requiredAck = authConfigApplyAck(projectRef);
if (process.env.ILGAMCHECK_AUTH_CONFIG_PUSH_ACK !== requiredAck) {
  console.error(`[supabase-config] ILGAMCHECK_AUTH_CONFIG_PUSH_ACK=${requiredAck} 확인이 필요합니다.`);
  process.exit(1);
}

let hostedConfig;
try {
  hostedConfig = renderHostedSupabaseConfig(
    readFileSync(join(process.cwd(), "supabase", "config.toml"), "utf8"),
    siteUrl,
  );
} catch (error) {
  console.error(`[supabase-config] ${error.message}`);
  process.exit(1);
}

const temporaryRoot = mkdtempSync(join(tmpdir(), "ilgamcheck-supabase-config-"));
try {
  const supabaseDirectory = join(temporaryRoot, "supabase");
  mkdirSync(supabaseDirectory);
  writeFileSync(join(supabaseDirectory, "config.toml"), hostedConfig, { encoding: "utf8", flag: "wx" });

  const command = configPushInvocation(projectRef, temporaryRoot);
  console.log(`[supabase-config] APPLY — ${siteUrl}, Google 로그인 ON·이메일 로그인 OFF를 원격 프로젝트에 반영합니다.`);
  const result = spawnSync(command.executable, command.args, {
    // Supabase prefers a config in the process CWD over --workdir in some CLI
    // versions. Run from the isolated temporary root so only rendered hosted
    // redirects are eligible for the remote write.
    cwd: temporaryRoot,
    env: minimalChildEnvironment(process.env),
    stdio: "inherit",
    shell: false,
  });
  if (result.error) {
    console.error(`[supabase-config] CLI 실행 실패: ${result.error.message}`);
    process.exitCode = 1;
  } else if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
  } else {
    recordAuthConfigReceipt({ projectRef, origin: siteUrl });
    console.log("[supabase-config] 원격 Auth config push 완료. Dashboard에서도 Google 로그인 ON·이메일 로그인 OFF·redirect 2개를 교차 확인하세요.");
  }
} finally {
  const resolvedTemp = resolve(temporaryRoot);
  const resolvedSystemTemp = resolve(tmpdir());
  if (resolvedTemp.startsWith(`${resolvedSystemTemp}\\`) || resolvedTemp.startsWith(`${resolvedSystemTemp}/`)) {
    rmSync(resolvedTemp, { recursive: true, force: true });
  }
}
