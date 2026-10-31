import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getHostedRuntimeBoundary, getSupabaseBrowserClient } from "@/lib/supabase";
import { BetaOpsApplications } from "./beta-ops-applications";

vi.mock("@/lib/supabase", async () => {
  const actual = await vi.importActual<typeof import("@/lib/supabase")>("@/lib/supabase");
  return { ...actual, getHostedRuntimeBoundary: vi.fn(actual.getHostedRuntimeBoundary), getSupabaseBrowserClient: vi.fn(() => null) };
});

function hostedClient(session: unknown, rpc = vi.fn()) {
  vi.mocked(getHostedRuntimeBoundary).mockReturnValue({ requestedMode: "hosted" } as ReturnType<typeof getHostedRuntimeBoundary>);
  vi.mocked(getSupabaseBrowserClient).mockReturnValue({
    rpc,
    auth: { getSession: vi.fn(async () => ({ data: { session } })) },
  } as unknown as ReturnType<typeof getSupabaseBrowserClient>);
  return rpc;
}

afterEach(() => {
  vi.mocked(getHostedRuntimeBoundary).mockReset();
  vi.mocked(getSupabaseBrowserClient).mockReset();
});

describe("/ops/applications 운영자 화면", () => {
  it("로그인하지 않았으면 목록을 부르지 않고 로그인 안내만 보인다", async () => {
    const rpc = hostedClient(null);
    render(<BetaOpsApplications />);
    expect(await screen.findByTestId("beta-ops-gate")).toHaveTextContent("로그인이 필요해요.");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("운영자 표에 없는 계정이면 '운영자 계정이 아닙니다'만 보이고 신청 정보가 없다", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { code: "42501", message: "not_operator" } }));
    hostedClient({ user: { id: "someone" } }, rpc);
    render(<BetaOpsApplications />);
    expect(await screen.findByText("운영자 계정이 아닙니다.")).toBeInTheDocument();
    expect(screen.queryByTestId("beta-application")).toBeNull();
  });

  it("로컬 미리보기: 가상 예시로 광고 상태 4종·광고 대상·통지 마감을 보여 준다", async () => {
    vi.mocked(getHostedRuntimeBoundary).mockReturnValue({ requestedMode: "local" } as ReturnType<typeof getHostedRuntimeBoundary>);
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

  it("[시험표 7][시험표 10] 미리보기에서 삭제 요청 처리 → 신청이 빠지고 삭제 결과·철회 통지 초안이 생긴다", async () => {
    vi.mocked(getHostedRuntimeBoundary).mockReturnValue({ requestedMode: "local" } as ReturnType<typeof getHostedRuntimeBoundary>);
    render(<BetaOpsApplications />);
    const rows = await screen.findAllByTestId("beta-application");
    const target = rows.find((row) => row.textContent?.includes("test-d@example.invalid"))!;
    fireEvent.click(within(target).getByRole("button", { name: "삭제 요청 처리" }));
    fireEvent.click(within(target).getByRole("button", { name: "같은 주소의 신청을 모두 지우기" }));
    const result = await screen.findByTestId("beta-deletion-result");
    const drafts = within(result).getAllByTestId("beta-draft");
    expect(drafts.map((draft) => draft.getAttribute("data-purpose"))).toEqual(["deletion", "notice"]);
    expect(drafts.every((draft) => draft.getAttribute("data-ready") === "true")).toBe(true);
    expect(screen.getAllByTestId("beta-application")).toHaveLength(3);
    expect(screen.getByRole("heading", { name: "광고 발송 대상 0명" })).toBeInTheDocument();
  });
});
