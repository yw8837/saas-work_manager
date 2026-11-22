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
  beforeEach(() => { supabase.client = {}; summaryMock.mockReset(); submitMock.mockReset(); });

  it("공개 링크 설정이 빠졌으면 고객에게 개발 말 없이 링크를 다시 받으라고 알린다", async () => {
    supabase.client = null;
    vi.mocked(useWorkspace).mockReturnValue({ jobs: [], settings: {}, hydrated: true, recordPublicRevision: vi.fn() } as unknown as ReturnType<typeof useWorkspace>);

    render(<PublicRevisionForm token={"a".repeat(43)} />);

    expect(await screen.findByText("링크를 열 수 없어요. 작업자에게 링크를 다시 받아 주세요.")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("Hosted");
  });

  // 1번: 서버가 '완료됨'을 돌려주면 완료 화면, 아무것도 안 주면(끔·재발급) 사용할 수 없는 링크.
  it("서버가 완료된 일감이라고 하면 완료 날짜와 남긴 요청을 보여 주는 완료 화면을 그린다", async () => {
    vi.mocked(useWorkspace).mockReturnValue({ jobs: [], settings: {}, hydrated: true, recordPublicRevision: vi.fn() } as unknown as ReturnType<typeof useWorkspace>);
    summaryMock.mockResolvedValueOnce({
      ...base, used: 1, remaining: 2, pending: 0, jobStatus: "completed", completedAt: "2026-11-03T05:00:00.000Z",
      requests: [{ status: "done", sequence: 1, submittedAt: "2026-11-02T05:00:00.000Z", body: "사진을 밝게" }],
    });

    render(<PublicRevisionForm token={"a".repeat(43)} />);

    expect(await screen.findByRole("heading", { name: "작업이 완료됐어요" })).toBeInTheDocument();
    expect(screen.getByTestId("completed-date")).toHaveTextContent("11월 3일 완료");
    expect(screen.getByRole("list", { name: "남기신 요청" })).toHaveTextContent("사진을 밝게");
    expect(screen.queryByLabelText("수정 요청 내용")).not.toBeInTheDocument();
  });

  it("서버가 아무 일감도 돌려주지 않으면(링크 끔·재발급) 사용할 수 없는 링크라고 한다", async () => {
    vi.mocked(useWorkspace).mockReturnValue({ jobs: [], settings: {}, hydrated: true, recordPublicRevision: vi.fn() } as unknown as ReturnType<typeof useWorkspace>);
    summaryMock.mockResolvedValueOnce(null);

    render(<PublicRevisionForm token={"a".repeat(43)} />);

    expect(await screen.findByRole("heading", { name: "사용할 수 없는 링크예요" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "작업이 완료됐어요" })).not.toBeInTheDocument();
  });

  // 2026-11-17: 통신이 끊긴 것과 링크가 꺼진 것은 다르다. 멀쩡한 링크를 죽은 링크라고 말하면 고객이 작업자에게 헛물을 켠다.
  it("불러오다 실패하면(통신 오류) 사용할 수 없는 링크라고 하지 않고 다시 불러오게 한다", async () => {
    vi.mocked(useWorkspace).mockReturnValue({ jobs: [], settings: {}, hydrated: true, recordPublicRevision: vi.fn() } as unknown as ReturnType<typeof useWorkspace>);
    summaryMock.mockRejectedValueOnce(new Error("network"));

    render(<PublicRevisionForm token={"a".repeat(43)} />);

    expect(await screen.findByRole("heading", { name: "화면을 불러오지 못했어요" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "사용할 수 없는 링크예요" })).not.toBeInTheDocument();
    expect(document.body).toHaveTextContent("링크가 꺼진 것은 아닐 수 있어요.");
    // 화면낭독기가 실패를 읽어 주도록 알림 역할을 단다.
    expect(screen.getByRole("alert")).toHaveTextContent("화면을 불러오지 못했어요");

    summaryMock.mockResolvedValueOnce({ ...base, used: 0, remaining: 3, pending: 0, requests: [] });
    fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));

    expect(await screen.findByLabelText("수정 요청 내용")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "화면을 불러오지 못했어요" })).not.toBeInTheDocument();
    expect(summaryMock).toHaveBeenCalledTimes(2);
  });

  it("실패한 뒤 다시 불러왔더니 서버가 그런 링크가 없다고 하면 사용할 수 없는 링크로 바뀐다", async () => {
    vi.mocked(useWorkspace).mockReturnValue({ jobs: [], settings: {}, hydrated: true, recordPublicRevision: vi.fn() } as unknown as ReturnType<typeof useWorkspace>);
    summaryMock.mockRejectedValueOnce(new Error("network"));

    render(<PublicRevisionForm token={"a".repeat(43)} />);
    summaryMock.mockResolvedValueOnce(null);
    fireEvent.click(await screen.findByRole("button", { name: "다시 불러오기" }));

    expect(await screen.findByRole("heading", { name: "사용할 수 없는 링크예요" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "화면을 불러오지 못했어요" })).not.toBeInTheDocument();
  });

  it("다시 불러오는 동안 실패 화면을 그대로 두고 버튼만 '불러오는 중'으로 바꾼다(초점이 사라지지 않게)", async () => {
    vi.mocked(useWorkspace).mockReturnValue({ jobs: [], settings: {}, hydrated: true, recordPublicRevision: vi.fn() } as unknown as ReturnType<typeof useWorkspace>);
    summaryMock.mockRejectedValueOnce(new Error("network"));

    render(<PublicRevisionForm token={"a".repeat(43)} />);
    const button = await screen.findByRole("button", { name: "다시 불러오기" });
    let release: (value: null) => void = () => undefined;
    summaryMock.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
    button.focus();
    fireEvent.click(button);

    const busy = await screen.findByRole("button", { name: "불러오는 중이에요" });
    expect(busy).toHaveAttribute("aria-disabled", "true");
    expect(busy).toBe(button);
    expect(document.activeElement).toBe(button);
    expect(screen.getByRole("heading", { name: "화면을 불러오지 못했어요" })).toBeInTheDocument();
    // 불러오는 중에 또 눌러도 요청을 더 보내지 않는다.
    fireEvent.click(busy);
    expect(summaryMock).toHaveBeenCalledTimes(2);
    release(null);
    expect(await screen.findByRole("heading", { name: "사용할 수 없는 링크예요" })).toBeInTheDocument();
  });

  it("다시 불러와도 실패하면 같은 안내를 계속 보여 준다", async () => {
    vi.mocked(useWorkspace).mockReturnValue({ jobs: [], settings: {}, hydrated: true, recordPublicRevision: vi.fn() } as unknown as ReturnType<typeof useWorkspace>);
    summaryMock.mockRejectedValue(new Error("network"));

    render(<PublicRevisionForm token={"a".repeat(43)} />);
    fireEvent.click(await screen.findByRole("button", { name: "다시 불러오기" }));

    await waitFor(() => expect(summaryMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("heading", { name: "화면을 불러오지 못했어요" })).toBeInTheDocument();
  });

  it("서버가 확정된 추가 작업을 알려 주면 건수와 늘어난 기간을 보여 준다", async () => {
    vi.mocked(useWorkspace).mockReturnValue({ jobs: [], settings: {}, hydrated: true, recordPublicRevision: vi.fn() } as unknown as ReturnType<typeof useWorkspace>);
    summaryMock.mockResolvedValueOnce({ ...base, used: 0, remaining: 3, pending: 0, requests: [], addonsConfirmed: 2, addonDays: 5 });

    render(<PublicRevisionForm token={"a".repeat(43)} />);

    expect(await screen.findByTestId("revision-addons")).toHaveTextContent("추가 작업 2건이 확정됐어요. 추가 작업으로 5일이 더해졌어요.");
  });

  it("옛 서버라 추가 작업을 모르면 그 줄 없이 그린다", async () => {
    vi.mocked(useWorkspace).mockReturnValue({ jobs: [], settings: {}, hydrated: true, recordPublicRevision: vi.fn() } as unknown as ReturnType<typeof useWorkspace>);
    summaryMock.mockResolvedValueOnce({ ...base, used: 0, remaining: 3, pending: 0, requests: [] });

    render(<PublicRevisionForm token={"a".repeat(43)} />);

    expect(await screen.findByLabelText("수정 요청 내용")).toBeInTheDocument();
    expect(screen.queryByTestId("revision-addons")).not.toBeInTheDocument();
  });

  it("진행 중인 일감은 서버가 준 요청 목록과 '자료 받는 중' 단계를 보여 준다", async () => {
    vi.mocked(useWorkspace).mockReturnValue({ jobs: [], settings: {}, hydrated: true, recordPublicRevision: vi.fn() } as unknown as ReturnType<typeof useWorkspace>);
    summaryMock.mockResolvedValueOnce({
      ...base, tasksTotal: 7, tasksDone: 0, hasOpenRevision: true, used: 0, remaining: 1, pending: 1, jobStatus: "active",
      intakePending: ["소개 글"],
      requests: [{ status: "pending", submittedAt: "2026-11-03T05:00:00.000Z", body: "메인 문구" }],
    });

    render(<PublicRevisionForm token={"a".repeat(43)} />);

    const current = await screen.findByText("자료 받는 중", { selector: "li[aria-current=step] span" });
    expect(current).toBeInTheDocument();
    expect(screen.getByTestId("revision-before-draft")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "남기신 요청" })).toHaveTextContent("메인 문구");
  });

  it("로그인 모드의 고객 링크에는 입력칸 아래 '새 링크를 받기 전까지 계속 쓰면 된다' 안내가 있다", async () => {
    vi.mocked(useWorkspace).mockReturnValue({ jobs: [], settings: {}, hydrated: true, recordPublicRevision: vi.fn() } as unknown as ReturnType<typeof useWorkspace>);
    summaryMock.mockResolvedValueOnce({ ...base, used: 0, remaining: 3, pending: 0, requests: [] });

    render(<PublicRevisionForm token={"a".repeat(43)} />);

    expect(await screen.findByTestId("revision-link-note")).toHaveTextContent("작업자가 새 링크를 보내기 전까지 이 링크를 계속 쓰시면 돼요. 평소 대화창으로 말씀하신 요청도 작업자가 여기에 함께 기록해요.");
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
