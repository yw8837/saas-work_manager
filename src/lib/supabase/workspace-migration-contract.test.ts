import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/202608150002_workspace_documents.sql"),
  "utf8",
);

describe("hosted workspace migration contract", () => {
  it("stores one RLS-protected canonical document per owner", () => {
    expect(sql).toContain("create table public.workspace_documents");
    expect(sql).toContain("owner_id uuid primary key");
    expect(sql).toContain("workspace_documents_owner_select");
    expect(sql).toContain("revoke all on table public.workspace_documents from anon, authenticated");
  });

  it("saves through authenticated optimistic concurrency and idempotency", () => {
    expect(sql).toContain("create or replace function public.save_workspace_document");
    expect(sql).toContain("v_owner uuid := auth.uid()");
    expect(sql).toContain("message = 'workspace_conflict'");
    expect(sql).toContain("workspace_save_requests");
    expect(sql).toMatch(
      /from public\.profiles as profile[\s\S]*?for update;[\s\S]*?from public\.workspace_save_requests as request/,
    );
  });

  it("keeps raw public tokens out of portal tables and rate-limits atomically", () => {
    expect(sql).toContain("token_hash text not null unique");
    expect(sql).toContain("extensions.digest(p_token, 'sha256')");
    expect(sql).toContain("for update");
    expect(sql).toContain("interval '3 seconds'");
    expect(sql).toContain("hourly_count >= 20");
    expect(sql).toContain("daily_count >= 100");
  });

  it("rejects a rotated token from the canonical workspace before idempotent replay", () => {
    expect(sql).toContain("and job ->> 'revisionPortalToken' = p_token");
    expect(sql).toMatch(
      /for update;[\s\S]*?job ->> 'revisionPortalToken' <> p_token[\s\S]*?select request\.\* into v_existing/,
    );
  });

  it("exposes only narrow RPCs to anonymous visitors", () => {
    expect(sql).toContain("grant execute on function public.get_workspace_revision_summary(text) to anon, authenticated");
    expect(sql).toContain("grant execute on function public.submit_workspace_revision_request(text, text, text, uuid) to anon, authenticated");
    expect(sql).not.toContain("grant select on table public.workspace_documents to anon");
  });
});
