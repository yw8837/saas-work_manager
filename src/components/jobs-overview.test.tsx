import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createSeedState } from "@/lib/store";
import { JobsOverview } from "./jobs-overview";
import { useWorkspace } from "./workspace-provider";

vi.mock("./workspace-provider", async () => ({
  ...await vi.importActual("./workspace-provider"), useWorkspace: vi.fn(),
}));
afterEach(() => { window.history.replaceState({}, "", "/"); });
it("explains why an old revision notification could not open", () => {
  vi.mocked(useWorkspace).mockReturnValue({ jobs: [] } as unknown as ReturnType<typeof useWorkspace>);
  window.history.replaceState({}, "", "/jobs?notice=revision-unavailable");
  render(<JobsOverview />);
  expect(screen.getByRole("status")).toHaveTextContent("삭제되었거나 현재 계정에서 볼 수 없는");
});

it("keeps the filter and search in a 15-job list when returning from a detail", () => {
  const base = createSeedState().jobs[0];
  const jobs = Array.from({ length: 15 }, (_, index) => ({
    ...base, id: `job-${index}`, clientLabel: index < 2 ? "동일 고객" : `고객 ${index}`,
    title: `작업 ${index}`, status: "active", tasks: [],
  }));
  vi.mocked(useWorkspace).mockReturnValue({ jobs } as unknown as ReturnType<typeof useWorkspace>);
  window.history.replaceState({ idx: 5 }, "", "/jobs");
  const first = render(<JobsOverview />);
  fireEvent.change(screen.getByPlaceholderText("고객 또는 일감 검색"), { target: { value: "동일 고객" } });
  fireEvent.click(screen.getByRole("button", { name: "진행" }));
  expect(screen.getAllByText("동일 고객")).toHaveLength(2);
  const href = screen.getByText("작업 1").closest("a")!.getAttribute("href")!;
  expect(href).toContain("list=");
  expect(window.location.search).toContain("q=");
  expect(window.history.state.idx).toBe(5);
  first.unmount();
  render(<JobsOverview />);
  expect(screen.getByPlaceholderText("고객 또는 일감 검색")).toHaveValue("동일 고객");
  expect(screen.getByRole("button", { name: "진행" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getAllByText("동일 고객")).toHaveLength(2);
});

function sourcedJobs(sources: Array<"kmong" | "soomgo" | undefined>) {
  const base = createSeedState().jobs[0];
  const names = ["가 고객", "나 고객", "다 고객", "라 고객", "마 고객"];
  return sources.map((source, index) => ({
    ...base, id: `job-${index}`, clientLabel: names[index], title: `${names[index]} 작업`, status: "active", tasks: [],
    ...(source ? { source } : {}),
  }));
}

it("받은 곳이 두 군데 이상이면 받은 곳 거르기가 보이고, 누르면 그곳 일감만 남고 다시 누르면 풀린다", () => {
  vi.mocked(useWorkspace).mockReturnValue({ jobs: sourcedJobs(["kmong", "kmong", "soomgo", undefined]) } as unknown as ReturnType<typeof useWorkspace>);
  window.history.replaceState({}, "", "/jobs");
  render(<JobsOverview />);

  // 줄마다 받은 곳을 작게 보이고, 받은 곳 없는 예전 일감은 표시하지 않는다.
  expect(screen.getByTestId("job-row-source-job-0")).toHaveTextContent("크몽");
  expect(screen.getByTestId("job-row-source-job-2")).toHaveTextContent("숨고");
  expect(screen.queryByTestId("job-row-source-job-3")).not.toBeInTheDocument();

  const kmong = screen.getByTestId("source-filter-kmong");
  expect(kmong).toHaveTextContent("크몽 2");
  expect(screen.getByTestId("source-filter-soomgo")).toHaveTextContent("숨고 1");
  expect(kmong).toHaveAttribute("aria-pressed", "false");

  fireEvent.click(kmong);
  expect(screen.getByTestId("source-filter-kmong")).toHaveAttribute("aria-pressed", "true");
  expect(window.location.search).toContain("source=kmong");
  expect(screen.getByText("가 고객")).toBeInTheDocument();
  expect(screen.getByText("나 고객")).toBeInTheDocument();
  expect(screen.queryByText("다 고객")).not.toBeInTheDocument();
  expect(screen.queryByText("라 고객")).not.toBeInTheDocument();
  // 상세로 갔다 돌아와도 거르기가 남게 돌아올 주소에 받은 곳을 담는다.
  expect(decodeURIComponent(screen.getByText("가 고객").closest("a")!.getAttribute("href")!)).toContain("source=kmong");

  fireEvent.click(screen.getByTestId("source-filter-kmong"));
  expect(window.location.search).not.toContain("source=");
  expect(screen.getByText("다 고객")).toBeInTheDocument();
  expect(screen.getByText("라 고객")).toBeInTheDocument();
});

it("받은 곳이 한 군데뿐이면 받은 곳 거르기 줄이 없다", () => {
  vi.mocked(useWorkspace).mockReturnValue({ jobs: sourcedJobs(["kmong", "kmong", undefined]) } as unknown as ReturnType<typeof useWorkspace>);
  window.history.replaceState({}, "", "/jobs");
  render(<JobsOverview />);
  expect(screen.getByTestId("job-row-source-job-0")).toHaveTextContent("크몽");
  expect(screen.queryByRole("group", { name: "받은 곳 거르기" })).not.toBeInTheDocument();
  expect(screen.queryByTestId("source-filter-kmong")).not.toBeInTheDocument();
});

it("검색어 '숨고'로도 그 받은 곳 일감이 걸린다", () => {
  vi.mocked(useWorkspace).mockReturnValue({ jobs: sourcedJobs(["kmong", "soomgo", undefined]) } as unknown as ReturnType<typeof useWorkspace>);
  window.history.replaceState({}, "", "/jobs");
  render(<JobsOverview />);
  fireEvent.change(screen.getByPlaceholderText("고객 또는 일감 검색"), { target: { value: "숨고" } });
  expect(screen.getByText("나 고객")).toBeInTheDocument();
  expect(screen.queryByText("가 고객")).not.toBeInTheDocument();
  expect(screen.queryByText("다 고객")).not.toBeInTheDocument();
});

it("거른 받은 곳에 맞는 일감이 없으면 그렇게 말하고 거르기를 풀 수 있다", () => {
  vi.mocked(useWorkspace).mockReturnValue({ jobs: sourcedJobs(["kmong", "soomgo"]) } as unknown as ReturnType<typeof useWorkspace>);
  window.history.replaceState({}, "", "/jobs?filter=completed&source=kmong");
  render(<JobsOverview />);
  expect(screen.getByText("크몽에서 받은 일감이 없어요")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "거르기 풀기" }));
  expect(window.location.search).toBe("?filter=completed");
});

