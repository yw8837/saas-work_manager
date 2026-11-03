import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getHostedPublicRevisionSummary } from "./workspace";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261031110217_public_revision_view.sql"),
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

describe("수정 완료 때 차감 migration(20261101140000)", () => {
  const pendingSql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20261101140000_revision_pending_and_intake.sql"),
    "utf8",
  );

  it("공개 제출은 확인 대기로만 기록하고 접수할 때 횟수를 세지 않는다", () => {
    expect(pendingSql).toContain("'usage', 'pending'");
    expect(pendingSql).toContain("check (usage in ('pending', 'used', 'extra_scope'))");
    expect(pendingSql).not.toContain("then 'used' else 'extra_scope'");
  });

  it("다시 만든 고객 조회 함수도 좁게 열고, 금액·연락처·할 일 이름은 내보내지 않는다", () => {
    // 같은 파일의 제출 함수는 고객이 적은 이름(clientLabel)을 원래대로 기록하므로, 조회 함수 부분만 본다.
    const viewSql = pendingSql.slice(pendingSql.indexOf("create function public.get_workspace_revision_view"));
    expect(viewSql.length).toBeGreaterThan(100);
    expect(viewSql).toContain("security definer");
    expect(viewSql).toContain("set search_path = ''");
    expect(viewSql).toContain("grant execute on function public.get_workspace_revision_view(text) to anon, authenticated");
    expect(viewSql).toContain("revoke all on function public.get_workspace_revision_view(text) from public");
    expect(viewSql).not.toMatch(/'amount'|'estimatedCost'|'margin'|'clientLabel'|'links'/);
    expect(viewSql).not.toMatch(/task ->> 'title'/);
    // 받을 자료는 이름만, 개수·길이를 잘라서 내보낸다.
    expect(viewSql).toContain("left(btrim(item ->> 'label'), 80)");
    expect(viewSql).toContain("limit 20");
  });
});

describe("완료 화면·요청 목록 migration(20261103120000)", () => {
  const statusSql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20261103120000_public_revision_status.sql"),
    "utf8",
  );
  const viewSql = statusSql.slice(statusSql.indexOf("create function public.get_workspace_revision_view"));

  it("조회 함수만 다시 만들고, 좁은 권한·고정 search_path를 지킨다", () => {
    expect(viewSql.length).toBeGreaterThan(100);
    expect(statusSql).toContain("drop function if exists public.get_workspace_revision_view(text);");
    expect(viewSql).toContain("security definer");
    expect(viewSql).toContain("set search_path = ''");
    expect(viewSql).toContain("revoke all on function public.get_workspace_revision_view(text) from public");
    expect(viewSql).toContain("grant execute on function public.get_workspace_revision_view(text) to anon, authenticated");
    // 제출 함수는 건드리지 않는다(완료된 링크로는 여전히 제출할 수 없다).
    expect(statusSql).not.toContain("submit_workspace_revision_request");
  });

  it("완료된 일감은 지금 토큰·작업자가 켜 둔 링크일 때만 보여 주고, 끈 링크·재발급 전 토큰은 막는다", () => {
    expect(viewSql).toContain("portal.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')");
    expect(viewSql).toContain("and job ->> 'revisionPortalToken' = p_token");
    expect(viewSql).toContain("and coalesce((job ->> 'revisionPortalEnabled')::boolean, false)");
    expect(viewSql).toContain("(job ->> 'status' = 'active' and portal.enabled)");
    expect(viewSql).toContain("job ->> 'status' = 'completed'");
    expect(viewSql).not.toContain("'archived'");
  });

  it("요청 목록은 고객 링크 요청의 원문·상태만 내보내고, 작업자 메모·이름·채널·금액은 없다", () => {
    expect(viewSql).toContain("revision ->> 'source' = 'public'");
    expect(viewSql).not.toMatch(/'revertReason'|'clientLabel'|'channel'|'referenceUrl'|'amount'|'estimatedCost'|'margin'|'links'/);
    expect(viewSql).not.toMatch(/task ->> 'title'/);
    expect(viewSql).toContain("limit 20");
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

  it("새 판 함수의 확인 대기 건수와 아직 못 받은 자료 이름을 읽고, 이상한 값은 버린다", async () => {
    const { client } = clientWith({
      get_workspace_revision_view: {
        data: [{
          job_key: "job_1", title: "랜딩", package_name: "기본", included: 3, used: 1, remaining: 2,
          due_date: null, tasks_total: 4, tasks_done: 2, has_open_revision: true, worker_name: null,
          pending_requests: 2, intake_pending: ["참고 이미지", "", 3, "  "],
        }],
        error: null,
      },
    });
    const summary = await getHostedPublicRevisionSummary(client, token);
    expect(summary?.pending).toBe(2);
    expect(summary?.intakePending).toEqual(["참고 이미지"]);
  });

  it("새 판 함수의 진행 상태·완료 시각·요청 목록을 읽고, 모르는 상태·이상한 값은 버린다", async () => {
    const { client } = clientWith({
      get_workspace_revision_view: {
        data: [{
          job_key: "job_1", title: "랜딩", package_name: "기본", included: 3, used: 1, remaining: 2,
          due_date: null, tasks_total: 4, tasks_done: 4, has_open_revision: true, worker_name: null,
          pending_requests: 0, intake_pending: [],
          job_status: "completed", completed_at: "2026-11-03T05:00:00.000Z",
          requests: [
            { status: "done", sequence: 1, submittedAt: "2026-11-02T05:00:00.000Z", body: "사진을 밝게" },
            { status: "pending", body: "문구 수정" },
            { status: "void", body: "모르는 상태" },
            { status: "extra", body: "" },
            { status: "rejected", body: 3 },
            "문자열",
          ],
        }],
        error: null,
      },
    });
    const summary = await getHostedPublicRevisionSummary(client, token);
    expect(summary?.jobStatus).toBe("completed");
    expect(summary?.completedAt).toBe("2026-11-03T05:00:00.000Z");
    expect(summary?.requests).toEqual([
      { status: "done", sequence: 1, submittedAt: "2026-11-02T05:00:00.000Z", body: "사진을 밝게" },
      { status: "pending", body: "문구 수정" },
    ]);
  });

  it("이전 판 함수(상태 열 없음)면 진행 중으로 보고 요청 목록은 비워 둔다", async () => {
    const { client } = clientWith({
      get_workspace_revision_view: {
        data: [{
          job_key: "job_1", title: "랜딩", package_name: "기본", included: 3, used: 1, remaining: 2,
          due_date: null, tasks_total: 4, tasks_done: 2, has_open_revision: true, worker_name: null,
        }],
        error: null,
      },
    });
    const summary = await getHostedPublicRevisionSummary(client, token);
    expect(summary?.jobStatus).toBeUndefined();
    expect(summary?.requests).toBeUndefined();
  });

  it("꺼진 링크는 null", async () => {
    const { client } = clientWith({ get_workspace_revision_view: { data: [], error: null } });
    await expect(getHostedPublicRevisionSummary(client, token)).resolves.toBeNull();
  });
});
