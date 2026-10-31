import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { composeJob, recordRevision } from "@/lib/domain";
import { createStarterState, INDUSTRY_STARTERS } from "@/lib/store";
import { FirstRunChecklist } from "./first-run-checklist";
import { useWorkspace } from "./workspace-provider";

vi.mock("./workspace-provider", async () => ({
  ...await vi.importActual<typeof import("./workspace-provider")>("./workspace-provider"),
  useWorkspace: vi.fn(),
}));

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

const starter = createStarterState("2026-10-30");
const applyIndustryStarter = vi.fn();

function job() {
  return composeJob({ jobId: "job_first", clientLabel: "첫 고객", startDate: "2026-10-30", package: starter.packages[0], now: "2026-10-30T00:00:00.000Z" });
}

type Job = ReturnType<typeof composeJob>;
function show({ jobs = [], packages = starter.packages, compact = false, jobsCreatedTotal }: { jobs?: Job[]; packages?: typeof starter.packages; compact?: boolean; jobsCreatedTotal?: number } = {}) {
  jobsCreatedTotal ??= jobs.length;
  vi.mocked(useWorkspace).mockReturnValue({ jobs, packages, jobsCreatedTotal, applyIndustryStarter } as unknown as ReturnType<typeof useWorkspace>);
  return render(<FirstRunChecklist compact={compact} />);
}

beforeEach(() => {
  Object.defineProperty(window, "localStorage", { configurable: true, value: new MemoryStorage() });
  applyIndustryStarter.mockReset();
});

describe("오늘 화면 첫 실행 체크리스트", () => {
  it("새 작업공간: 0/3 진행률과 세 단계, 업종 고르기, 첫 일감·패키지로 가는 길", () => {
    show();
    expect(screen.getByTestId("first-run-progress")).toHaveTextContent("0/3 완료");
    expect(screen.getByRole("progressbar", { name: "첫 실행 진행률" })).toHaveAttribute("aria-valuenow", "0");
    expect(screen.getByTestId("first-run-step-packages")).toHaveAttribute("data-state", "current");
    expect(screen.getByRole("group", { name: "업종 고르기" })).toBeInTheDocument();
    expect(screen.getByTestId("industry-web")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("link", { name: /첫 일감 만들기/ })).toHaveAttribute("href", "/jobs/new");
    expect(screen.getByRole("link", { name: /패키지 확인하기/ })).toHaveAttribute("href", "/packages");
    // 단계별 설명서 그림은 지금 할 단계 하나만
    expect(screen.getAllByRole("img")).toHaveLength(1);
  });

  it("업종을 직접 고를 때만 예시를 바꾸고, 결과를 알리며 1단계를 끝낸다", () => {
    show();
    fireEvent.click(screen.getByTestId("industry-video"));
    expect(applyIndustryStarter).toHaveBeenCalledWith("video");
    expect(screen.getByRole("status")).toHaveTextContent(`영상 예시 패키지 ${INDUSTRY_STARTERS.video.packages.length}개로 바꿨어요. 금액은 예시예요.`);
    expect(screen.getByTestId("first-run-progress")).toHaveTextContent("1/3 완료");
  });

  it("예시를 바꾸지 못하면 이유를 경고로 보여 준다", () => {
    applyIndustryStarter.mockImplementation(() => { throw new Error("한도를 넘어요"); });
    show();
    fireEvent.click(screen.getByTestId("industry-photo"));
    expect(screen.getByRole("alert")).toHaveTextContent("한도를 넘어요");
  });

  it("일감을 만든 적이 있으면 업종 고르기는 숨긴다", () => {
    show({ jobsCreatedTotal: 1 });
    expect(screen.queryByRole("group", { name: "업종 고르기" })).not.toBeInTheDocument();
  });

  it("첫 일감 뒤에는 작게 남아 그 일감의 보내기 화면으로 안내하고, 닫을 수 있다", () => {
    show({ jobs: [job()], compact: true });
    expect(screen.getByTestId("first-run-progress")).toHaveTextContent("2/3 완료");
    expect(screen.getByTestId("first-run-send-link")).toHaveAttribute("href", "/jobs/job_first?send=1");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "첫 실행 안내 닫기" }));
    expect(screen.queryByTestId("first-run-checklist")).not.toBeInTheDocument();
  });

  it("고객 링크로 요청이 들어온 뒤에는 다 끝난 것으로 보고 그리지 않는다", () => {
    const withCustomer = recordRevision(job(), { source: "public", body: "고객 요청", submittedAt: "2026-10-30T02:00:00.000Z" }).job;
    show({ jobs: [withCustomer], compact: true });
    expect(screen.queryByTestId("first-run-checklist")).not.toBeInTheDocument();
  });
});
