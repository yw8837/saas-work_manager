import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { composeJob, recordRevision } from "@/lib/domain";
import { FIRST_RUN_STORAGE_KEY } from "@/lib/first-run";
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
  it("새 작업공간: 웹 예시 그대로면 1단계는 끝난 것으로 접고, 첫 일감 만들기를 지금 할 일로 둔다", () => {
    show();
    expect(screen.getByTestId("first-run-progress")).toHaveTextContent("1/3 완료");
    expect(screen.getByRole("progressbar", { name: "첫 실행 진행률" })).toHaveAttribute("aria-valuenow", "1");
    const packagesStep = screen.getByTestId("first-run-step-packages");
    expect(packagesStep).toHaveAttribute("data-state", "done");
    expect(packagesStep).toHaveTextContent("웹·홈페이지 예시로 시작했어요");
    // 끝난 단계는 설명 글을 접는다(업종 칩은 작게 남는다).
    expect(packagesStep).not.toHaveTextContent("업종을 고르면");
    expect(screen.getByTestId("first-run-step-first-job")).toHaveAttribute("data-state", "current");
    expect(screen.getByRole("link", { name: /첫 일감 만들기/ })).toHaveAttribute("href", "/jobs/new");
    // 단계별 설명서 그림은 지금 할 단계 하나만(끝난 1단계 그림은 접는다)
    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(within(packagesStep).queryByRole("img")).not.toBeInTheDocument();
  });

  it("접힌 1단계: 첫 줄은 '예시로 시작했어요 · 패키지 확인하기', 그 아래 작은 업종 칩이 바로 보이고 '다른 업종' 펼침 버튼은 없다", () => {
    show();
    const line = screen.getByTestId("first-run-starter-line");
    // 가운뎃점은 CSS(::after)로 그린다. 글은 두 항목뿐이다.
    expect(line.children).toHaveLength(2);
    expect(line).toHaveTextContent("웹·홈페이지 예시로 시작했어요");
    expect(within(line).getByRole("link", { name: /패키지 확인하기/ })).toHaveAttribute("href", "/packages");
    expect(screen.queryByTestId("first-run-other-industry")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "다른 업종" })).not.toBeInTheDocument();

    const packagesStep = screen.getByTestId("first-run-step-packages");
    const picker = within(packagesStep).getByRole("group", { name: "업종 고르기" });
    expect(picker).toHaveClass("firstRunIndustryChips");
    expect(within(picker).getAllByRole("button").map((chip) => chip.textContent)).toEqual(["웹·홈페이지", "디자인", "영상", "촬영"]);
    expect(screen.getByTestId("industry-web")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("industry-design")).toHaveAttribute("aria-pressed", "false");
    // 칩 줄은 첫 줄 아래에 둔다. 같은 링크를 두 번 두지 않는다.
    expect(line.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /패키지 확인하기/ })).toHaveLength(1);
  });

  it("웹이 아닌 업종도 칩 한 번으로 예시를 바꾸고, 결과를 알린다", () => {
    show();
    fireEvent.click(screen.getByTestId("industry-video"));
    expect(applyIndustryStarter).toHaveBeenCalledTimes(1);
    expect(applyIndustryStarter).toHaveBeenCalledWith("video");
    expect(screen.getByRole("status")).toHaveTextContent(`영상 예시 패키지 ${INDUSTRY_STARTERS.video.packages.length}개로 바꿨어요. 금액은 예시예요.`);
    expect(screen.getByTestId("first-run-progress")).toHaveTextContent("1/3 완료");
  });

  it("바꾼 업종이 첫 줄과 눌린 칩에 보인다", () => {
    show({ packages: INDUSTRY_STARTERS.design.packages });
    expect(screen.getByTestId("first-run-starter-line")).toHaveTextContent("디자인 예시로 시작했어요");
    expect(screen.getByTestId("industry-design")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("industry-web")).toHaveAttribute("aria-pressed", "false");
  });

  it("업종을 알 수 없는 패키지로 1단계를 끝냈으면 '패키지를 정했어요'와 눌리지 않은 업종 칩을 보인다", () => {
    window.localStorage.setItem(FIRST_RUN_STORAGE_KEY, JSON.stringify({ packagesReviewed: true }));
    show({ packages: [...starter.packages, ...INDUSTRY_STARTERS.design.packages] });
    expect(screen.getByTestId("first-run-step-packages")).toHaveAttribute("data-state", "done");
    expect(screen.getByTestId("first-run-starter-line")).toHaveTextContent("패키지를 정했어요");
    for (const chip of within(screen.getByRole("group", { name: "업종 고르기" })).getAllByRole("button")) {
      expect(chip).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("예시를 바꾸지 못하면 이유를 경고로 보여 준다", () => {
    applyIndustryStarter.mockImplementation(() => { throw new Error("한도를 넘어요"); });
    show();
    fireEvent.click(screen.getByTestId("industry-photo"));
    expect(screen.getByRole("alert")).toHaveTextContent("한도를 넘어요");
  });

  it("업종 예시가 섞여 어느 업종인지 모르면 1단계를 지금 할 일로 펼쳐 둔다", () => {
    show({ packages: [...starter.packages, ...INDUSTRY_STARTERS.design.packages] });
    expect(screen.getByTestId("first-run-progress")).toHaveTextContent("0/3 완료");
    expect(screen.getByTestId("first-run-step-packages")).toHaveAttribute("data-state", "current");
    expect(screen.getByRole("group", { name: "업종 고르기" })).toBeInTheDocument();
    expect(screen.queryByTestId("first-run-other-industry")).not.toBeInTheDocument();
  });

  it("일감을 만든 적이 있으면 업종 고르기는 숨긴다", () => {
    show({ jobsCreatedTotal: 1 });
    expect(screen.queryByRole("group", { name: "업종 고르기" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("first-run-other-industry")).not.toBeInTheDocument();
  });

  it("단계 그림 설명은 잘린 그림 칸(최대 높이 240px)에 실제로 보이는 부분만 말한다", () => {
    // 칸(폭 200px·최대 높이 240px)에 750px 폭 그림은 높이 900px까지 보인다.
    // 1단계: 패키지 그림(722px)은 받을 자료·착수 전 질문 칸과 저장 버튼까지 다 보인다.
    let view = show({ packages: [...starter.packages, ...INDUSTRY_STARTERS.design.packages] });
    expect(screen.getByTestId("first-run-step-packages")).toHaveAttribute("data-state", "current");
    expect(screen.getByRole("img")).toHaveAttribute("alt", "받을 자료·착수 전 질문 칸과 패키지 저장 버튼이 보이는 패키지 화면 예시");
    view.unmount();
    // 2단계: 새 일감 그림(970px)은 고객 이름·시작일·패키지·옵션 칸이 보이고 맨 아래 '일감 만들기' 바 일부만 칸 밖이다.
    view = show();
    expect(screen.getByTestId("first-run-step-first-job")).toHaveAttribute("data-state", "current");
    expect(screen.getByRole("img")).toHaveAttribute("alt", "고객 이름·시작일·패키지·옵션 칸이 보이는 새 일감 화면 예시");
    view.unmount();
    // 3단계: 저장 직후 안내 그림은 칸 안에 다 들어간다.
    show({ jobs: [job()] });
    expect(screen.getByTestId("first-run-step-send-link")).toHaveAttribute("data-state", "current");
    expect(screen.getByRole("img")).toHaveAttribute("alt", "카톡 문구 복사 버튼과 보낼 문구가 보이는 저장 직후 안내 예시");
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

describe("예시 금액 안내", () => {
  it("예시 패키지 그대로 첫 일감을 만들 때 '예시 금액이에요 · 바꾸기' 한 줄이 패키지 화면으로 이어진다", () => {
    show();
    const step = screen.getByTestId("first-run-step-first-job");
    const line = within(step).getByTestId("first-run-sample-price");
    expect(line).toHaveTextContent("예시 금액이에요 · 바꾸기");
    expect(within(line).getByRole("link", { name: "바꾸기" })).toHaveAttribute("href", "/packages");
  });

  it("내 패키지로 고쳤으면 안내하지 않는다", () => {
    show({ packages: starter.packages.map((item, index) => index === 0 ? { ...item, id: "pkg_mine", name: "내 패키지" } : item) });
    expect(screen.queryByTestId("first-run-sample-price")).not.toBeInTheDocument();
  });
});
