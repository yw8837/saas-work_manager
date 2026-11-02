import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AppRoutes, SITE_ROUTE_PATHS } from "./routes";

// 경로가 어느 화면을 그리는지만 본다. 작업공간 문지기·셸과 무거운 화면은 이름만 남긴다.
vi.mock("@/components/workspace-auth-gate", () => ({ WorkspaceAuthGate: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("@/components/beta-activation-gate", () => ({ BetaActivationGate: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("@/components/job-detail", () => ({ JobDetail: ({ jobId }: { jobId: string }) => <p>일감 상세 {jobId}</p> }));
vi.mock("@/components/monthly-summary", () => ({ MonthlySummary: () => <p>월별 정리 화면</p> }));

describe("Sites route contract", () => {
  it("preserves every public and workspace path used by the Next application", () => {
    expect(SITE_ROUTE_PATHS).toEqual([
      "/",
      "/today",
      "/jobs",
      "/jobs/new",
      "/jobs/summary",
      "/jobs/:id",
      "/packages",
      "/settings",
      "/feedback",
      "/r/:token",
      "/privacy",
      "/terms",
      "/guide",
      "/demo/r",
      "/apply",
      "/apply/confirm/:token",
      "/u/:token",
      "/ops/applications",
    ]);
  });

  it("/jobs/summary는 일감 상세가 아니라 월별 정리를 그린다", () => {
    render(<MemoryRouter initialEntries={["/jobs/summary"]}><AppRoutes /></MemoryRouter>);
    expect(screen.getByText("월별 정리 화면")).toBeInTheDocument();
    expect(screen.queryByText(/일감 상세/)).not.toBeInTheDocument();
  });

  it("다른 일감 주소는 지금처럼 일감 상세를 그린다", () => {
    render(<MemoryRouter initialEntries={["/jobs/job_seed_mora"]}><AppRoutes /></MemoryRouter>);
    expect(screen.getByText("일감 상세 job_seed_mora")).toBeInTheDocument();
    expect(screen.queryByText("월별 정리 화면")).not.toBeInTheDocument();
  });
});
