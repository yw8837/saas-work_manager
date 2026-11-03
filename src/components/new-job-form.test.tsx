import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { createSeedState, type AppSettings } from "@/lib/store";
import { NewJobForm } from "./new-job-form";
import { useWorkspace } from "./workspace-provider";

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));
vi.mock("./workspace-provider", async () => ({
  ...await vi.importActual("./workspace-provider"), useWorkspace: vi.fn(),
}));
const create = vi.fn();
function mockWorkspace(jobs: ReturnType<typeof createSeedState>["jobs"] = [], settings: Partial<AppSettings> = {}) {
  const state = createSeedState();
  vi.mocked(useWorkspace).mockReturnValue({
    packages: state.packages, options: state.options, jobs, settings: { ...state.settings, ...settings }, canCreateJob: true,
    createJob: create, plan: "pro", limits: { activeJobs: Infinity, totalJobs: Infinity },
  } as unknown as ReturnType<typeof useWorkspace>);
}
beforeEach(() => {
  create.mockReset(); nav.push.mockReset();
  mockWorkspace();
});

it.each(["throw", "empty"])("keeps input and permits retry when creation returns %s", (mode) => {
  create.mockImplementationOnce(() => { if (mode === "throw") throw new Error("등록 오류"); return ""; });
  create.mockReturnValue("created-job");
  render(<NewJobForm />);
  fireEvent.change(screen.getByLabelText(/고객 이름/), { target: { value: "입력 보존 고객" } });
  fireEvent.click(screen.getByTestId("submit-job-mobile"));
  expect(nav.push).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent(/등록|만들/);
  expect(screen.getByLabelText(/고객 이름/)).toHaveValue("입력 보존 고객");
  fireEvent.click(screen.getByTestId("submit-job-mobile"));
  expect(create).toHaveBeenCalledTimes(2);
  expect(nav.push).toHaveBeenCalledWith("/jobs/created-job?created=1");
});

it("새 일감 아래 띠와 미리보기는 쉬운 말로 보인다", () => {
  const view = render(<NewJobForm />);
  // 첫 패키지(Basic 홈페이지)는 할 일 5개다.
  const bar = view.container.querySelector(".mobileSubmitBar")!;
  expect(bar).toHaveTextContent("할 일 5개");
  expect(bar).not.toHaveTextContent("Todo");
  expect(screen.getByText("남는 돈(예상)")).toBeInTheDocument();
  expect(screen.getByTestId("preview-margin")).toHaveTextContent("남는 비율");
  expect(view.container).not.toHaveTextContent(/Todo|마진/);
});

it("데스크톱 미리보기는 '일감 만들기'를 할 일 목록보다 위에 두고, 할 일은 3개와 '외 N개'만 보인다", () => {
  const view = render(<NewJobForm />);
  const preview = view.container.querySelector(".jobPreview") as HTMLElement;
  const submit = within(preview).getByTestId("submit-job");
  const todoTitle = within(preview).getByText("생성될 체크리스트");
  expect(submit.compareDocumentPosition(todoTitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  // 첫 패키지(Basic 홈페이지)는 할 일 5개다.
  expect(within(preview).getAllByRole("listitem")).toHaveLength(3);
  expect(within(preview).getByText("외 2개")).toBeInTheDocument();
});

it("받은 곳은 비워 두고 '지난번: 크몽' 힌트만 보이며, 고르지 않으면 받은 곳 없이 만든다", () => {
  const [first, second] = createSeedState().jobs;
  mockWorkspace([
    { ...first, id: "job-older", createdAt: "2026-10-01T00:00:00.000Z", source: "soomgo" },
    { ...second, id: "job-newer", createdAt: "2026-11-01T00:00:00.000Z", source: "kmong" },
  ]);
  create.mockReturnValue("created-job");
  render(<NewJobForm />);

  // 고를 수도 비울 수도 있는 칩이라 라디오가 아니라 누름 버튼 묶음이다(라디오는 화살표 키로 움직이고 비울 수 없다).
  const group = screen.getByRole("group", { name: "받은 곳 (선택)" });
  expect(within(group).queryAllByRole("radio")).toHaveLength(0);
  expect(within(group).getAllByRole("button").map((chip) => chip.textContent)).toEqual(["크몽", "숨고", "소개", "직접 문의", "기타"]);
  for (const chip of within(group).getAllByRole("button")) expect(chip).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByTestId("order-source-kmong")).not.toHaveAttribute("aria-checked");
  expect(screen.getByTestId("order-source-hint")).toHaveTextContent("지난번: 크몽");

  fireEvent.click(screen.getByTestId("order-source-kmong"));
  expect(screen.getByTestId("order-source-kmong")).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByTestId("order-source-kmong"));
  expect(screen.getByTestId("order-source-kmong")).toHaveAttribute("aria-pressed", "false");
  fireEvent.change(screen.getByLabelText(/고객 이름/), { target: { value: "받은 곳 없는 고객" } });
  fireEvent.click(screen.getByTestId("submit-job-mobile"));
  expect(create).toHaveBeenCalledTimes(1);
  expect(create.mock.calls[0][0]).toMatchObject({ clientLabel: "받은 곳 없는 고객" });
  expect(create.mock.calls[0][0].source).toBeUndefined();
});

