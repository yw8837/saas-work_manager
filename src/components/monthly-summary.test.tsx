import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { composeJob, type Job, type OrderSource, type PackageTemplate } from "@/lib/domain";
import { MonthlySummary } from "./monthly-summary";
import { useWorkspace } from "./workspace-provider";

vi.mock("./workspace-provider", async () => ({
  ...await vi.importActual("./workspace-provider"), useWorkspace: vi.fn(),
}));

const basicPackage: PackageTemplate = {
  id: "pkg_basic",
  name: "Basic 홈페이지",
  price: 790_000,
  estimatedCost: 95_000,
  durationDays: 7,
  revisionLimit: 1,
  tasks: [{ taskKey: "brief", title: "의뢰서 확인", relativeDay: 0, order: 0 }],
};

function job(
  id: string,
  clientLabel: string,
  fields: { status: Job["status"]; completedAt?: string; updatedAt?: string; source?: OrderSource; amount?: number; estimatedCost?: number },
): Job {
  const base = composeJob({ jobId: id, clientLabel, startDate: "2026-10-01", package: basicPackage, now: "2026-10-01T00:00:00.000Z" });
  const { completedAt, ...rest } = fields;
  return { ...base, ...rest, ...(completedAt ? { completedAt } : {}) };
}

const jobs = [
  job("nov1", "카페 모라", { status: "completed", completedAt: "2026-11-03T02:00:00.000Z", source: "kmong" }),
  job("nov2", "모로우 베이크", { status: "completed", completedAt: "2026-11-18T02:00:00.000Z", source: "kmong" }),
  // 완료 시각을 적기 전에 완료한 예전 일감: 마지막 수정 시각으로 넣고 표시한다.
  job("legacy", "소개 손님", { status: "completed", updatedAt: "2026-11-12T02:00:00.000Z", source: "referral", amount: 500_000, estimatedCost: 50_000 }),
  job("oct", "숨고 손님", { status: "completed", completedAt: "2026-10-07T02:00:00.000Z", source: "soomgo", amount: 300_000, estimatedCost: 30_000 }),
  job("active", "진행 손님", { status: "active", source: "kmong", amount: 1_580_000 }),
];

const clicked: HTMLAnchorElement[] = [];
/** 누른 순간 링크가 문서에 붙어 있었는지(일부 브라우저는 문서 밖 링크의 내려받기를 무시한다). */
const connectedAtClick: boolean[] = [];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-20T03:00:00.000Z"));
  vi.mocked(useWorkspace).mockReturnValue({ jobs } as unknown as ReturnType<typeof useWorkspace>);
  clicked.length = 0;
  connectedAtClick.length = 0;
  URL.createObjectURL = vi.fn(() => "blob:monthly-summary");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push(this);
    connectedAtClick.push(this.isConnected);
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("이번 달 완료 주문의 합계·받은 곳별 줄·진행 중 합계를 숫자 줄로 보여 준다", () => {
  render(<MonthlySummary timeZone="Asia/Seoul" />);

  expect(screen.getByRole("heading", { level: 1, name: "월별 정리" })).toBeInTheDocument();
  expect(screen.getByText("세금 신고 때 참고하려고 모은 정리예요. 세금 계산이나 신고는 하지 않아요.")).toBeInTheDocument();
  expect(screen.getByText("금액은 주문 조건과 확정한 추가요청 기준이에요.")).toBeInTheDocument();

  const title = screen.getByTestId("summary-month-title");
  expect(title).toHaveTextContent("2026년 11월");
  expect(title).toHaveAttribute("aria-live", "polite");

  expect(screen.getByTestId("summary-total-count")).toHaveTextContent("3건");
  expect(screen.getByTestId("summary-total-amount")).toHaveTextContent("2,080,000원");
  expect(screen.getByTestId("summary-total-cost")).toHaveTextContent("240,000원");
  expect(screen.getByTestId("summary-total-margin")).toHaveTextContent("1,840,000원");
  // 합계 이름은 CSV 열 이름과 같은 말(무슨 금액인지 밝힘).
  expect(screen.getByTestId("summary-total-amount").previousElementSibling).toHaveTextContent("주문 금액 합계");
  expect(screen.getByTestId("summary-total-cost").previousElementSibling).toHaveTextContent("예상 원가");
  expect(screen.getByTestId("summary-total-margin").previousElementSibling).toHaveTextContent("남는 돈(예상)");
  expect(screen.queryByText("금액 합계")).not.toBeInTheDocument();
  // 진행 중 합계는 고른 달과 상관없는 지금 값이라 '지금'을 밝힌다.
  expect(screen.getByTestId("summary-in-progress").textContent).toBe("지금 진행 중 1건 · 1,580,000원 (합계에 안 넣음)");

  const kmong = screen.getByTestId("summary-source-kmong");
  expect(kmong).toHaveTextContent("크몽");
  expect(kmong).toHaveTextContent("2건");
  expect(kmong).toHaveTextContent("1,580,000원");
  expect(screen.getByTestId("summary-source-referral")).toHaveTextContent("소개1건500,000원");
  expect(screen.queryByTestId("summary-source-soomgo")).not.toBeInTheDocument();

  // 줄은 그 일감으로 가는 링크이고, 예전 완료 일감에만 '완료 시각 기록 전'을 붙인다.
  expect(screen.getByTestId("summary-row-nov1")).toHaveAttribute("href", "/jobs/nov1");
  expect(screen.getByTestId("summary-row-nov1")).not.toHaveTextContent("완료 시각 기록 전");
  expect(within(screen.getByTestId("summary-row-legacy")).getByText(/완료 시각 기록 전/)).toBeInTheDocument();
  expect(screen.queryByTestId("summary-row-oct")).not.toBeInTheDocument();

  // 세금 계산·소득처럼 읽히는 말은 쓰지 않는다.
  expect(document.body.textContent).not.toMatch(/순이익|소득|신고 금액|세액|부가세|납부/);
});

