import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

import { minimalChildEnvironment } from "./minimal-child-environment.mjs";
import { supabaseNpxInvocation } from "./supabase-cli-policy.mjs";
import {
  assertVerificationCleanupResults,
  HOSTED_VERIFY_ACK,
} from "./verify-hosted-runtime-policy.mjs";

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
  const codeCleanup = await Promise.all([
    admin.from("invite_codes").delete().like("code", "VERIFYA%"),
    admin.from("invite_codes").delete().like("code", "VERIFYB%"),
  ]);
  assertVerificationCleanupResults([
    { label: "VERIFYA 코드 삭제", error: codeCleanup[0].error },
    { label: "VERIFYB 코드 삭제", error: codeCleanup[1].error },
  ]);
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) fail(`임시 검증 계정 조회 실패: ${error.message}`);
    const candidates = data.users.filter((user) => /^ilgamcheck\.verify\.[ab]\+.+@example\.com$/i.test(user.email ?? ""));
    const userCleanup = await Promise.all(candidates.map((user) => admin.auth.admin.deleteUser(user.id)));
    assertVerificationCleanupResults(userCleanup.map((result, index) => ({
      label: `임시 사용자 삭제 ${candidates[index].email}`,
      error: result.error,
    })));
    if (data.users.length < 1000) break;
  }
}

async function createVerificationSession(admin, userClient, email) {
  const generated = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = generated.data?.properties?.hashed_token;
  if (generated.error || !tokenHash) {
    fail(`임시 검증 세션 링크 생성 실패: ${generated.error?.message ?? "token 없음"}`);
  }
  const verified = await userClient.auth.verifyOtp({ type: "email", token_hash: tokenHash });
  if (verified.error || !verified.data.session || !verified.data.user) {
    fail(`임시 검증 세션 생성 실패: ${verified.error?.message ?? "session 없음"}`);
  }
  return verified.data.session;
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
  const emailA = `ilgamcheck.verify.a+${suffix}@example.com`;
  const emailB = `ilgamcheck.verify.b+${suffix}@example.com`;
  const codeA = `VERIFYA${randomBytes(8).toString("hex").toUpperCase()}`;
  const codeB = `VERIFYB${randomBytes(8).toString("hex").toUpperCase()}`;
  try {
    await cleanupVerificationArtifacts(admin);
    for (const email of [emailA, emailB]) {
      const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
      if (error || !data.user) fail(`임시 검증 계정 생성 실패: ${error?.message ?? "user 없음"}`);
    }

    const { error: codeError } = await admin.from("invite_codes").insert([
      { code: codeA, grant_days: 30, max_redemptions: 2 },
      { code: codeB, grant_days: 30, max_redemptions: 2 },
    ]);
    if (codeError) fail(`임시 베타 코드 생성 실패: ${codeError.message}`);

    const userA = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const userB = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const sessionA = await createVerificationSession(admin, userA, emailA);
    const sessionB = await createVerificationSession(admin, userB, emailB);
    const first = await userA.rpc("redeem_invite_code", { p_code: codeA });
    const second = await userA.rpc("redeem_invite_code", { p_code: codeB });
    const firstRow = Array.isArray(first.data) ? first.data[0] : first.data;
    const secondRow = Array.isArray(second.data) ? second.data[0] : second.data;
    if (first.error || firstRow?.status !== "ok") fail("첫 베타 코드가 30일 Pro를 부여하지 못했습니다.");
    if (second.error || secondRow?.status !== "already_redeemed") {
      fail("같은 계정의 두 번째 베타 코드 사용이 차단되지 않았습니다.");
    }
    console.log("[hosted-verify] PASS 계정당 1회 30일 베타 Pro 코드");

    const executable = process.execPath;
    const childEnvironment = minimalChildEnvironment(process.env, [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "NEXT_PUBLIC_STORAGE_MODE",
      "NEXT_PUBLIC_OPERATOR_NAME",
      "NEXT_PUBLIC_SUPPORT_EMAIL",
      "NEXT_PUBLIC_BETA_SIGNUP_ENABLED",
      "ILGAMCHECK_TEST_A_ACCESS_TOKEN",
      "ILGAMCHECK_TEST_A_REFRESH_TOKEN",
      "ILGAMCHECK_TEST_B_ACCESS_TOKEN",
      "ILGAMCHECK_TEST_B_REFRESH_TOKEN",
      "ILGAMCHECK_HOSTED_VERIFY_ACK",
    ]);
    Object.assign(childEnvironment, {
      NEXT_PUBLIC_SUPABASE_URL: url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
      ILGAMCHECK_TEST_A_ACCESS_TOKEN: sessionA.access_token,
      ILGAMCHECK_TEST_A_REFRESH_TOKEN: sessionA.refresh_token,
      ILGAMCHECK_TEST_B_ACCESS_TOKEN: sessionB.access_token,
      ILGAMCHECK_TEST_B_REFRESH_TOKEN: sessionB.refresh_token,
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