it("패키지 선택 단추와 옵션 체크박스는 내부 이름이 아니라 패키지·옵션 이름으로 읽힌다", () => {
  render(<NewJobForm />);
  const state = createSeedState();
  for (const item of state.packages.filter((pkg) => !pkg.archivedAt)) {
    const radio = screen.getByRole("radio", { name: item.name });
    expect(radio).toHaveAttribute("value", item.id);
  }
  for (const item of state.options.filter((option) => !option.archivedAt)) {
    expect(screen.getByRole("checkbox", { name: item.name })).toBeInTheDocument();
  }
});

it("일감이 없으면 받은 곳이 비어 있고, 고른 받은 곳을 새 일감에 넘긴다", () => {
  create.mockReturnValue("created-job");
  render(<NewJobForm />);
  expect(screen.queryByTestId("order-source-hint")).not.toBeInTheDocument();
  const group = screen.getByRole("group", { name: "받은 곳 (선택)" });
  for (const chip of within(group).getAllByRole("button")) expect(chip).toHaveAttribute("aria-pressed", "false");

  fireEvent.click(screen.getByTestId("order-source-referral"));
  expect(screen.getByTestId("order-source-referral")).toHaveAttribute("aria-pressed", "true");
  fireEvent.change(screen.getByLabelText(/고객 이름/), { target: { value: "소개 고객" } });
  fireEvent.click(screen.getByTestId("submit-job-mobile"));
  expect(create.mock.calls[0][0]).toMatchObject({ clientLabel: "소개 고객", source: "referral" });
});

it("기준을 정했을 때만, 덜 남는 주문이면 새 일감 아래 띠와 미리보기에 한 줄로 알리고 만들기는 막지 않는다", () => {
  mockWorkspace([], { minMarginPerJob: 700000 });
  create.mockReturnValue("created-job");
  render(<NewJobForm />);
  // 첫 패키지(Basic 홈페이지): 790,000원 − 예상 원가 95,000원 = 695,000원
  expect(screen.getByTestId("preview-margin-warning")).toHaveTextContent("기준보다 5,000원 적어요");
  expect(screen.getByTestId("preview-panel-margin-warning")).toHaveTextContent("남는 돈 695,000원 · 내 기준보다 5,000원 적어요");
  fireEvent.change(screen.getByLabelText(/고객 이름/), { target: { value: "덜 남는 주문" } });
  fireEvent.click(screen.getByTestId("submit-job-mobile"));
  expect(create).toHaveBeenCalledTimes(1);
});

it("기준이 없거나 남는 돈이 기준 이상이면 새 일감에서 알리지 않는다", () => {
  const first = render(<NewJobForm />);
  expect(screen.queryByTestId("preview-margin-warning")).not.toBeInTheDocument();
  expect(screen.queryByTestId("preview-panel-margin-warning")).not.toBeInTheDocument();
  first.unmount();
  mockWorkspace([], { minMarginPerJob: 600000 });
  render(<NewJobForm />);
  expect(screen.queryByTestId("preview-margin-warning")).not.toBeInTheDocument();
  expect(screen.queryByTestId("preview-panel-margin-warning")).not.toBeInTheDocument();
});

it("does not create a second job on repeated form submit", () => {
  create.mockReturnValue("created-job");
  const view = render(<NewJobForm />);
  fireEvent.change(screen.getByLabelText(/고객 이름/), { target: { value: "고객" } });
  const form = view.container.querySelector("form")!;
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(create).toHaveBeenCalledOnce();
});
