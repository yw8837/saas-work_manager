import nextEnv from "@next/env";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  collectHostedVerificationEnvIssues,
  createHostedVerificationState,
  hostedVerificationCredential,
  HOSTED_RUNTIME_CONTRACT,
  HOSTED_VERIFY_ACK,
} from "./verify-hosted-runtime-policy.mjs";

if (process.argv.includes("--help")) {
  console.log("전용 A/B 계정을 준비하고 이메일/비밀번호 또는 access/refresh token 한 쌍을 넣으세요.");
  console.log(`실행 전 ILGAMCHECK_HOSTED_VERIFY_ACK=${HOSTED_VERIFY_ACK} 동의가 필요합니다.`);
  console.log("주의: A 테스트 계정의 기존 작업공간을 검증 데이터로 덮어씁니다.");
  process.exit(0);
}

const { loadEnvConfig } = nextEnv;
const shellHostedVerificationAcknowledgement = process.env.ILGAMCHECK_HOSTED_VERIFY_ACK;
loadEnvConfig(process.cwd());
delete process.env.ILGAMCHECK_HOSTED_VERIFY_ACK;
if (shellHostedVerificationAcknowledgement) {
  process.env.ILGAMCHECK_HOSTED_VERIFY_ACK = shellHostedVerificationAcknowledgement;
}
const issues = collectHostedVerificationEnvIssues(process.env);
if (issues.length) {
  for (const issue of issues) console.error(`[hosted-verify] ${issue}`);
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
};
const clientA = createClient(url, key, clientOptions);
const clientB = createClient(url, key, clientOptions);
const anonymous = createClient(url, key, clientOptions);
let realtimeChannel;
let realtimeTimer;

function firstRow(data) {
  return Array.isArray(data) ? data[0] : data;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForSubscription(channel) {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Realtime SUBSCRIBED timeout")), 15_000);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timer);
        resolve();
      } else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
        clearTimeout(timer);
        reject(new Error(`Realtime subscribe 실패: ${status}`));
      }
    });
  });
}

async function signIn(client, credential, label) {
  const { data, error } = credential.mode === "session"
    ? await client.auth.setSession({
        access_token: credential.accessToken,
        refresh_token: credential.refreshToken,
      })
    : await client.auth.signInWithPassword({
        email: credential.email,
        password: credential.password,
      });
  if (error || !data.user) throw new Error(`${label} 로그인 실패: ${error?.message ?? "user 없음"}`);
  console.log(`[hosted-verify] PASS ${label} 로그인`);
  return data.user;
}

