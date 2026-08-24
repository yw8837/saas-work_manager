import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

import { minimalChildEnvironment } from "./minimal-child-environment.mjs";
import { supabaseNpxInvocation } from "./supabase-cli-policy.mjs";
import { HOSTED_VERIFY_ACK } from "./verify-hosted-runtime-policy.mjs";

function fail(message) {
  throw new Error(message);
}

function projectRefFromUrl(rawUrl) {
  const url = new URL(rawUrl);
  const match = url.hostname.match(/^([a-z0-9]{20})\.supabase\.co$/);
  if (url.protocol !== "https:" || !match) fail("Supabase URL 형식이 올바르지 않습니다.");
  return match[1];
}

function readServiceRoleKey(projectRef) {
  const command = supabaseNpxInvocation([
    "projects",
    "api-keys",
    "--project-ref",
    projectRef,
    "--reveal",
    "--output",
    "json",
  ]);
  const result = spawnSync(command.executable, command.args, {
    cwd: process.cwd(),
    env: minimalChildEnvironment(process.env),
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) fail("Supabase 테스트 자격 증명을 읽지 못했습니다.");

  let keys;
  try {
    keys = JSON.parse(result.stdout);
  } catch {
    fail("Supabase API key 응답 형식이 올바르지 않습니다.");
  }
  const modern = keys.find((entry) => entry?.type === "secret" && entry?.api_key?.startsWith("sb_secret_"));
  const legacy = keys.find((entry) => entry?.name === "service_role" && typeof entry?.api_key === "string");
  const key = modern?.api_key ?? legacy?.api_key;
  if (!key || key.includes("·")) fail("전체 service role key를 확인할 수 없습니다.");
  return key;
}

async function cleanupVerificationArtifacts(admin) {
  await admin.from("invite_codes").delete().like("code", "VERIFYA%");
  await admin.from("invite_codes").delete().like("code", "VERIFYB%");
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) fail(`임시 검증 계정 조회 실패: ${error.message}`);
    const candidates = data.users.filter((user) => /^ilgamcheck\.verify\.[ab]\+.+@example\.com$/i.test(user.email ?? ""));
    for (const user of candidates) await admin.auth.admin.deleteUser(user.id);
    if (data.users.length < 1000) break;
  }
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) fail("공개 Supabase URL과 anon key가 필요합니다.");
  const projectRef = projectRefFromUrl(url);
  const serviceRoleKey = readServiceRoleKey(projectRef);
  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const suffix = randomUUID();
  const passwordA = `${randomBytes(24).toString("base64url")}Aa1!`;
  const passwordB = `${randomBytes(24).toString("base64url")}Bb2!`;
  const emailA = `ilgamcheck.verify.a+${suffix}@example.com`;
  const emailB = `ilgamcheck.verify.b+${suffix}@example.com`;
  const codeA = `VERIFYA${randomBytes(8).toString("hex").toUpperCase()}`;
  const codeB = `VERIFYB${randomBytes(8).toString("hex").toUpperCase()}`;
  try {
    await cleanupVerificationArtifacts(admin);
    for (const [email, password] of [[emailA, passwordA], [emailB, passwordB]]) {
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !data.user) fail(`임시 검증 계정 생성 실패: ${error?.message ?? "user 없음"}`);
    }

    const { error: codeError } = await admin.from("invite_codes").insert([
      { code: codeA, grant_days: 30, max_redemptions: 2 },
      { code: codeB, grant_days: 30, max_redemptions: 2 },
    ]);
    if (codeError) fail(`임시 베타 코드 생성 실패: ${codeError.message}`);

    const user = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const signedIn = await user.auth.signInWithPassword({ email: emailA, password: passwordA });
    if (signedIn.error) fail(`베타 코드 검증 로그인 실패: ${signedIn.error.message}`);
    const first = await user.rpc("redeem_invite_code", { p_code: codeA });
    const second = await user.rpc("redeem_invite_code", { p_code: codeB });
    const firstRow = Array.isArray(first.data) ? first.data[0] : first.data;
    const secondRow = Array.isArray(second.data) ? second.data[0] : second.data;
    if (first.error || firstRow?.status !== "ok") fail("첫 베타 코드가 30일 Pro를 부여하지 못했습니다.");
    if (second.error || secondRow?.status !== "already_redeemed") {
      fail("같은 계정의 두 번째 베타 코드 사용이 차단되지 않았습니다.");
    }
    await user.auth.signOut();
    console.log("[hosted-verify] PASS 계정당 1회 30일 베타 Pro 코드");

    const executable = process.execPath;
    const childEnvironment = minimalChildEnvironment(process.env, [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "NEXT_PUBLIC_STORAGE_MODE",
      "NEXT_PUBLIC_OPERATOR_NAME",
      "NEXT_PUBLIC_SUPPORT_EMAIL",
      "NEXT_PUBLIC_BETA_SIGNUP_ENABLED",
      "ILGAMCHECK_TEST_A_EMAIL",
      "ILGAMCHECK_TEST_A_PASSWORD",
      "ILGAMCHECK_TEST_B_EMAIL",
      "ILGAMCHECK_TEST_B_PASSWORD",
      "ILGAMCHECK_HOSTED_VERIFY_ACK",
    ]);
    Object.assign(childEnvironment, {
      NEXT_PUBLIC_SUPABASE_URL: url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
      ILGAMCHECK_TEST_A_EMAIL: emailA,
      ILGAMCHECK_TEST_A_PASSWORD: passwordA,
      ILGAMCHECK_TEST_B_EMAIL: emailB,
      ILGAMCHECK_TEST_B_PASSWORD: passwordB,
      ILGAMCHECK_HOSTED_VERIFY_ACK: HOSTED_VERIFY_ACK,
    });
    const verify = spawnSync(executable, ["scripts/verify-hosted-runtime.mjs"], {
      cwd: process.cwd(),
      env: childEnvironment,
      stdio: "inherit",
      shell: false,
      windowsHide: true,
      timeout: 90_000,
    });
    if (verify.error || verify.status !== 0) fail("Hosted 핵심 계약 검증이 실패했습니다.");
    console.log("HOSTED_VERIFY PASS");
  } finally {
    await cleanupVerificationArtifacts(admin);
  }
}

main().catch((error) => {
  console.error(`[hosted-verify-ephemeral] FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
