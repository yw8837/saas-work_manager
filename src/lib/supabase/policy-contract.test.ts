import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  POLICY_PUBLICATION_MANIFEST,
  PRIVACY_VERSION,
  TERMS_VERSION,
  currentPolicyAcceptance,
} from "@/lib/policies";
import { readPolicyAcceptanceState, recordCurrentPolicyAcceptance } from "./policy";

const MIGRATIONS = resolve(process.cwd(), "supabase/migrations");

/** 그 함수를 마지막으로 정의한 migration의, 마지막 정의 부분만 돌려준다. 파일 이름을 박아두면 버전을 올릴 때마다 낡는다. */
function latestFunctionDefinition(fn: string): string {
  const marker = `create or replace function public.${fn}(`;
  const file = readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .filter((name) => readFileSync(resolve(MIGRATIONS, name), "utf8").includes(marker))
    .at(-1);
  if (!file) return "";
  const body = readFileSync(resolve(MIGRATIONS, file), "utf8");
  const tail = body.slice(body.lastIndexOf(marker));
  const end = tail.indexOf("$$;", tail.indexOf("$$") + 2);
  return end < 0 ? tail : tail.slice(0, end);
}

const migration = readFileSync(resolve(MIGRATIONS, "202608160005_policy_acceptances.sql"), "utf8");
const currentAcceptanceFunction = latestFunctionDefinition("accept_current_policies");
const currentSignupTrigger = latestFunctionDefinition("record_signup_policy_acceptance");
const currentPublicationFunction = latestFunctionDefinition("get_ilgamcheck_policy_publication_contract");

describe("hosted policy acceptance contract", () => {
  it("keeps acceptance evidence immutable and owner-readable only", () => {
    expect(migration).toContain("create table public.policy_acceptances");
    expect(migration).toContain("alter table public.policy_acceptances enable row level security");
    expect(migration).toContain("policy_acceptances_owner_select");
    expect(migration).toContain("revoke all on table public.policy_acceptances from anon, authenticated");
    expect(migration).not.toMatch(/policy_acceptances_owner_(insert|update|delete)/);
  });

  it("records only the exact visible versions through a narrow authenticated RPC or signup trigger", () => {
    expect(currentAcceptanceFunction).toContain(`p_terms_version <> '${TERMS_VERSION}'`);
    expect(currentAcceptanceFunction).toContain(`p_privacy_version <> '${PRIVACY_VERSION}'`);
    expect(currentSignupTrigger).toContain(`->> 'ilgamcheck_terms_version' = '${TERMS_VERSION}'`);
    expect(currentSignupTrigger).toContain(`->> 'ilgamcheck_privacy_version' = '${PRIVACY_VERSION}'`);
    expect(currentSignupTrigger).toContain(`values (new.id, '${TERMS_VERSION}', '${PRIVACY_VERSION}', 'signup')`);
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("on_auth_user_record_policy_acceptance");
    expect(migration).toContain("new.raw_user_meta_data ->> 'ilgamcheck_policy_accepted' = 'true'");
    expect(migration).toContain("grant execute on function public.accept_current_policies(text, text) to authenticated");
    expect(migration).not.toContain("grant execute on function public.accept_current_policies(text, text) to anon");
    // 런타임 계약 버전은 이후 마이그레이션에서 올라간다. 그 검증은 runtime-contract.test.ts가 맡는다.
    expect(currentPublicationFunction).toContain(`'termsVersion', '${TERMS_VERSION}'`);
    expect(currentPublicationFunction).toContain(`'privacyVersion', '${PRIVACY_VERSION}'`);
    expect(currentPublicationFunction).toContain(`'bundleDigest', '${POLICY_PUBLICATION_MANIFEST.bundleDigest}'`);
    expect(currentPublicationFunction).toContain(`'finalized', ${POLICY_PUBLICATION_MANIFEST.finalized}`);
  });

  it("sends the current versions to the RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const client = { rpc } as unknown as SupabaseClient;

    await recordCurrentPolicyAcceptance(client, currentPolicyAcceptance());

    expect(rpc).toHaveBeenCalledWith("accept_current_policies", {
      p_terms_version: TERMS_VERSION,
      p_privacy_version: PRIVACY_VERSION,
    });
  });

  it("surfaces an RPC failure instead of pretending consent was stored", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({ error: { message: "migration missing" } }),
    } as unknown as SupabaseClient;

    await expect(recordCurrentPolicyAcceptance(client, currentPolicyAcceptance()))
      .rejects.toThrow("정책 동의 기록을 저장하지 못했어요: migration missing");
  });
});

describe("내 정책 동의 기록 상태(다시 동의 화면용)", () => {
  function fakeClient(result: { data: unknown; error: unknown }) {
    const select = vi.fn().mockResolvedValue(result);
    const from = vi.fn(() => ({ select }));
    return { client: { from, rpc: vi.fn() } as unknown as SupabaseClient, from, select };
  }

  it("기존 테이블 조회만 쓴다(새 RPC·새 권한 없음): 본인 행은 RLS가 거른다", async () => {
    const { client, from, select } = fakeClient({ data: [], error: null });
    await readPolicyAcceptanceState(client);
    expect(from).toHaveBeenCalledWith("policy_acceptances");
    expect(select).toHaveBeenCalledWith("terms_version, privacy_version");
    expect((client as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc).not.toHaveBeenCalled();
  });

  it("지금 버전 기록이 있으면 current", async () => {
    const { client } = fakeClient({ data: [
      { terms_version: "2026-08-24-beta.3", privacy_version: "2026-08-24-beta.3" },
      { terms_version: TERMS_VERSION, privacy_version: PRIVACY_VERSION },
    ], error: null });
    await expect(readPolicyAcceptanceState(client)).resolves.toBe("current");
  });

  it("예전 버전 기록만 있으면 outdated", async () => {
    const { client } = fakeClient({ data: [
      { terms_version: "2026-08-24-beta.3", privacy_version: "2026-08-24-beta.3" },
    ], error: null });
    await expect(readPolicyAcceptanceState(client)).resolves.toBe("outdated");
  });

  it("기록이 하나도 없으면 none(처음 가입)", async () => {
    const { client } = fakeClient({ data: [], error: null });
    await expect(readPolicyAcceptanceState(client)).resolves.toBe("none");
  });

  it("조회 실패는 숨기지 않는다", async () => {
    const { client } = fakeClient({ data: null, error: { message: "permission denied" } });
    await expect(readPolicyAcceptanceState(client))
      .rejects.toThrow("정책 동의 기록을 확인하지 못했어요: permission denied");
  });
});
