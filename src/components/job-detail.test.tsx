import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {} from "vitest/jsdom";

import { DomainValidationError, completeRevision, composeJob, createAddon, confirmAddon, markRevisionExtraScope, recordRevision, revertRevision, toggleIntakeItem, toggleJobCompletion, type PackageTemplate } from "@/lib/domain";
import { JobDetail } from "./job-detail";
import { useWorkspace } from "./workspace-provider";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const device = vi.hoisted(() => ({ platform: "web" }));
vi.mock("@/lib/native/platform", async () => ({
  ...await vi.importActual<typeof import("@/lib/native/platform")>("@/lib/native/platform"),
  nativePlatform: () => device.platform,
}));
vi.mock("./workspace-provider", async () => {
  const actual = await vi.importActual<typeof import("./workspace-provider")>("./workspace-provider");
  return { ...actual, useWorkspace: vi.fn() };
});

const template: PackageTemplate = {
  id: "pkg_detail",
  name: "상세 패키지",
  price: 1_000_000,
  estimatedCost: 250_000,
  durationDays: 10,
  revisionLimit: 2,
  tasks: [{ taskKey: "brief", title: "브리프 확인", relativeDay: 0, order: 0 }],
};

function baseJob() {
  return composeJob({
    jobId: "job_detail",
    revisionPortalToken: "token_detail",
    clientLabel: "상세 고객",
    startDate: "2026-08-01",
    package: template,
    now: "2026-08-01T00:00:00.000Z",
  });
}

const revertRevisionSpy = vi.fn();
const completeRevisionSpy = vi.fn();
const markExtraScopeSpy = vi.fn();
const recordRevisionSpy = vi.fn();
const toggleIntakeSpy = vi.fn();
const cancelAddonSpy = vi.fn();
const createAddonSpy = vi.fn();
const confirmAddonSpy = vi.fn();
const setJobSourceSpy = vi.fn();
const completeJobSpy = vi.fn();
const setPortalSpy = vi.fn();

function renderDetail(job = baseJob(), options: { runtimeMode?: "local" | "hosted"; settings?: { minMarginPerJob?: number } } = {}) {
  vi.mocked(useWorkspace).mockReturnValue({
    jobs: [job],
    settings: options.settings ?? {},
    hydrated: true,
    runtimeMode: options.runtimeMode ?? "local",
    saveStatus: "saved",
    toggleTask: vi.fn(),
    toggleIntake: toggleIntakeSpy,
    toggleJobWaiting: vi.fn(),
    completeJob: completeJobSpy,
    deleteJob: vi.fn(),
    setRevisionPortalEnabled: setPortalSpy,
    rotateRevisionPortalToken: vi.fn(),
    recordRevision: recordRevisionSpy,
    revertRevision: revertRevisionSpy,
    completeRevision: completeRevisionSpy,
    markRevisionExtraScope: markExtraScopeSpy,
    updateJobLinks: vi.fn(),
    createAddon: createAddonSpy,
    confirmAddon: confirmAddonSpy,
    cancelAddon: cancelAddonSpy,
    setJobSource: setJobSourceSpy,
  } as unknown as ReturnType<typeof useWorkspace>);
  return render(<JobDetail jobId={job.id} />);
}

beforeEach(() => {
  device.platform = "web";
  revertRevisionSpy.mockReset();
  completeRevisionSpy.mockReset();
  markExtraScopeSpy.mockReset();
  recordRevisionSpy.mockReset();
  toggleIntakeSpy.mockReset();
  cancelAddonSpy.mockReset();
  createAddonSpy.mockReset();
  confirmAddonSpy.mockReset();
  setJobSourceSpy.mockReset();
  completeJobSpy.mockReset();
  setPortalSpy.mockReset();
});

/** 제공자가 상태를 바꾼 뒤의 화면: 같은 동작 함수에 일감만 바꿔 다시 그린다. */
function showUpdated(view: ReturnType<typeof render>, job: ReturnType<typeof baseJob>) {
  const current = vi.mocked(useWorkspace).mock.results.at(-1)!.value as ReturnType<typeof useWorkspace>;
  vi.mocked(useWorkspace).mockReturnValue({ ...current, jobs: [job] });
  view.rerender(<JobDetail jobId={job.id} />);
}

