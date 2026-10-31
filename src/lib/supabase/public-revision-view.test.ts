import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getHostedPublicRevisionSummary } from "./workspace";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261031120000_public_revision_view.sql"),
  "utf8",
);

const token = "a".repeat(43);

function clientWith(responses: Record<string, { data: unknown; error: unknown }>) {
  const rpc = vi.fn(async (name: string) => responses[name] ?? { data: null, error: { message: "missing" } });
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe("고객 링크 공개 RPC(get_workspace_revision_view)", () => {
  it("익명 방문자에게 이 함수만 좁게 열고, 할 일 이름·금액은 내보내지 않는다", () => {
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("revoke all on function public.get_workspace_revision_view(text) from public");
    expect(sql).toContain("grant execute on function public.get_workspace_revision_view(text) to anon, authenticated");
    expect(sql).toContain("and job ->> 'revisionPortalToken' = p_token");
    expect(sql).toContain("and job ->> 'status' = 'active'");
    expect(sql).not.toMatch(/'amount'|'estimatedCost'|'margin'|'clientLabel'|'links'/);
    expect(sql).not.toMatch(/task ->> 'title'/);
  });

  it("작업자 이름은 설정에 적은 값만, 40자로 잘라 내보낸다", () => {
    expect(sql).toContain("v_settings ->> 'publicWorkerName'");
    expect(sql).toContain("left(btrim(");
    expect(sql).not.toContain("display_name");
  });
});

describe("getHostedPublicRevisionSummary", () => {
  it("새 함수가 있으면 마감·진행·이름까지 읽는다", async () => {
    const { client, rpc } = clientWith({
      get_workspace_revision_view: {
        data: [{
          job_key: "job_1", title: "랜딩", package_name: "기본", included: 3, used: 1, remaining: 2,
          due_date: "2026-11-12", tasks_total: 4, tasks_done: 2, has_open_revision: true, worker_name: "열매 디자인",
        }],
        error: null,
      },
    });
    await expect(getHostedPublicRevisionSummary(client, token)).resolves.toEqual({
      jobKey: "job_1", title: "랜딩", packageName: "기본", included: 3, used: 1, remaining: 2,
      dueDate: "2026-11-12", tasksTotal: 4, tasksDone: 2, hasOpenRevision: true, workerName: "열매 디자인",
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("새 함수가 없는 DB에서는 기존 요약 함수로 되돌아가고, 진행 정보는 비워 둔다", async () => {
    const { client, rpc } = clientWith({
      get_workspace_revision_view: { data: null, error: { code: "PGRST202", message: "Could not find the function" } },
      get_workspace_revision_summary: {
        data: [{ job_key: "job_1", title: "랜딩", package_name: "기본", included: 3, used: 1, remaining: 2 }],
        error: null,
      },
    });
    const summary = await getHostedPublicRevisionSummary(client, token);
    expect(summary).toEqual({ jobKey: "job_1", title: "랜딩", packageName: "기본", included: 3, used: 1, remaining: 2 });
    expect(summary?.tasksTotal).toBeUndefined();
    expect(rpc).toHaveBeenNthCalledWith(2, "get_workspace_revision_summary", { p_token: token });
  });

  it("꺼진 링크는 null", async () => {
    const { client } = clientWith({ get_workspace_revision_view: { data: [], error: null } });
    await expect(getHostedPublicRevisionSummary(client, token)).resolves.toBeNull();
  });
});