try {
  console.log("[hosted-verify] 경고: 명시 동의 확인됨. A 전용 테스트 계정 작업공간을 덮어씁니다.");
  const [{ data: contract, error: contractError }, userA, userB] = await Promise.all([
    anonymous.rpc("get_ilgamcheck_runtime_contract"),
    signIn(clientA, hostedVerificationCredential(process.env, "A"), "계정 A"),
    signIn(clientB, hostedVerificationCredential(process.env, "B"), "계정 B"),
  ]);
  if (contractError) throw new Error(`runtime contract RPC 실패: ${contractError.message}`);
  assert(contract === HOSTED_RUNTIME_CONTRACT, `runtime contract 불일치: ${String(contract)}`);
  assert(userA.id !== userB.id, "A/B가 같은 Auth 사용자입니다.");
  console.log(`[hosted-verify] PASS DB runtime contract ${contract}`);

  const { data: existing, error: existingError } = await clientA
    .from("workspace_documents")
    .select("document_version")
    .eq("owner_id", userA.id)
    .maybeSingle();
  if (existingError) throw new Error(`A 기존 workspace 조회 실패: ${existingError.message}`);

  const fixture = createHostedVerificationState();
  const { data: saved, error: saveError } = await clientA.rpc("save_workspace_document", {
    p_state: fixture.state,
    p_expected_version: existing?.document_version ?? 0,
    p_idempotency_key: fixture.saveIdempotencyKey,
  });
  if (saveError) throw new Error(`A workspace 저장 실패: ${saveError.message}`);
  assert(Number(firstRow(saved)?.document_version) >= 1, "A workspace 저장 receipt가 없습니다.");
  console.log("[hosted-verify] PASS A workspace RPC 저장");

  const { data: leaked, error: bReadError } = await clientB
    .from("workspace_documents")
    .select("owner_id")
    .eq("owner_id", userA.id);
  if (bReadError) throw new Error(`B 격리 조회 자체 실패: ${bReadError.message}`);
  assert(Array.isArray(leaked) && leaked.length === 0, "RLS 실패: B가 A workspace를 읽었습니다.");

  const { error: directWriteError } = await clientA
    .from("workspace_documents")
    .update({ updated_at: new Date().toISOString() })
    .eq("owner_id", userA.id);
  assert(Boolean(directWriteError), "권한 실패: authenticated 직접 UPDATE가 허용됐습니다.");
  console.log("[hosted-verify] PASS A/B select 격리 + 직접 DML 거부");

  const { error: portalError } = await clientA.rpc("register_workspace_revision_portal", {
    p_job_key: fixture.jobId,
    p_raw_token: fixture.token,
    p_enabled: true,
  });
  if (portalError) throw new Error(`공개 portal 등록 실패: ${portalError.message}`);
  const { data: summary, error: summaryError } = await anonymous.rpc("get_workspace_revision_summary", {
    p_token: fixture.token,
  });
  if (summaryError) throw new Error(`공개 summary 실패: ${summaryError.message}`);
  assert(firstRow(summary)?.job_key === fixture.jobId, "공개 summary가 fixture 일감을 반환하지 않았습니다.");

  let realtimeResolve;
  const realtimeUpdate = new Promise((resolve, reject) => {
    realtimeResolve = (payload) => {
      clearTimeout(realtimeTimer);
      resolve(payload);
    };
    realtimeTimer = setTimeout(() => reject(new Error("Realtime UPDATE timeout")), 20_000);
  });
  await clientA.realtime.setAuth();
  realtimeChannel = clientA
    .channel(`hosted-verify-${randomUUID()}`)
    .on("postgres_changes", {
      event: "UPDATE",
      schema: "public",
      table: "workspace_documents",
      filter: `owner_id=eq.${userA.id}`,
    }, (payload) => realtimeResolve(payload));
  await waitForSubscription(realtimeChannel);

  const requestKey = randomUUID();
  const requestArgs = {
    p_token: fixture.token,
    p_body: `Hosted 검증 수정 요청 ${Date.now()}`,
    p_client_label: "HOSTED_VERIFY_CLIENT",
    p_idempotency_key: requestKey,
  };
  const firstSubmit = await anonymous.rpc("submit_workspace_revision_request", requestArgs);
  if (firstSubmit.error) throw new Error(`공개 수정 접수 실패: ${firstSubmit.error.message}`);
  const retrySubmit = await anonymous.rpc("submit_workspace_revision_request", requestArgs);
  if (retrySubmit.error) throw new Error(`동일 idempotency 재시도 실패: ${retrySubmit.error.message}`);
  const requestId = firstRow(firstSubmit.data)?.request_id;
  assert(requestId && firstRow(retrySubmit.data)?.request_id === requestId, "동일 idempotency가 같은 receipt를 반환하지 않았습니다.");
  const { data: evidence, error: evidenceError } = await clientA
    .from("workspace_revision_requests")
    .select("id")
    .eq("id", requestId);
  if (evidenceError) throw new Error(`수정 증거 조회 실패: ${evidenceError.message}`);
  assert(evidence?.length === 1, "동일 idempotency가 증거를 정확히 1개 남기지 않았습니다.");
  await realtimeUpdate;
  console.log("[hosted-verify] PASS 공개 summary/동일 idempotency 1건/Realtime UPDATE");

  const { data: latest, error: latestError } = await clientA
    .from("workspace_documents")
    .select("state, document_version")
    .eq("owner_id", userA.id)
    .single();
  if (latestError) throw new Error(`token rotate용 workspace 조회 실패: ${latestError.message}`);
  const newToken = randomBytes(32).toString("base64url");
  const rotatedState = structuredClone(latest.state);
  rotatedState.jobs[0].revisionPortalToken = newToken;
  rotatedState.jobs[0].updatedAt = new Date().toISOString();
  const rotateSave = await clientA.rpc("save_workspace_document", {
    p_state: rotatedState,
    p_expected_version: latest.document_version,
    p_idempotency_key: randomUUID(),
  });
  if (rotateSave.error) throw new Error(`token rotate 저장 실패: ${rotateSave.error.message}`);
  const rotatePortal = await clientA.rpc("register_workspace_revision_portal", {
    p_job_key: fixture.jobId,
    p_raw_token: newToken,
    p_enabled: true,
  });
  if (rotatePortal.error) throw new Error(`token rotate portal 동기화 실패: ${rotatePortal.error.message}`);
  const oldSummary = await anonymous.rpc("get_workspace_revision_summary", { p_token: fixture.token });
  const newSummary = await anonymous.rpc("get_workspace_revision_summary", { p_token: newToken });
  if (oldSummary.error || newSummary.error) throw new Error("token rotate summary RPC 호출 실패");
  assert(!firstRow(oldSummary.data), "token rotate 후 이전 token이 여전히 유효합니다.");
  assert(firstRow(newSummary.data)?.job_key === fixture.jobId, "token rotate 후 새 token이 유효하지 않습니다.");
  const oldSubmit = await anonymous.rpc("submit_workspace_revision_request", {
    p_token: fixture.token,
    p_body: "폐기된 토큰 접수 거부 확인",
    p_client_label: "HOSTED_VERIFY_CLIENT",
    p_idempotency_key: randomUUID(),
  });
  assert(Boolean(oldSubmit.error), "token rotate 후 이전 token으로 접수가 성공했습니다.");
  const newSubmit = await anonymous.rpc("submit_workspace_revision_request", {
    p_token: newToken,
    p_body: "새 토큰 접수 성공 확인",
    p_client_label: "HOSTED_VERIFY_CLIENT",
    p_idempotency_key: randomUUID(),
  });
  if (newSubmit.error || !firstRow(newSubmit.data)?.request_id) {
    throw new Error(`token rotate 후 새 token 접수 실패: ${newSubmit.error?.message ?? "receipt 없음"}`);
  }
  console.log("[hosted-verify] PASS token rotate 이전 링크 조회·접수 거부 + 새 링크 조회·접수 성공");
  console.log("[hosted-verify] PASS 실제 Hosted 런타임 핵심 계약 전체 통과.");
} catch (error) {
  console.error(`[hosted-verify] FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  clearTimeout(realtimeTimer);
  clientA.realtime.disconnect();
  clientB.realtime.disconnect();
  anonymous.realtime.disconnect();
  const cleanup = Promise.allSettled([
    realtimeChannel ? clientA.removeChannel(realtimeChannel) : Promise.resolve(),
    clientA.auth.signOut(),
    clientB.auth.signOut(),
    anonymous.auth.signOut(),
  ]);
  await Promise.race([cleanup, new Promise((resolve) => setTimeout(resolve, 5_000))]);
}

process.exit(process.exitCode ?? 0);
