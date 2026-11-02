import { fireEvent, render, screen } from "@testing-library/react";
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
beforeEach(() => {
  create.mockReset(); nav.push.mockReset();
  const state = createSeedState();
  vi.mocked(useWorkspace).mockReturnValue({
    packages: state.packages, options: state.options, canCreateJob: true,
    createJob: create, plan: "pro", limits: { activeJobs: Infinity, totalJobs: Infinity },
  } as unknown as ReturnType<typeof useWorkspace>);
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

it("does not create a second job on repeated form submit", () => {
  create.mockReturnValue("created-job");
  const view = render(<NewJobForm />);
  fireEvent.change(screen.getByLabelText(/고객 이름/), { target: { value: "고객" } });
  const form = view.container.querySelector("form")!;
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(create).toHaveBeenCalledOnce();
});
