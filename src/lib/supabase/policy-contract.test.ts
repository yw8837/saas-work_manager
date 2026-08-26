import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  POLICY_PUBLICATION_MANIFEST,
  PRIVACY_VERSION,
  TERMS_VERSION,
  currentPolicyAcceptance,
} from "@/lib/policies";
import { recordCurrentPolicyAcceptance } from "./policy";

const migration = readFileSync(resolve(
  process.cwd(),
  "supabase/migrations/202608160005_policy_acceptances.sql",
), "utf8");
const currentAcceptanceMigration = readFileSync(resolve(
  process.cwd(),
  "supabase/migrations/202608240010_public_signup_policy.sql",
), "utf8");
const currentPublicationMigration = readFileSync(resolve(
  process.cwd(),
  "supabase/migrations/202608260012_google_oauth_policy.sql",
), "utf8");

describe("hosted policy acceptance contract", () => {
  it("keeps acceptance evidence immutable and owner-readable only", () => {
    expect(migration).toContain("create table public.policy_acceptances");
    expect(migration).toContain("alter table public.policy_acceptances enable row level security");
    expect(migration).toContain("policy_acceptances_owner_select");
    expect(migration).toContain("revoke all on table public.policy_acceptances from anon, authenticated");
    expect(migration).not.toMatch(/policy_acceptances_owner_(insert|update|delete)/);
  });

  it("records only the exact visible versions through a narrow authenticated RPC or signup trigger", () => {
    expect(currentAcceptanceMigration).toContain(`p_terms_version <> '${TERMS_VERSION}'`);
    expect(currentAcceptanceMigration).toContain(`p_privacy_version <> '${PRIVACY_VERSION}'`);
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("on_auth_user_record_policy_acceptance");
    expect(migration).toContain("new.raw_user_meta_data ->> 'ilgamcheck_policy_accepted' = 'true'");
    expect(migration).toContain("grant execute on function public.accept_current_policies(text, text) to authenticated");
    expect(migration).not.toContain("grant execute on function public.accept_current_policies(text, text) to anon");
    // 런타임 계약 버전은 이후 마이그레이션에서 올라간다. 그 검증은 runtime-contract.test.ts가 맡는다.
    expect(currentPublicationMigration).toContain(`'termsVersion', '${TERMS_VERSION}'`);
    expect(currentPublicationMigration).toContain(`'privacyVersion', '${PRIVACY_VERSION}'`);
    expect(currentPublicationMigration).toContain(`'bundleDigest', '${POLICY_PUBLICATION_MANIFEST.bundleDigest}'`);
    expect(currentPublicationMigration).toContain(`'finalized', ${POLICY_PUBLICATION_MANIFEST.finalized}`);
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
