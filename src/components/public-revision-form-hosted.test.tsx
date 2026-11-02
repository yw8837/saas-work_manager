import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PublicRevisionForm } from "./public-revision-form";
import { useWorkspace } from "./workspace-provider";

vi.mock("./workspace-provider", async () => {
  const actual = await vi.importActual<typeof import("./workspace-provider")>("./workspace-provider");
  return { ...actual, useWorkspace: vi.fn() };
});

const summaryMock = vi.fn();
const submitMock = vi.fn();
// 운영 빌드에 공개 링크 설정이 빠진 경우를 흉내 내려면 브라우저 클라이언트를 없앨 수 있어야 한다.
const supabase = vi.hoisted(() => ({ client: {} as object | null }));

vi.mock("@/lib/supabase", async () => {
  const actual = await vi.importActual<typeof import("@/lib/supabase")>("@/lib/supabase");
  return {
    ...actual,
    getHostedRuntimeBoundary: () => ({ requestedMode: "hosted", configured: true }),
    getSupabaseBrowserClient: () => supabase.client,
    getHostedPublicRevisionSummary: (...args: unknown[]) => summaryMock(...args),
    submitHostedPublicRevision: (...args: unknown[]) => submitMock(...args),
  };
});

const base = { jobKey: "job_1", title: "랜딩", packageName: "기본", included: 3, dueDate: undefined, tasksTotal: 4, tasksDone: 1, hasOpenRevision: true, workerName: undefined, intakePending: [] };

describe("PublicRevisionForm 운영 모드", () => {
  beforeEach(() => { supabase.client = {}; });

  it("공개 링크 설정이 빠졌으면 고객에게 개발 말 없이 링크를 다시 받으라고 알린다", async () => {
    supabase.client = null;
    vi.mocked(useWorkspace).mockReturnValue({ jobs: [], settings: {}, hydrated: true, recordPublicRevision: vi.fn() } as unknown as ReturnType<typeof useWorkspace>);

    render(<PublicRevisionForm token={"a".repeat(43)} />);

    expect(await screen.findByText("링크를 열 수 없어요. 작업자에게 링크를 다시 받아 주세요.")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("Hosted");
  });

  // Codex 4차 P2: 링크를 연 사이 작업자가 다른 요청을 '수정 완료'하면, 처음 읽은 값으로 계산한 숫자가 서버와 어긋난다.
  it("제출 뒤 서버 요약을 다시 읽어 사용·대기·남은 횟수를 서버와 맞춘다", async () => {
    vi.mocked(useWorkspace).mockReturnValue({ jobs: [], settings: {}, hydrated: true, recordPublicRevision: vi.fn() } as unknown as ReturnType<typeof useWorkspace>);
    // 처음 열었을 때: 사용 0, 대기 1(요청 A), 남음 3
    summaryMock.mockResolvedValueOnce({ ...base, used: 0, remaining: 3, pending: 1 });
    // 그 사이 작업자가 A를 완료했고, 고객이 B를 남긴 뒤의 서버 상태: 사용 1, 대기 1(B), 남음 2
    summaryMock.mockResolvedValueOnce({ ...base, used: 1, remaining: 2, pending: 1 });
    submitMock.mockResolvedValueOnce({ requestId: "r_b", usage: "pending", sequence: null, submittedAt: "2026-11-01T00:00:00.000Z", remaining: 2 });

    render(<PublicRevisionForm token={"a".repeat(43)} />);
    await waitFor(() => expect(screen.getByTestId("revision-remaining")).toHaveTextContent("3"));
    expect(screen.getByTestId("revision-pending")).toHaveTextContent("확인 대기 1건");

    fireEvent.change(screen.getByLabelText("수정 요청 내용"), { target: { value: "두 번째 요청" } });
    fireEvent.click(screen.getByRole("button", { name: /요청 남기기/ }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("요청을 접수했어요"));
    await waitFor(() => expect(summaryMock).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole("button", { name: "다른 요청 남기기" }));
    expect(screen.getByTestId("revision-remaining")).toHaveTextContent("2");
    expect(screen.getByText("전체 3회 중 1회 사용")).toBeInTheDocument();
    expect(screen.getByTestId("revision-pending")).toHaveTextContent("확인 대기 1건");
  });
});
