import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createSeedState } from "@/lib/store";
import { MarketingHome } from "./marketing-home";
import { TodayDashboard } from "./today-dashboard";
import { useWorkspace } from "./workspace-provider";

vi.mock("./workspace-provider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./workspace-provider")>()),
  useWorkspace: vi.fn(),
}));

const originalStorageMode = process.env.NEXT_PUBLIC_STORAGE_MODE;
const seed = createSeedState("2026-08-17");

function mockWorkspace(runtimeMode: "local" | "hosted") {
  vi.mocked(useWorkspace).mockReturnValue({
    ...seed,
    runtimeMode,
    toggleTask: vi.fn(),
    toggleJobWaiting: vi.fn(),
    resetDemo: vi.fn(),
    alerts: [],
  } as unknown as ReturnType<typeof useWorkspace>);
}

afterEach(() => {
  if (originalStorageMode === undefined) delete process.env.NEXT_PUBLIC_STORAGE_MODE;
  else process.env.NEXT_PUBLIC_STORAGE_MODE = originalStorageMode;
});

describe("Hosted entry safety", () => {
  it("never renders the destructive demo reset control in Hosted mode", () => {
    mockWorkspace("hosted");
    render(<TodayDashboard />);
    expect(screen.queryByRole("button", { name: "전체 초기화" })).not.toBeInTheDocument();
  });

  it("keeps the reset control available only in local demo mode", () => {
    mockWorkspace("local");
    render(<TodayDashboard />);
    expect(screen.getByRole("button", { name: "전체 초기화" })).toBeInTheDocument();
  });

  it("does not advertise a public demo when the deployment is a closed Hosted beta", () => {
    process.env.NEXT_PUBLIC_STORAGE_MODE = "hosted";
    render(<MarketingHome />);
    expect(screen.getByTestId("landing-demo")).toHaveTextContent("초대받은 베타 참여자 로그인");
    expect(screen.queryByText("지금 바로 시작")).not.toBeInTheDocument();
    expect(screen.getByText(/초대받은 계정만 이용 가능/)).toBeInTheDocument();
  });
});