it("◀ ▶로 달이 바뀌고 이번 달보다 뒤로는 못 간다", () => {
  render(<MonthlySummary timeZone="Asia/Seoul" />);
  const previous = screen.getByRole("button", { name: "이전 달" });
  const next = screen.getByRole("button", { name: "다음 달" });
  expect(next).toBeDisabled();

  fireEvent.click(previous);
  expect(screen.getByTestId("summary-month-title")).toHaveTextContent("2026년 10월");
  expect(screen.getByTestId("summary-total-count")).toHaveTextContent("1건");
  expect(screen.getByTestId("summary-row-oct")).toBeInTheDocument();
  expect(screen.queryByTestId("summary-row-nov1")).not.toBeInTheDocument();
  // 지난달을 봐도 진행 중 줄은 지금 값 그대로다.
  expect(screen.getByTestId("summary-in-progress").textContent).toBe("지금 진행 중 1건 · 1,580,000원 (합계에 안 넣음)");
  expect(next).toBeEnabled();

  fireEvent.click(previous);
  expect(screen.getByTestId("summary-month-title")).toHaveTextContent("2026년 9월");
  expect(screen.getByText("9월에 완료한 주문이 없어요")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "진행 중 일감 보기" })).toHaveAttribute("href", "/jobs?filter=active");

  fireEvent.click(next);
  fireEvent.click(next);
  expect(screen.getByTestId("summary-month-title")).toHaveTextContent("2026년 11월");
  expect(next).toBeDisabled();
});

it("화면을 열어 둔 채 달이 바뀌면 다음 달로 갈 수 있다", () => {
  vi.setSystemTime(new Date("2026-11-30T14:00:00.000Z")); // 서울 11/30 23:00
  const view = render(<MonthlySummary timeZone="Asia/Seoul" />);
  expect(screen.getByTestId("summary-month-title")).toHaveTextContent("2026년 11월");
  expect(screen.getByRole("button", { name: "다음 달" })).toBeDisabled();

  // 자정을 넘겨 12월이 됐다. 작업공간은 날짜가 바뀌면 화면을 다시 그린다(기준 시각 틱).
  vi.setSystemTime(new Date("2026-11-30T15:10:00.000Z")); // 서울 12/1 00:10
  view.rerender(<MonthlySummary timeZone="Asia/Seoul" />);
  const next = screen.getByRole("button", { name: "다음 달" });
  expect(next).toBeEnabled();
  fireEvent.click(next);
  expect(screen.getByTestId("summary-month-title")).toHaveTextContent("2026년 12월");
  expect(next).toBeDisabled();
});

it("summary-download-month를 누르면 그달 CSV를 내려받고 알림을 띄운다", () => {
  render(<MonthlySummary timeZone="Asia/Seoul" />);

  fireEvent.click(screen.getByTestId("summary-download-month"));
  expect(clicked).toHaveLength(1);
  expect(clicked[0].getAttribute("download")).toBe("ilgamcheck-매출-2026-11.csv");
  expect(clicked[0].getAttribute("href")).toBe("blob:monthly-summary");
  const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
  expect(blob.type).toBe("text/csv;charset=utf-8");
  // 주소 해제는 내려받기가 시작된 뒤로 미룬다(시점은 아래 시험).
  expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  expect(screen.getByRole("status")).toHaveTextContent("ilgamcheck-매출-2026-11.csv를 내려받았어요");

  fireEvent.click(screen.getByTestId("summary-download-year"));
  expect(clicked[1].getAttribute("download")).toBe("ilgamcheck-매출-2026.csv");
  expect(screen.getByRole("status")).toHaveTextContent("ilgamcheck-매출-2026.csv를 내려받았어요");

  fireEvent.click(screen.getByRole("button", { name: "이전 달" }));
  fireEvent.click(screen.getByTestId("summary-download-month"));
  expect(clicked[2].getAttribute("download")).toBe("ilgamcheck-매출-2026-10.csv");
});

it("내려받기 링크는 문서에 붙여 누른 뒤 떼고, 파일 주소는 누른 즉시가 아니라 잠시 뒤 해제한다", () => {
  vi.useRealTimers();
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  vi.setSystemTime(new Date("2026-11-20T03:00:00.000Z"));
  render(<MonthlySummary timeZone="Asia/Seoul" />);

  fireEvent.click(screen.getByTestId("summary-download-month"));
  expect(clicked).toHaveLength(1);
  expect(connectedAtClick).toEqual([true]);
  expect(clicked[0].isConnected).toBe(false);
  // 바로 해제하면 브라우저가 내려받기를 시작하기 전에 파일을 잃을 수 있다.
  expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  act(() => { vi.advanceTimersByTime(1_000); });
  expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  act(() => { vi.advanceTimersByTime(60_000); });
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:monthly-summary");
});
