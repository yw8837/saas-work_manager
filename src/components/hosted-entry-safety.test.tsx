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

  it("presents Hosted as a normal service with clear account entry actions", () => {
    process.env.NEXT_PUBLIC_STORAGE_MODE = "hosted";
    render(<MarketingHome />);
    expect(screen.getByTestId("landing-demo")).toHaveTextContent("무료로 시작하기");
    expect(screen.getByText("로그인")).toBeInTheDocument();
    expect(screen.queryByText(/초대받은|초대 베타|베타 계정/)).not.toBeInTheDocument();
  });

  it("keeps discovery links on the public landing and limits workspace entry to explicit CTAs", () => {
    process.env.NEXT_PUBLIC_STORAGE_MODE = "hosted";
    render(<MarketingHome />);

    expect(screen.getByRole("link", { name: "사용 방식" })).toHaveAttribute("href", "#workflow");
    expect(screen.getByRole("link", { name: "수정 관리" })).toHaveAttribute("href", "#revision");
    expect(screen.getByRole("link", { name: "자주 묻는 질문" })).toHaveAttribute("href", "#faq");
    expect(screen.getByRole("link", { name: "어떻게 편해지나요?" })).toHaveAttribute("href", "#workflow");

    const workspaceEntries = [
      screen.getByRole("link", { name: "로그인" }),
      ...screen.getAllByRole("link", { name: "무료로 시작하기" }),
    ];
    expect(workspaceEntries).toHaveLength(3);
    for (const entry of workspaceEntries) expect(entry).toHaveAttribute("href", "/today");
  });

  it("keeps the landing-page pricing and speed copy factual for the beta", () => {
    render(<MarketingHome />);

    expect(screen.getAllByText(/네 가지만 고르면/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/평균 30초/)).not.toBeInTheDocument();
    expect(screen.getByText(/30일 Pro 이용 코드를 적용한 계정/)).toBeInTheDocument();
    expect(screen.getByText(/Basic 정가 월 14,900원을 월 9,900원에 12개월/)).toBeInTheDocument();
  });

  it("keeps legal links quiet but findable in the public landing footer", () => {
    render(<MarketingHome />);

    expect(screen.getByRole("link", { name: "FAQ" })).toHaveAttribute("href", "#faq");
    expect(screen.getByRole("link", { name: "이용약관" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "개인정보처리방침" })).toHaveAttribute("href", "/privacy");
    expect(screen.queryByText(/사업자 정보\(.+등록 예정/)).not.toBeInTheDocument();
    expect(screen.queryByText(/초대 전용 폐쇄 베타/)).not.toBeInTheDocument();
  });

  it("shows only the registered business name and inquiry in the compact legal footer", () => {
    vi.stubEnv("NEXT_PUBLIC_BUSINESS_NAME", "열매스튜디오");
    vi.stubEnv("NEXT_PUBLIC_OPERATOR_NAME", "SudioYeolmae");
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_EMAIL", "support@example.com");
    render(<MarketingHome />);

    const legal = screen.getByRole("group", { name: "사업자 정보" });
    expect(legal).toHaveTextContent("사업자열매스튜디오");
    expect(legal).toHaveTextContent("문의support@example.com");
    expect(legal).not.toHaveTextContent("운영");
    expect(legal).not.toHaveTextContent("SudioYeolmae");
  });
});
