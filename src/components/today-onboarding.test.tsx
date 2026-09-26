import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createSeedState } from "@/lib/store";
import { TodayDashboard } from "./today-dashboard";
import { useWorkspace } from "./workspace-provider";

vi.mock("./workspace-provider", async () => ({
  ...await vi.importActual<typeof import("./workspace-provider")>("./workspace-provider"),
  useWorkspace: vi.fn(),
}));

const seed = createSeedState("2026-08-16");
function show(jobs = seed.jobs) {
  vi.mocked(useWorkspace).mockReturnValue({
    jobs, alerts: [], settings: seed.settings, runtimeMode: "local",
    toggleTask: vi.fn(), toggleJobWaiting: vi.fn(), resetDemo: vi.fn(),
  } as unknown as ReturnType<typeof useWorkspace>);
  render(<TodayDashboard />);
}

describe("Today first-use priorities", () => {
  it("offers the first job and package setup without empty work summaries", () => {
    show([]);
    expect(screen.getByRole("link", { name: /첫 일감 만들기/ })).toHaveAttribute("href", "/jobs/new");
    expect(screen.getByRole("link", { name: /패키지 확인하기/ })).toHaveAttribute("href", "/packages");
    expect(screen.queryByRole("region", { name: "오늘 업무 요약" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "고객 답변 대기" })).not.toBeInTheDocument();
  });

  it("keeps the work summary and queues when jobs exist", () => {
    show();
    expect(screen.getByRole("region", { name: "오늘 업무 요약" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "우선 처리" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /첫 일감 만들기/ })).not.toBeInTheDocument();
  });
});
