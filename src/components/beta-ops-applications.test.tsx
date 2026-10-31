import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getHostedRuntimeBoundary, getSupabaseBrowserClient } from "@/lib/supabase";
import { BetaOpsApplications } from "./beta-ops-applications";

vi.mock("@/lib/supabase", async () => {
  const actual = await vi.importActual<typeof import("@/lib/supabase")>("@/lib/supabase");
  return { ...actual, getHostedRuntimeBoundary: vi.fn(actual.getHostedRuntimeBoundary), getSupabaseBrowserClient: vi.fn(() => null) };
});

type AuthListener = (event: string, session: { user: { id: string } } | null) => void;
type RpcResult = { data: unknown; error: unknown };

function hostedClient(session: unknown, rpc: ReturnType<typeof vi.fn> = vi.fn()) {
  const auth = { listener: null as AuthListener | null, unsubscribe: vi.fn() };
  vi.mocked(getHostedRuntimeBoundary).mockReturnValue({ requestedMode: "hosted" } as ReturnType<typeof getHostedRuntimeBoundary>);
  vi.mocked(getSupabaseBrowserClient).mockReturnValue({
    rpc,
    auth: {
      getSession: vi.fn(async () => ({ data: { session } })),
      onAuthStateChange: vi.fn((listener: AuthListener) => {
        auth.listener = listener;
        return { data: { subscription: { unsubscribe: auth.unsubscribe } } };
      }),
    },
  } as unknown as ReturnType<typeof getSupabaseBrowserClient>);
  return { rpc, auth };
}

function applicationRow(email: string, id: string) {
  return {
    id, email, work_type: "web", sells_packages: true, concurrent_jobs: "2-3", order_channels: [], participation: "beta",
    eligible: true, ad_checked: true, created_at: "2026-11-01T00:00:00Z", confirm_expires_at: "2026-12-01T00:00:00Z",
    email_confirmed_at: null, outcome: null, result_sent_at: null, interview_done_at: null, beta_ended_at: null,
    purge_after: null, ad_status: "pending", suppressed: false, ad_target: false,
    confirm_token: "c".repeat(43), unsubscribe_token: "u".repeat(43),
  };
}

/** 운영자 RPC를 이름별로 돌려준다. 신청 목록 응답은 미리 준 값을 차례대로 쓴다. */
function opsRpc(applicationResponses: Array<() => Promise<RpcResult>>) {
  let index = 0;
  return vi.fn((name: string): Promise<RpcResult> => {
    if (name === "beta_ops_list_applications") {
      const next = applicationResponses[Math.min(index, applicationResponses.length - 1)];
      index += 1;
      return next();
    }
    return Promise.resolve({ data: [], error: null });
  });
}

function useLocal() {
  vi.mocked(getHostedRuntimeBoundary).mockReturnValue({ requestedMode: "local" } as ReturnType<typeof getHostedRuntimeBoundary>);
}

afterEach(() => {
  vi.mocked(getHostedRuntimeBoundary).mockReset();
  vi.mocked(getSupabaseBrowserClient).mockReset();
});

