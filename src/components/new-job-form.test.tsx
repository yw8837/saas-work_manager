import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { createSeedState } from "@/lib/store";
import { NewJobForm } from "./new-job-form";
import { useWorkspace } from "./workspace-provider";

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));
vi.mock("./workspace-provider", async () => ({
  ...await vi.importActual("./workspace-provider"), useWorkspace: vi.fn(),
}));
const create = vi.fn();
function mockWorkspace(jobs: ReturnType<typeof createSeedState>["jobs"] = []) {
  const state = createSeedState();
  vi.mocked(useWorkspace).mockReturnValue({
    packages: state.packages, options: state.options, jobs, canCreateJob: true,
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

it("가장 최근 일감의 받은 곳이 처음부터 골라져 있고, 다시 누르면 풀려서 받은 곳 없이 만든다", () => {
  const [first, second] = createSeedState().jobs;
  mockWorkspace([
    { ...first, id: "job-older", createdAt: "2026-10-01T00:00:00.000Z", source: "soomgo" },
    { ...second, id: "job-newer", createdAt: "2026-11-01T00:00:00.000Z", source: "kmong" },
  ]);
  create.mockReturnValue("created-job");
  render(<NewJobForm />);

  const group = screen.getByRole("radiogroup", { name: "받은 곳 (선택)" });
  expect(within(group).getAllByRole("radio").map((radio) => radio.textContent)).toEqual(["크몽", "숨고", "소개", "직접 문의", "기타"]);
  expect(screen.getByTestId("order-source-kmong")).toHaveAttribute("aria-checked", "true");
  expect(screen.getByTestId("order-source-soomgo")).toHaveAttribute("aria-checked", "false");

  fireEvent.click(screen.getByTestId("order-source-kmong"));
  expect(screen.getByTestId("order-source-kmong")).toHaveAttribute("aria-checked", "false");
  fireEvent.change(screen.getByLabelText(/고객 이름/), { target: { value: "받은 곳 없는 고객" } });
  fireEvent.click(screen.getByTestId("submit-job-mobile"));
  expect(create).toHaveBeenCalledTimes(1);
  expect(create.mock.calls[0][0]).toMatchObject({ clientLabel: "받은 곳 없는 고객" });
  expect(create.mock.calls[0][0].source).toBeUndefined();
});

it("일감이 없으면 받은 곳이 비어 있고, 고른 받은 곳을 새 일감에 넘긴다", () => {
  create.mockReturnValue("created-job");
  render(<NewJobForm />);
  const group = screen.getByRole("radiogroup", { name: "받은 곳 (선택)" });
  for (const radio of within(group).getAllByRole("radio")) expect(radio).toHaveAttribute("aria-checked", "false");

  fireEvent.click(screen.getByTestId("order-source-referral"));
  expect(screen.getByTestId("order-source-referral")).toHaveAttribute("aria-checked", "true");
  fireEvent.change(screen.getByLabelText(/고객 이름/), { target: { value: "소개 고객" } });
  fireEvent.click(screen.getByTestId("submit-job-mobile"));
  expect(create.mock.calls[0][0]).toMatchObject({ clientLabel: "소개 고객", source: "referral" });
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