describe("JobDetail 하단 바 '일감 완료'", () => {
  it("버튼은 바와 구분되는 흰 바탕이고, 휴대폰에서도 '일감 완료'라고 대상을 말한다", () => {
    renderDetail();
    const button = screen.getByTestId("complete-job");
    expect(button).toHaveClass("invertedButton");
    expect(button).not.toHaveClass("primaryButton");
    expect(within(button).getByText("일감 완료")).toHaveClass("buttonLabelMobile");
  });

  it("누르면 바로 완료하고 화면 아래 '되돌리기' 알림을 띄우며, 되돌리면 고객 링크도 다시 연다", () => {
    const view = renderDetail();
    fireEvent.click(screen.getByTestId("complete-job"));
    expect(completeJobSpy).toHaveBeenCalledWith("job_detail");
    const toast = screen.getByTestId("job-toast");
    expect(toast).toHaveAttribute("role", "status");
    expect(toast).toHaveTextContent("일감을 완료했어요. 고객 링크도 닫혔어요.");

    // 제공자는 완료하면서 링크를 닫는다.
    showUpdated(view, { ...toggleJobCompletion(baseJob(), "2026-08-02T00:00:00.000Z"), revisionPortalEnabled: false });
    fireEvent.click(within(screen.getByTestId("job-toast")).getByRole("button", { name: "되돌리기" }));
    expect(completeJobSpy).toHaveBeenCalledTimes(2);
    expect(completeJobSpy).toHaveBeenLastCalledWith("job_detail");
    expect(setPortalSpy).toHaveBeenCalledWith("job_detail", true);
    expect(screen.queryByTestId("job-toast")).not.toBeInTheDocument();
  });

  it("링크를 꺼 둔 일감은 링크 말을 빼고, 되돌려도 링크를 켜지 않는다", () => {
    const off = { ...baseJob(), revisionPortalEnabled: false };
    const view = renderDetail(off);
    fireEvent.click(screen.getByTestId("complete-job"));
    expect(screen.getByTestId("job-toast")).toHaveTextContent("일감을 완료했어요.");
    expect(screen.getByTestId("job-toast")).not.toHaveTextContent("고객 링크");
    showUpdated(view, toggleJobCompletion(off, "2026-08-02T00:00:00.000Z"));
    fireEvent.click(screen.getByRole("button", { name: "되돌리기" }));
    expect(completeJobSpy).toHaveBeenCalledTimes(2);
    expect(setPortalSpy).not.toHaveBeenCalled();
  });

  it("이미 다시 진행한 뒤에는 알림의 '되돌리기'가 일감을 또 바꾸지 않는다", () => {
    const view = renderDetail();
    fireEvent.click(screen.getByTestId("complete-job"));
    // 알림이 떠 있는 동안 다른 길(다른 기기 등)로 이미 다시 진행 중이 됐다.
    showUpdated(view, baseJob());
    fireEvent.click(screen.getByRole("button", { name: "되돌리기" }));
    expect(completeJobSpy).toHaveBeenCalledTimes(1);
    expect(setPortalSpy).not.toHaveBeenCalled();
  });

  it("완료한 일감은 '다시 진행'으로 보이고 누르면 알림 없이 다시 진행한다", () => {
    renderDetail(toggleJobCompletion(baseJob(), "2026-08-02T00:00:00.000Z"));
    const button = screen.getByTestId("complete-job");
    expect(within(button).getByText("다시 진행", { selector: ".buttonLabelMobile" })).toBeInTheDocument();
    fireEvent.click(button);
    expect(completeJobSpy).toHaveBeenCalledWith("job_detail");
    expect(screen.queryByTestId("job-toast")).not.toBeInTheDocument();
  });
});

