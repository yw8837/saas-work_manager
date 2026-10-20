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

it("does not create a second job on repeated form submit", () => {
  create.mockReturnValue("created-job");
  const view = render(<NewJobForm />);
  fireEvent.change(screen.getByLabelText(/고객 이름/), { target: { value: "고객" } });
  const form = view.container.querySelector("form")!;
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(create).toHaveBeenCalledOnce();
});
