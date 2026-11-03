import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createSeedState } from "@/lib/store";
import { PublicRevisionForm } from "./public-revision-form";
import { useWorkspace } from "./workspace-provider";

vi.mock("./workspace-provider", async () => {
  const actual = await vi.importActual<typeof import("./workspace-provider")>("./workspace-provider");
  return { ...actual, useWorkspace: vi.fn() };
});

vi.mock("@/lib/supabase", async () => {
  const actual = await vi.importActual<typeof import("@/lib/supabase")>("@/lib/supabase");
  return {
    ...actual,
    getHostedRuntimeBoundary: () => ({ requestedMode: "local", configured: false }),
    getSupabaseBrowserClient: () => null,
  };
});

const seed = createSeedState("2026-08-16");

function mountWith(jobs: typeof seed.jobs, token: string) {
  vi.mocked(useWorkspace).mockReturnValue({
    jobs,
    settings: {},
    hydrated: true,
    recordPublicRevision: vi.fn(),
  } as unknown as ReturnType<typeof useWorkspace>);
  return render(<PublicRevisionForm token={token} />);
}

describe("PublicRevisionForm 로컬 모드 안내", () => {
  it("이 브라우저에 없는 링크는 '꺼졌다'가 아니라 기기 문제라고 말한다", () => {
    mountWith([], "token_from_another_device");

    // 고객에게 "링크가 꺼졌다"고 하면 작업자에게 헛된 확인 요청이 간다.
    expect(screen.getByText(/작업자 기기에 저장된 일감을 여는 주소/)).toBeInTheDocument();
    expect(screen.queryByText(/링크가 꺼졌거나/)).not.toBeInTheDocument();
  });

  it("링크를 실제로 끈 경우에는 꺼졌다고 말한다", () => {
    const job = { ...seed.jobs[0], revisionPortalToken: "token_off", revisionPortalEnabled: false };
    mountWith([job], "token_off");

    expect(screen.getByText(/링크가 꺼졌거나/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "작업이 완료됐어요" })).not.toBeInTheDocument();
  });

  // 1번: 링크를 켠 채로 일감을 완료하면 고객은 완료 화면을 본다.
  it("링크를 켠 채 완료한 일감은 완료 날짜와 함께 완료 화면을 보여 준다", () => {
    const job = { ...seed.jobs[0], revisionPortalToken: "token_done", revisionPortalEnabled: true, status: "completed" as const, completedAt: "2026-11-03T05:00:00.000Z" };
    mountWith([job], "token_done");

    expect(screen.getByRole("heading", { name: "작업이 완료됐어요" })).toBeInTheDocument();
    expect(screen.getByTestId("completed-date")).toHaveTextContent("11월 3일 완료");
    expect(screen.queryByLabelText("수정 요청 내용")).not.toBeInTheDocument();
  });

  it("링크를 끈 뒤 완료한 일감은 지금처럼 사용할 수 없는 링크다", () => {
    const job = { ...seed.jobs[0], revisionPortalToken: "token_off_done", revisionPortalEnabled: false, status: "completed" as const, completedAt: "2026-11-03T05:00:00.000Z" };
    mountWith([job], "token_off_done");

    expect(screen.getByRole("heading", { name: "사용할 수 없는 링크예요" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "작업이 완료됐어요" })).not.toBeInTheDocument();
  });

  it("보관한 일감은 완료 화면을 보이지 않는다", () => {
    const job = { ...seed.jobs[0], revisionPortalToken: "token_archived", revisionPortalEnabled: true, status: "archived" as const };
    mountWith([job], "token_archived");

    expect(screen.getByRole("heading", { name: "사용할 수 없는 링크예요" })).toBeInTheDocument();
  });

  it("진행 중인 일감에는 고객이 남긴 요청 목록을 상태와 함께 보여 준다", () => {
    const job = {
      ...seed.jobs[0],
      revisionPortalToken: "token_list",
      revisionPortalEnabled: true,
      status: "active" as const,
      revisions: [
        { id: "r1", jobId: seed.jobs[0].id, source: "public" as const, body: "메인 사진 교체", status: "new" as const, usage: "pending" as const, sequence: null, submittedAt: "2026-11-03T05:00:00.000Z" },
        { id: "m1", jobId: seed.jobs[0].id, source: "manual" as const, channel: "kakao" as const, body: "작업자 메모", status: "new" as const, usage: "pending" as const, sequence: null, submittedAt: "2026-11-03T06:00:00.000Z" },
      ],
    };
    mountWith([job], "token_list");

    const list = screen.getByRole("list", { name: "남기신 요청" });
    expect(list).toHaveTextContent("메인 사진 교체");
    expect(list).not.toHaveTextContent("작업자 메모");
  });
});
