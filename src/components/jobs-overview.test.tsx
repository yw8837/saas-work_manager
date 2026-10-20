import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createSeedState } from "@/lib/store";
import { JobsOverview } from "./jobs-overview";
import { useWorkspace } from "./workspace-provider";

vi.mock("./workspace-provider", async () => ({
  ...await vi.importActual("./workspace-provider"), useWorkspace: vi.fn(),
}));
afterEach(() => { window.history.replaceState({}, "", "/"); });

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