describe("JobDetail 처리 결과 알림", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function pendingJob() {
    return recordRevision(baseJob(), { revisionId: "revision_toast", source: "public", body: "사진 교체", submittedAt: "2026-08-02T00:00:00.000Z" }).job;
  }

  it("처리 결과는 맨 아래 문단이 아니라 화면 아래 알림 하나로 보이고 잠시 뒤 닫힌다", () => {
    vi.useFakeTimers();
    renderDetail(pendingJob());
    fireEvent.click(screen.getByTestId("complete-revision-revision_toast"));
    const toast = screen.getByTestId("job-toast");
    expect(toast).toHaveClass("actionToast");
    expect(toast).toHaveAttribute("role", "status");
    expect(toast).toHaveTextContent("수정 완료로 1회를 썼어요. 고객 링크에도 남은 횟수가 바로 반영돼요.");
    expect(document.querySelector(".detailFeedback")).toBeNull();

    // 다른 처리를 하면 알림은 하나로 바뀐다(쌓이지 않음).
    fireEvent.click(screen.getByTestId("extra-revision-revision_toast"));
    expect(screen.getAllByTestId("job-toast")).toHaveLength(1);
    expect(screen.getByTestId("job-toast")).toHaveTextContent("추가 작업으로 분류했어요.");

    act(() => { vi.advanceTimersByTime(4000); });
    expect(screen.queryByTestId("job-toast")).not.toBeInTheDocument();
  });

  it("오류는 경고 알림으로 띄우고 닫을 때까지 둔다", () => {
    vi.useFakeTimers();
    completeRevisionSpy.mockImplementation(() => { throw new Error("저장하지 못했어요."); });
    renderDetail(pendingJob());
    fireEvent.click(screen.getByTestId("complete-revision-revision_toast"));
    const toast = screen.getByTestId("job-toast");
    expect(toast).toHaveAttribute("role", "alert");
    expect(toast).toHaveTextContent("저장하지 못했어요.");
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(screen.getByTestId("job-toast")).toBeInTheDocument();
    fireEvent.click(within(screen.getByTestId("job-toast")).getByRole("button", { name: "닫기" }));
    expect(screen.queryByTestId("job-toast")).not.toBeInTheDocument();
  });
});

describe("JobDetail 고객 수정 링크", () => {
  const originalUrl = window.location.href;
  it("scrolls to revision history only after the target job has rendered", () => {
    jsdom.reconfigure({ url: "https://localhost/jobs/job_detail#revisions" });
    const scroll = vi.fn();
    HTMLElement.prototype.scrollIntoView = scroll;
    renderDetail();
    expect(document.getElementById("revisions")).not.toBeNull();
    expect(scroll).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
  });
  afterEach(() => {
    jsdom.reconfigure({ url: originalUrl });
    vi.unstubAllEnvs();
  });
  it.each(["android", "ios"])("%s shares the public HTTPS link, not the WebView origin", async (platform) => {
    device.platform = platform;
    jsdom.reconfigure({ url: platform === "android" ? "https://localhost" : "capacitor://localhost" });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    renderDetail();
    fireEvent.click(screen.getByTestId("copy-revision-portal"));
    expect(writeText).toHaveBeenCalledWith("https://ilgam.studioyeolmae.com/r/token_detail");
  });
  it.each([
    "https://ilgamcheck-beta.bsfire1237.chatgpt.site",
    "https://ilgam.studioyeolmae.com",
  ])("접속 주소 %s의 보호된 /r 경로로 bearer token을 복사한다", async (origin) => {
    jsdom.reconfigure({ url: origin });
    vi.stubEnv("NEXT_PUBLIC_SITE_ORIGIN", "https://ilgam.studioyeolmae.com");
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    renderDetail();

    fireEvent.click(screen.getByTestId("copy-revision-portal"));

    expect(writeText).toHaveBeenCalledWith(`${origin}/r/token_detail`);
  });
});