it("일감 목록 머리에 월별 정리로 가는 버튼이 있다", () => {
  vi.mocked(useWorkspace).mockReturnValue({ jobs: [] } as unknown as ReturnType<typeof useWorkspace>);
  window.history.replaceState({}, "", "/jobs");
  render(<JobsOverview />);
  const link = screen.getByTestId("open-monthly-summary");
  expect(link).toHaveAttribute("href", "/jobs/summary");
  expect(link).toHaveTextContent("월별 정리");
});

it("머리 설명은 '잔여' 대신 '남은 수정'이라고 쓴다", () => {
  vi.mocked(useWorkspace).mockReturnValue({ jobs: [] } as unknown as ReturnType<typeof useWorkspace>);
  window.history.replaceState({}, "", "/jobs");
  const view = render(<JobsOverview />);
  expect(screen.getByText("진행 중인 고객과 마감, 남은 수정 횟수를 같이 봐요.")).toBeInTheDocument();
  expect(view.container).not.toHaveTextContent("잔여");
});

it("디자인 A: 줄마다 왼쪽 날짜 칸, 상태 칩(알약)·수정 n/m 칩, 오른쪽 끝 금액", () => {
  const base = createSeedState().jobs[0];
  const late = {
    ...base, id: "job-late", clientLabel: "온새미 공방", status: "active", dueDate: "2020-01-20", amount: 550_000,
    revisions: [], tasks: [], intakeItems: [{ id: "i1", label: "로고" }],
  };
  const finished = { ...base, id: "job-finished", clientLabel: "카페 모라", status: "completed", dueDate: "2020-02-03", revisions: [] };
  vi.mocked(useWorkspace).mockReturnValue({ jobs: [late, finished] } as unknown as ReturnType<typeof useWorkspace>);
  render(<JobsOverview />);
  const lateRow = screen.getByText("온새미 공방").closest("a")!;
  const tile = lateRow.querySelector(".dueTile")!;
  expect(tile).toHaveAttribute("data-tone", "late");
  expect(tile).toHaveTextContent("1.20");
  const chips = [...lateRow.querySelectorAll(".stateChip")].map((chip) => [chip.textContent, chip.getAttribute("data-tone")]);
  expect(chips).toEqual([
    ["지연", "red"],
    ["자료 대기", "amber"],
    [`수정 0/${base.revisionLimit}`, "blue"],
  ]);
  expect(lateRow.querySelector(".amountCell")).toHaveTextContent("550,000원");
  const doneRow = screen.getByText("카페 모라").closest("a")!;
  expect(doneRow.querySelector(".dueTile")).toHaveAttribute("data-tone", "done");
  expect(doneRow.querySelector(".stateChip")).toHaveTextContent("완료");
  expect(doneRow.querySelector(".stateChip")).toHaveAttribute("data-tone", "green");
});
