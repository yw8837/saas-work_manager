import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {} from "vitest/jsdom";

import { composeJob, type PackageTemplate } from "@/lib/domain";
import { JobDetail } from "./job-detail";
import { useWorkspace } from "./workspace-provider";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("./workspace-provider", async () => {
  const actual = await vi.importActual<typeof import("./workspace-provider")>("./workspace-provider");
  return { ...actual, useWorkspace: vi.fn() };
});

const template: PackageTemplate = {
  id: "pkg_send",
  name: "보내기 패키지",
  price: 500_000,
  estimatedCost: 0,
  durationDays: 5,
  revisionLimit: 2,
  tasks: [{ taskKey: "brief", title: "브리프 확인", relativeDay: 0, order: 0 }],
};

function job(enabled = true) {
  return {
    ...composeJob({ jobId: "job_send", revisionPortalToken: "token_send", clientLabel: "보내기 고객", startDate: "2026-10-30", package: template, now: "2026-10-30T00:00:00.000Z" }),
    revisionPortalEnabled: enabled,
  };
}

function renderAt(url: string, options: { runtimeMode?: "local" | "hosted"; saveStatus?: "saved" | "saving"; enabled?: boolean } = {}) {
  jsdom.reconfigure({ url });
  vi.mocked(useWorkspace).mockReturnValue({
    jobs: [job(options.enabled ?? true)],
    hydrated: true,
    runtimeMode: options.runtimeMode ?? "hosted",
    saveStatus: options.saveStatus ?? "saved",
  } as unknown as ReturnType<typeof useWorkspace>);
  return render(<JobDetail jobId="job_send" />);
}

const originalUrl = window.location.href;
afterEach(() => {
  jsdom.reconfigure({ url: originalUrl });
});

describe("일감 저장 직후 상세", () => {
  it("?created=1이면 헤더 바로 아래에 보내기 안내를 띄우고 실제 고객 링크를 담는다", () => {
    renderAt("https://ilgam.example/jobs/job_send?created=1");
    const banner = screen.getByTestId("send-to-client-banner");
    expect(screen.getByTestId("send-to-client-link")).toHaveValue("https://ilgam.example/r/token_send");
    // 모바일에서도 첫 화면에 보이도록 핵심 정보 띠보다 앞에 둔다.
    const rail = screen.getByRole("region", { name: "일감 핵심 정보" });
    expect(banner.compareDocumentPosition(rail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId("send-copy-link")).toBeEnabled();
  });

  it("체크리스트에서 온 ?send=1도 같은 안내를 띄운다", () => {
    renderAt("https://ilgam.example/jobs/job_send?send=1");
    expect(screen.getByTestId("send-to-client-banner")).toBeInTheDocument();
  });

  it("표시가 없으면 띄우지 않는다", () => {
    renderAt("https://ilgam.example/jobs/job_send");
    expect(screen.queryByTestId("send-to-client-banner")).not.toBeInTheDocument();
  });

  it("서버 저장 중이거나 링크가 꺼져 있으면 보내기를 막고 이유를 말한다", () => {
    renderAt("https://ilgam.example/jobs/job_send?created=1", { saveStatus: "saving" });
    expect(screen.getByTestId("send-copy-link")).toBeDisabled();
    expect(screen.getByText(/저장이 끝나면 보낼 수 있어요/)).toBeInTheDocument();
  });

  it("닫으면 사라지고 주소의 표시만 지운다(목록 복귀 정보는 남김)", () => {
    renderAt("https://ilgam.example/jobs/job_send?list=%2Fjobs%3Ffilter%3Dactive&created=1");
    fireEvent.click(screen.getByRole("button", { name: "고객에게 보내기 안내 닫기" }));
    expect(screen.queryByTestId("send-to-client-banner")).not.toBeInTheDocument();
    expect(window.location.search).toBe("?list=%2Fjobs%3Ffilter%3Dactive");
  });
});