describe("JobDetail 새 요청 띠", () => {
  it("확인 대기 요청이 있으면 제목 아래에 띠를 보이고 수정 요청 구획으로 보낸다", () => {
    renderDetail(recordRevision(baseJob(), {
      revisionId: "revision_strip",
      source: "public",
      body: "사진 교체 부탁드려요.",
      submittedAt: "2026-08-02T00:00:00.000Z",
    }).job);

    const strip = screen.getByTestId("pending-request-strip");
    expect(strip).toHaveTextContent("고객 요청 1건이 확인을 기다려요");
    expect(strip.closest("a") ?? strip.querySelector("a")).toHaveAttribute("href", "#revisions");
    // 제목 바로 아래, 핵심 정보 줄보다 위에 둔다.
    const title = screen.getByRole("heading", { level: 1, name: "상세 고객" });
    expect(title.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const rail = screen.getByRole("region", { name: "일감 핵심 정보" });
    expect(strip.compareDocumentPosition(rail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("확인 대기 요청이 없으면 띠가 없다", () => {
    renderDetail();
    expect(screen.queryByTestId("pending-request-strip")).not.toBeInTheDocument();
    // 반려한 요청은 기다리는 요청이 아니다.
    const rejected = revertRevision(
      recordRevision(baseJob(), { revisionId: "revision_rejected", source: "public", body: "질문", submittedAt: "2026-08-02T00:00:00.000Z" }).job,
      "revision_rejected",
      "질문이라 대화창으로 답함",
      "2026-08-02T01:00:00.000Z",
    );
    renderDetail(rejected);
    expect(screen.queryByTestId("pending-request-strip")).not.toBeInTheDocument();
  });
});

describe("JobDetail 받은 곳", () => {
  it("제목 위 받은 곳을 두 번 눌러 바꾸거나 지우고, 완료한 일감에서도 된다", () => {
    const job = { ...toggleJobCompletion(baseJob(), "2026-08-02T00:00:00.000Z"), source: "kmong" as const };
    renderDetail(job);
    const button = screen.getByTestId("job-source");
    expect(button).toHaveTextContent("크몽");
    expect(screen.queryByRole("radiogroup", { name: "받은 곳" })).not.toBeInTheDocument();

    fireEvent.click(button);
    const group = screen.getByRole("radiogroup", { name: "받은 곳" });
    expect(within(group).getByTestId("job-source-kmong")).toHaveAttribute("aria-checked", "true");
    fireEvent.click(within(group).getByTestId("job-source-soomgo"));
    expect(setJobSourceSpy).toHaveBeenCalledWith(job.id, "soomgo");
    expect(screen.queryByRole("radiogroup", { name: "받은 곳" })).not.toBeInTheDocument();

    // 고른 받은 곳을 다시 누르면 지운다.
    fireEvent.click(button);
    fireEvent.click(screen.getByTestId("job-source-kmong"));
    expect(setJobSourceSpy).toHaveBeenLastCalledWith(job.id, undefined);
  });

  it("받은 곳이 없는 예전 일감은 '받은 곳'으로 보이고 골라 넣을 수 있다", () => {
    renderDetail();
    const button = screen.getByTestId("job-source");
    expect(button).toHaveTextContent("받은 곳");
    fireEvent.click(button);
    for (const radio of within(screen.getByRole("radiogroup", { name: "받은 곳" })).getAllByRole("radio")) {
      expect(radio).toHaveAttribute("aria-checked", "false");
    }
    fireEvent.click(screen.getByTestId("job-source-referral"));
    expect(setJobSourceSpy).toHaveBeenCalledWith("job_detail", "referral");
  });
});

describe("JobDetail 쉬운 말·짧은 설명", () => {
  it("수정 횟수 규칙은 접기 하나로 모으고, 고객 링크 구획의 긴 설명은 뺀다", () => {
    renderDetail();
    const summary = screen.getByText("수정 횟수는 이렇게 세요");
    const rules = summary.closest("details");
    expect(rules).not.toBeNull();
    expect(rules).toHaveTextContent(
      "고객 요청은 먼저 확인 대기로 들어와요. 고친 뒤 ‘수정 완료’를 누르면 1회를 써요. 질문·중복은 ‘반려’, 범위 밖은 ‘추가 작업으로’를 눌러요. 둘 다 횟수를 안 써요.",
    );
    const portal = screen.getByRole("heading", { name: "고객 수정 요청 링크" }).closest("section")!;
    expect(portal).not.toHaveTextContent("먼저 확인 대기로 들어와요");
    // 로컬 모드 안내는 상황에 꼭 필요한 문장이라 그대로 둔다.
    expect(portal).toHaveTextContent("지금은 이 브라우저에 저장하는 모드라 링크도 이 브라우저에서만 열려요.");
    expect(screen.getByText("초안으로 적어 두고, 고객이 동의하면 확정해요. 확정하면 금액·마감·할 일에 반영돼요.")).toBeInTheDocument();
  });

  it("로그인 모드의 고객 링크 안내는 앞말 없이 짧게 쓴다", () => {
    renderDetail(baseJob(), { runtimeMode: "hosted" });
    const portal = screen.getByRole("heading", { name: "고객 수정 요청 링크" }).closest("section")!;
    expect(portal).toHaveTextContent("저장이 끝나면 링크에 반영돼요. 재발급하면 이전 주소는 못 써요.");
    expect(portal).not.toHaveTextContent("Hosted");
  });

  it("수정 요청 구획은 '기록', 주문 조건 구획은 쉬운 말로 쓴다", () => {
    renderDetail();
    expect(screen.getByRole("heading", { name: "수정 요청 기록" })).toBeInTheDocument();
    expect(screen.getByText("주문할 때 조건을 그대로 보관해요.")).toBeInTheDocument();
    // '로그인'은 쉬운 말이라 두고, 개발 말 '로그'·'스냅샷'·'Hosted'만 막는다.
    expect(document.body).not.toHaveTextContent(/로그(?!인|아웃)|스냅샷|Hosted/);
  });

  it("추가요청 입력과 기록에 Todo 대신 할 일을 쓴다", () => {
    renderDetail();
    fireEvent.click(screen.getByTestId("open-addon"));
    expect(screen.getByLabelText(/추가 할 일/)).toBeInTheDocument();
    expect(screen.getByLabelText(/시작 며칠 뒤/)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/Todo/);
  });
});

describe("JobDetail 고객에게 보낼 말", () => {
  it("핵심 정보 줄 바로 아래, 할 일 목록보다 위에 둔다", () => {
    renderDetail();
    const messages = screen.getByTestId("client-messages");
    const rail = screen.getByRole("region", { name: "일감 핵심 정보" });
    const tasks = screen.getByRole("heading", { name: "작업 체크리스트" });
    expect(rail.compareDocumentPosition(messages) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(messages.compareDocumentPosition(tasks) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("JobDetail 최소 남길 돈", () => {
  it("기준보다 덜 남으면 '남는 돈(예상)' 칸 아래에 한 줄로 알린다", () => {
    // 1,000,000원 − 예상 원가 250,000원 = 750,000원
    renderDetail(baseJob(), { settings: { minMarginPerJob: 800_000 } });
    const warning = screen.getByTestId("job-margin-warning");
    expect(warning).toHaveTextContent("남는 돈 750,000원 · 내 기준보다 50,000원 적어요");
    expect(screen.getByTestId("job-margin").closest("dl")).toContainElement(warning);
  });

  it("기준이 없거나 남는 돈이 기준 이상이면 알리지 않는다", () => {
    const first = renderDetail();
    expect(screen.queryByTestId("job-margin-warning")).not.toBeInTheDocument();
    first.unmount();
    renderDetail(baseJob(), { settings: { minMarginPerJob: 700_000 } });
    expect(screen.queryByTestId("job-margin-warning")).not.toBeInTheDocument();
  });
});

describe("JobDetail 원가·마진 노출", () => {
  it("계약 금액 옆에 예상 원가와 남는 돈(예상)·남는 비율을 그대로 보여준다", () => {
    renderDetail();

    expect(screen.getByTestId("job-estimated-cost")).toHaveTextContent("250,000원");
    expect(screen.getByText("남는 돈(예상)")).toBeInTheDocument();
    expect(screen.getByTestId("job-margin")).toHaveTextContent("750,000원");
    expect(screen.getByTestId("job-margin")).toHaveTextContent("남는 비율 75%");
    expect(screen.getByRole("region", { name: "일감 핵심 정보" })).not.toHaveTextContent(/마진/);
  });

  it("추가요청을 확정하면 화면의 원가·마진도 같이 움직인다", () => {
    const job = baseJob();
    const draft = createAddon(job, {
      addonId: "addon_margin",
      title: "배너",
      amountDelta: 200_000,
      estimatedCostDelta: 100_000,
      durationDaysDelta: 0,
      createdAt: "2026-08-02T00:00:00.000Z",
    });
    const confirmed = confirmAddon({ ...job, addons: [draft] }, "addon_margin", "2026-08-03T00:00:00.000Z");

    renderDetail(confirmed);

    expect(screen.getByTestId("job-estimated-cost")).toHaveTextContent("350,000원");
    expect(screen.getByTestId("job-margin")).toHaveTextContent("850,000원");
  });
});

describe("JobDetail 수정 되돌리기", () => {
  function jobWithRevision() {
    return recordRevision(baseJob(), {
      revisionId: "revision_ui",
      source: "manual",
      channel: "kakao",
      body: "메인 문구 교체 부탁드려요.",
      submittedAt: "2026-08-02T00:00:00.000Z",
    }).job;
  }

  // 고객 화면·안내가 "작업이 진행 중이면…"이라고 조건을 다는 근거. 끝난 일감의 기록은 흔들지 않는다.
  it("완료된 일감에서는 반려·되돌리기·수정 완료 버튼을 내주지 않는다", () => {
    renderDetail({ ...jobWithRevision(), status: "completed" as const });
    expect(screen.getByText("메인 문구 교체 부탁드려요.")).toBeInTheDocument();
    expect(screen.queryByTestId("revert-revision-revision_ui")).not.toBeInTheDocument();
    expect(screen.queryByTestId("complete-revision-revision_ui")).not.toBeInTheDocument();
  });

  it("새 요청은 '확인 대기'로 보이고, 수정 완료·추가 작업으로·반려를 고를 수 있다", () => {
    renderDetail(jobWithRevision());

    expect(screen.getByTestId("revision-badge-revision_ui")).toHaveTextContent("확인 대기");
    expect(screen.getByTestId("revision-pending-count")).toHaveTextContent("확인 대기 1건");
    // 접수만으로는 횟수를 쓰지 않는다.
    expect(screen.getByRole("heading", { name: "수정 2회 남음" })).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("complete-revision-revision_ui"));
    expect(completeRevisionSpy).toHaveBeenCalledWith("job_detail", "revision_ui");
    fireEvent.click(screen.getByTestId("extra-revision-revision_ui"));
    expect(markExtraScopeSpy).toHaveBeenCalledWith("job_detail", "revision_ui");
  });

  it("확인 대기 요청은 사유를 적어 반려한다(횟수를 쓰지 않음)", () => {
    renderDetail(jobWithRevision());

    expect(screen.getByTestId("revert-revision-revision_ui")).toHaveTextContent("반려");
    fireEvent.click(screen.getByTestId("revert-revision-revision_ui"));
    fireEvent.change(screen.getByLabelText("반려 사유"), { target: { value: "질문이라 대화창으로 답함" } });
    fireEvent.click(screen.getByTestId("revert-submit-revision_ui"));

    expect(revertRevisionSpy).toHaveBeenCalledWith("job_detail", "revision_ui", "질문이라 대화창으로 답함");
    expect(screen.getByText("요청을 반려했어요. 원문은 남기고 횟수는 쓰지 않았어요.")).toBeInTheDocument();
  });

  it("반려한 요청은 원문을 남기고 '반려' 배지와 사유를 보여 준다", () => {
    renderDetail(revertRevision(jobWithRevision(), "revision_ui", "질문", "2026-08-03T00:00:00.000Z"));

    expect(screen.getByText("메인 문구 교체 부탁드려요.")).toBeInTheDocument();
    expect(screen.getByTestId("revert-note-revision_ui")).toHaveTextContent("반려한 요청 · 질문");
    expect(screen.getByTestId("revision-badge-revision_ui")).toHaveTextContent("반려");
    expect(screen.getByRole("heading", { name: "수정 2회 남음" })).toBeInTheDocument();
  });

  it("수정 완료로 센 요청은 회차를 보이고, 되돌리면 되돌림 배지와 사유가 남고 1회가 돌아온다", () => {
    const done = completeRevision(jobWithRevision(), "revision_ui", "2026-08-02T10:00:00.000Z");
    const { unmount } = renderDetail(done);
    expect(screen.getByTestId("revision-badge-revision_ui")).toHaveTextContent("1회차");
    expect(screen.getByRole("heading", { name: "수정 1회 남음" })).toBeInTheDocument();
    // 이미 센 요청에는 수정 완료·추가 작업 버튼이 없고 되돌리기만 있다.
    expect(screen.queryByTestId("complete-revision-revision_ui")).not.toBeInTheDocument();
    expect(screen.queryByTestId("extra-revision-revision_ui")).not.toBeInTheDocument();
    expect(screen.getByTestId("revert-revision-revision_ui")).toHaveTextContent("되돌리기");
    unmount();

    renderDetail(revertRevision(done, "revision_ui", "중복 접수", "2026-08-03T00:00:00.000Z"));
    expect(screen.getByTestId("revert-note-revision_ui")).toHaveTextContent("되돌린 요청 · 중복 접수");
    expect(screen.getByTestId("revision-badge-revision_ui")).toHaveTextContent("되돌림");
    expect(screen.getByRole("heading", { name: "수정 2회 남음" })).toBeInTheDocument();
  });

  it("추가 작업 요청을 되돌리면 '사용 횟수에서 뺐다'가 아니라 횟수가 그대로라고 알려 준다", () => {
    renderDetail(markRevisionExtraScope(jobWithRevision(), "revision_ui", "2026-08-02T05:00:00.000Z"));
    expect(screen.getByTestId("revision-badge-revision_ui")).toHaveTextContent("추가 작업");
    fireEvent.click(screen.getByTestId("revert-revision-revision_ui"));
    fireEvent.click(screen.getByTestId("revert-submit-revision_ui"));
    expect(screen.getByText("추가 작업 요청을 되돌렸어요. 원문은 그대로 두었고 남은 횟수는 바뀌지 않아요.")).toBeInTheDocument();
  });

  it("남은 포함 수정이 없으면 '수정 완료'를 막고 추가 작업으로 안내한다", () => {
    let job = jobWithRevision();
    for (const id of ["done_a", "done_b"]) {
      job = completeRevision(recordRevision(job, { revisionId: id, source: "public", body: `${id} 요청` }).job, id);
    }
    renderDetail(job);

    expect(screen.getByRole("heading", { name: "수정 0회 남음" })).toBeInTheDocument();
    expect(screen.getByTestId("complete-revision-revision_ui")).toBeDisabled();
    expect(screen.getByTestId("extra-revision-revision_ui")).toBeEnabled();
  });

  it("메신저로 받은 요청은 '요청으로 기록'(대기) 또는 '수정 완료로 기록'(바로 1회)으로 적는다", () => {
    renderDetail();
    fireEvent.click(screen.getByTestId("record-revision"));
    expect(screen.getByTestId("revision-impact")).toHaveTextContent("확인 대기로 기록 · 고친 뒤 1회 사용");
    fireEvent.change(screen.getByLabelText("수정 요청 내용"), { target: { value: "전화로 받은 문구 수정" } });
    fireEvent.click(screen.getByTestId("record-revision-done"));
    expect(recordRevisionSpy).toHaveBeenCalledWith("job_detail", "전화로 받은 문구 수정", "kakao", true);

    fireEvent.click(screen.getByTestId("record-revision"));
    fireEvent.change(screen.getByLabelText("수정 요청 내용"), { target: { value: "카톡으로 받은 요청" } });
    fireEvent.click(screen.getByRole("button", { name: /요청으로 기록/ }));
    expect(recordRevisionSpy).toHaveBeenLastCalledWith("job_detail", "카톡으로 받은 요청", "kakao", false);
  });
});

describe("JobDetail 시작 전 받을 자료", () => {
  it("패키지에 목록이 있으면 받음 개수와 체크 버튼을 보여 주고, 누르면 받음을 바꾼다", () => {
    const job = toggleIntakeItem(
      composeJob({
        jobId: "job_detail",
        revisionPortalToken: "token_detail",
        clientLabel: "상세 고객",
        startDate: "2026-08-01",
        package: { ...template, intakeItems: ["상호명", "참고 이미지"] },
        now: "2026-08-01T00:00:00.000Z",
      }),
      "job_detail_intake_1",
      "2026-08-01T01:00:00.000Z",
    );
    renderDetail(job);

    const section = screen.getByTestId("intake-section");
    expect(section).toHaveTextContent("1/2 받음");
    expect(screen.getByTestId("intake-toggle-job_detail_intake_1")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByTestId("intake-toggle-job_detail_intake_2"));
    expect(toggleIntakeSpy).toHaveBeenCalledWith("job_detail", "job_detail_intake_2");
  });

  it("목록이 없으면 구획을 그리지 않는다", () => {
    renderDetail();
    expect(screen.queryByTestId("intake-section")).not.toBeInTheDocument();
  });
});

describe("JobDetail 추가요청 취소", () => {
  function jobWithDraft() {
    const job = baseJob();
    return {
      ...job,
      addons: [
        createAddon(job, {
          addonId: "addon_ui",
          title: "배너 3종",
          amountDelta: 200_000,
          estimatedCostDelta: 50_000,
          durationDaysDelta: 1,
          createdAt: "2026-08-02T00:00:00.000Z",
        }),
      ],
    };
  }

  it("초안은 확인 창 없이 바로 취소한다", () => {
    renderDetail(jobWithDraft());

    fireEvent.click(screen.getByTestId("cancel-addon-addon_ui"));

    expect(cancelAddonSpy).toHaveBeenCalledWith("job_detail", "addon_ui");
  });

  it("확정본 취소는 되돌림 범위를 확인받은 뒤에만 호출한다", () => {
    const confirmed = confirmAddon(jobWithDraft(), "addon_ui", "2026-08-03T00:00:00.000Z");
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderDetail(confirmed);

    fireEvent.click(screen.getByTestId("cancel-addon-addon_ui"));
    expect(cancelAddonSpy).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByTestId("cancel-addon-addon_ui"));
    expect(cancelAddonSpy).toHaveBeenCalledWith("job_detail", "addon_ui");
    confirmSpy.mockRestore();
  });

  it("취소된 추가요청은 숨기지 않고 취소됨으로 남긴다", () => {
    const job = jobWithDraft();
    const cancelled = {
      ...job,
      addons: job.addons.map((addon) => ({ ...addon, status: "cancelled" as const, cancelledAt: "2026-08-03T00:00:00.000Z" })),
    };
    renderDetail(cancelled);

    expect(screen.getByText("취소됨")).toBeInTheDocument();
    expect(screen.getByText("배너 3종")).toBeInTheDocument();
    expect(screen.queryByTestId("cancel-addon-addon_ui")).not.toBeInTheDocument();
  });

  it("끝난 일감에 남은 초안은 확정 버튼을 내주지 않는다", () => {
    const job = jobWithDraft();
    renderDetail({ ...job, status: "completed" as const });

    // 기록은 그대로 보이되, 금액·마감·Todo를 흔드는 확정은 취소 버튼과 같이 사라진다.
    expect(screen.getByText("배너 3종")).toBeInTheDocument();
    expect(screen.queryByTestId("confirm-addon-addon_ui")).not.toBeInTheDocument();
    expect(screen.queryByTestId("cancel-addon-addon_ui")).not.toBeInTheDocument();
  });

  it("확정이 도메인 오류로 막히면 던지지 않고 이유를 보여준다", () => {
    confirmAddonSpy.mockImplementation(() => {
      throw new DomainValidationError("업무 키 'addon-1'가 기존 할 일과 중복됩니다.", "DUPLICATE_TASK_KEY");
    });
    renderDetail(jobWithDraft());

    expect(() => fireEvent.click(screen.getByTestId("confirm-addon-addon_ui"))).not.toThrow();

    expect(confirmAddonSpy).toHaveBeenCalledWith("job_detail", "addon_ui");
    expect(screen.getByText("업무 키 'addon-1'가 기존 할 일과 중복됩니다.")).toBeInTheDocument();
  });

  it("추가요청 원가를 입력하면 초안에 그대로 넘긴다", () => {
    renderDetail();

    fireEvent.click(screen.getByTestId("open-addon"));
    fireEvent.change(screen.getByLabelText("추가요청 내용"), { target: { value: "배너 3종" } });
    fireEvent.change(screen.getByLabelText("추가금 (원)"), { target: { value: "200000" } });
    fireEvent.change(screen.getByLabelText("추가 원가 (원)"), { target: { value: "50000" } });
    fireEvent.click(screen.getByRole("button", { name: /초안 기록/ }));

    expect(createAddonSpy).toHaveBeenCalledWith(
      "job_detail",
      expect.objectContaining({ amountDelta: 200_000, estimatedCostDelta: 50_000 }),
    );
  });
});