describe("/ops/applications 운영자 화면", () => {
  it("로그인하지 않았으면 목록을 부르지 않고 로그인 안내만 보인다", async () => {
    const { rpc } = hostedClient(null);
    render(<BetaOpsApplications />);
    expect(await screen.findByTestId("beta-ops-gate")).toHaveTextContent("로그인이 필요해요.");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("운영자 표에 없는 계정이면 '운영자 계정이 아닙니다'만 보이고 신청 정보가 없다", async () => {
    hostedClient({ user: { id: "someone" } }, vi.fn(async () => ({ data: null, error: { code: "42501", message: "not_operator" } })));
    render(<BetaOpsApplications />);
    expect(await screen.findByText("운영자 계정이 아닙니다.")).toBeInTheDocument();
    expect(screen.queryByTestId("beta-application")).toBeNull();
  });

  it("로컬 미리보기: 가상 예시로 광고 상태 4종·광고 대상·통지 마감을 보여 준다", async () => {
    useLocal();
    render(<BetaOpsApplications />);
    expect(await screen.findByRole("note")).toHaveTextContent("미리보기: 가상 신청 예시");
    const rows = await screen.findAllByTestId("beta-application");
    expect(rows).toHaveLength(4);
    const statuses = screen.getAllByTestId("beta-ad-status").map((node) => node.textContent);
    expect(statuses).toEqual(expect.arrayContaining(["광고 동의(확인 대기)", "광고 신규 미동의", "광고 동의(유효)"]));
    // 미충족(test-c)은 동의해도 광고 대상이 아니다. 대상은 확인까지 끝난 적격 동의자 1명.
    expect(screen.getByRole("heading", { name: "광고 발송 대상 1명" })).toBeInTheDocument();
    expect(screen.getAllByTestId("beta-notice")).toHaveLength(3);
  });

  it("[시험표 7][시험표 10] 미리보기에서 삭제 요청 처리 → 신청이 빠지고 삭제 결과 안내·철회 통지 초안이 생긴다", async () => {
    useLocal();
    render(<BetaOpsApplications />);
    const rows = await screen.findAllByTestId("beta-application");
    const target = rows.find((row) => row.textContent?.includes("test-d@example.invalid"))!;
    fireEvent.click(within(target).getByRole("button", { name: "삭제 요청 처리" }));
    fireEvent.click(within(target).getByRole("button", { name: "같은 주소의 신청을 모두 지우기" }));
    const deletion = await screen.findByTestId("beta-deletion");
    const drafts = within(deletion).getAllByTestId("beta-draft");
    expect(drafts.map((draft) => draft.getAttribute("data-purpose"))).toEqual(["deletion"]);
    expect(drafts[0]).toHaveAttribute("data-ready", "true");
    const withdraw = screen.getAllByTestId("beta-notice")
      .find((item) => item.getAttribute("data-recipient") === "test-d@example.invalid" && item.getAttribute("data-kind") === "withdraw");
    expect(withdraw).toBeDefined();
    expect(screen.getAllByTestId("beta-application")).toHaveLength(3);
    expect(screen.getByRole("heading", { name: "광고 발송 대상 0명" })).toBeInTheDocument();
  });

  it("[리뷰 1] 다른 탭에서 로그아웃하면 신청자 주소·링크·초안을 바로 지우고 로그인 안내로 바꾼다", async () => {
    const { auth } = hostedClient({ user: { id: "operator-1" } }, opsRpc([
      async () => ({ data: [applicationRow("test-r1@example.invalid", "app-1")], error: null }),
    ]));
    render(<BetaOpsApplications />);
    expect(await screen.findByText("test-r1@example.invalid")).toBeInTheDocument();
    act(() => auth.listener?.("SIGNED_OUT", null));
    expect(screen.queryByText("test-r1@example.invalid")).toBeNull();
    expect(document.body.textContent).not.toContain("u".repeat(43));
    expect(await screen.findByTestId("beta-ops-gate")).toHaveTextContent("로그인이 필요해요.");
  });

  it("[리뷰 1] 일반 계정으로 바뀌면 화면을 비우고 다시 확인해 '운영자 계정이 아닙니다'만 보인다", async () => {
    const { auth } = hostedClient({ user: { id: "operator-1" } }, opsRpc([
      async () => ({ data: [applicationRow("test-r1@example.invalid", "app-1")], error: null }),
      async () => ({ data: null, error: { code: "42501", message: "not_operator" } }),
    ]));
    render(<BetaOpsApplications />);
    expect(await screen.findByText("test-r1@example.invalid")).toBeInTheDocument();
    act(() => auth.listener?.("SIGNED_IN", { user: { id: "someone-else" } }));
    expect(screen.queryByText("test-r1@example.invalid")).toBeNull();
    expect(await screen.findByText("운영자 계정이 아닙니다.")).toBeInTheDocument();
    expect(screen.queryByTestId("beta-application")).toBeNull();
  });

  it("[리뷰 1] 계정이 바뀌기 전에 보낸 조회가 늦게 와도 화면을 다시 채우지 않는다", async () => {
    let releaseFirst: (value: RpcResult) => void = () => undefined;
    const first = new Promise<RpcResult>((resolve) => { releaseFirst = resolve; });
    const { rpc, auth } = hostedClient({ user: { id: "operator-1" } }, opsRpc([
      () => first,
      async () => ({ data: null, error: { code: "42501", message: "not_operator" } }),
    ]));
    render(<BetaOpsApplications />);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("beta_ops_list_applications"));
    act(() => auth.listener?.("SIGNED_IN", { user: { id: "someone-else" } }));
    expect(await screen.findByText("운영자 계정이 아닙니다.")).toBeInTheDocument();
    await act(async () => { releaseFirst({ data: [applicationRow("test-late@example.invalid", "app-late")], error: null }); });
    expect(screen.queryByText("test-late@example.invalid")).toBeNull();
    expect(screen.getByText("운영자 계정이 아닙니다.")).toBeInTheDocument();
  });

  it("[리뷰 1] 같은 계정의 토큰 갱신은 화면을 비우지 않는다", async () => {
    const { auth } = hostedClient({ user: { id: "operator-1" } }, opsRpc([
      async () => ({ data: [applicationRow("test-r1@example.invalid", "app-1")], error: null }),
    ]));
    render(<BetaOpsApplications />);
    expect(await screen.findByText("test-r1@example.invalid")).toBeInTheDocument();
    act(() => auth.listener?.("TOKEN_REFRESHED", { user: { id: "operator-1" } }));
    expect(screen.getByText("test-r1@example.invalid")).toBeInTheDocument();
  });

  it("[리뷰 6] 삭제 요청 처리 뒤에도 안 보낸 통지의 초안이 남고, 통지를 보내기 전에는 삭제 결과 안내를 끝낼 수 없다", async () => {
    useLocal();
    render(<BetaOpsApplications />);
    const rows = await screen.findAllByTestId("beta-application");
    const target = rows.find((row) => row.textContent?.includes("test-a@example.invalid"))!;
    fireEvent.click(within(target).getByRole("button", { name: "삭제 요청 처리" }));
    fireEvent.click(within(target).getByRole("button", { name: "같은 주소의 신청을 모두 지우기" }));
    const deletion = await screen.findByTestId("beta-deletion");
    expect(deletion).toHaveTextContent("test-a@example.invalid");
    expect(deletion).toHaveTextContent("보내지 않은 통지 2건");
    // 삭제 전에 남긴 동의 통지와 새 철회 통지 모두 받는 주소가 남아 초안을 만들 수 있다.
    const notices = screen.getAllByTestId("beta-notice").filter((item) => item.getAttribute("data-recipient") === "test-a@example.invalid");
    expect(notices.map((item) => item.getAttribute("data-kind")).sort()).toEqual(["consent", "withdraw"]);
    expect(notices.every((item) => within(item).queryByText(/주소가 없어요/) === null)).toBe(true);
    fireEvent.click(within(deletion).getByRole("button", { name: "삭제 결과 안내 보냄 표시" }));
    fireEvent.click(within(deletion).getByRole("button", { name: "보낸 것 맞아요" }));
    expect(await screen.findByText(/처리결과 통지를 먼저 보내고/)).toBeInTheDocument();
    expect(screen.getByTestId("beta-deletion")).toHaveTextContent("test-a@example.invalid");
  });

  it("[재검토 3] 주소가 정리된 뒤 생긴 통지는 '주소가 정리되어 이메일 통지 불가 — 화면 통지만 함'으로 구분하고, 보낼 통지로 세지 않는다", async () => {
    const notice = {
      event_id: "event-screen-only", kind: "withdraw", source: "unsubscribe_link", occurred_at: "2026-11-01T00:00:00Z",
      confirmed_at: null, notice_shown_at: "2026-11-01T00:00:00Z", notice_due_at: "2026-11-15T00:00:00Z",
      notice_emailed_at: null, application_id: null, recipient_email: null, email_unavailable: true,
    };
    const rpc = vi.fn((name: string): Promise<RpcResult> => Promise.resolve(
      name === "beta_ops_list_notices" ? { data: [notice], error: null } : { data: [], error: null },
    ));
    hostedClient({ user: { id: "operator-1" } }, rpc);
    render(<BetaOpsApplications />);
    const item = await screen.findByTestId("beta-notice");
    expect(item).toHaveTextContent("주소가 정리되어 이메일 통지 불가 — 화면 통지만 함");
    expect(item).not.toHaveTextContent("삭제 결과 안내까지 끝나 주소를 지웠어요");
    expect(within(item).queryByRole("button", { name: "통지 보냄 표시" })).toBeNull();
    expect(screen.getByRole("heading", { name: "처리결과 통지 0건 남음" })).toBeInTheDocument();
  });

  it("[재검토3 2][재검토4 1] 정리 결과에서 '정리 가능한 남은 대상'과 '통지 때문에 보류된 주소'를 나눠 알린다", async () => {
    const expired = { ...applicationRow("test-batch@example.invalid", "app-batch"), purge_after: "2026-01-01T00:00:00Z" };
    const rpc = vi.fn((name: string): Promise<RpcResult> => Promise.resolve(
      name === "beta_ops_list_applications" ? { data: [expired], error: null }
        : name === "beta_ops_purge_expired" ? { data: [{ deleted_count: 100, remaining_count: 7, held_count: 3 }], error: null }
          : name === "beta_ops_prune_call_counters" ? { data: [{ deleted_rows: 0, remaining_rows: 0 }], error: null }
            : { data: [], error: null },
    ));
    hostedClient({ user: { id: "operator-1" } }, rpc);
    render(<BetaOpsApplications />);
    fireEvent.click(await screen.findByRole("button", { name: "정리 실행 (만료 신청 1건 · 2일 지난 호출 기록)" }));
    fireEvent.click(screen.getByRole("button", { name: "신청과 오래된 호출 기록 정리하기" }));
    const message = await screen.findByText(/신청 100건을 정리했어요/);
    expect(message).toHaveTextContent("정리 가능한 남은 대상 7명");
    expect(message).toHaveTextContent("보내지 않은 통지 때문에 보류된 주소 3명");
  });

  it("[재검토4 2] 만료 신청이 0건이어도 정리 버튼을 누를 수 있고, 오래된 호출 기록 정리 RPC까지 부른다", async () => {
    const rpc = vi.fn((name: string): Promise<RpcResult> => Promise.resolve(
      name === "beta_ops_list_applications" ? { data: [applicationRow("test-fresh@example.invalid", "app-fresh")], error: null }
        : name === "beta_ops_purge_expired" ? { data: [{ deleted_count: 0, remaining_count: 0, held_count: 0 }], error: null }
          : name === "beta_ops_prune_call_counters" ? { data: [{ deleted_rows: 12, remaining_rows: 0 }], error: null }
            : { data: [], error: null },
    ));
    hostedClient({ user: { id: "operator-1" } }, rpc);
    render(<BetaOpsApplications />);
    const button = await screen.findByRole("button", { name: "정리 실행 (만료 신청 0건 · 2일 지난 호출 기록)" });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    fireEvent.click(screen.getByRole("button", { name: "신청과 오래된 호출 기록 정리하기" }));
    expect(await screen.findByText(/오래된 호출 기록 12행을 지웠어요/)).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith("beta_ops_prune_call_counters");
  });

  it("[리뷰 7] 결과를 고르기만 해도 그 결과의 초안이 보이고, 보냄 표시는 아직 기록되지 않는다", async () => {
    useLocal();
    render(<BetaOpsApplications />);
    const rows = await screen.findAllByTestId("beta-application");
    const target = rows.find((row) => row.textContent?.includes("test-b@example.invalid"))!;
    expect(within(target).getAllByTestId("beta-draft").map((item) => item.getAttribute("data-purpose"))).toEqual(["interview"]);
    fireEvent.change(within(target).getByRole("combobox", { name: "결과" }), { target: { value: "not_selected" } });
    const drafts = within(target).getAllByTestId("beta-draft");
    expect(drafts.map((item) => item.getAttribute("data-purpose"))).toEqual(["result"]);
    expect(drafts[0]).toHaveTextContent("함께하지 못하게 되었습니다");
    expect(target).toHaveTextContent("결과 안내 전");
  });
});
