import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DomainValidationError, composeJob, createAddon, confirmAddon, recordRevision, revertRevision, type PackageTemplate } from "@/lib/domain";
import { JobDetail } from "./job-detail";
import { useWorkspace } from "./workspace-provider";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
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
const cancelAddonSpy = vi.fn();
const createAddonSpy = vi.fn();
const confirmAddonSpy = vi.fn();

function renderDetail(job = baseJob()) {
  vi.mocked(useWorkspace).mockReturnValue({
    jobs: [job],
    runtimeMode: "local",
    saveStatus: "saved",
    toggleTask: vi.fn(),
    toggleJobWaiting: vi.fn(),
    completeJob: vi.fn(),
    deleteJob: vi.fn(),
    setRevisionPortalEnabled: vi.fn(),
    rotateRevisionPortalToken: vi.fn(),
    recordRevision: vi.fn(),
    revertRevision: revertRevisionSpy,
    updateJobLinks: vi.fn(),
    createAddon: createAddonSpy,
    confirmAddon: confirmAddonSpy,
    cancelAddon: cancelAddonSpy,
  } as unknown as ReturnType<typeof useWorkspace>);
  return render(<JobDetail jobId={job.id} />);
}

beforeEach(() => {
  revertRevisionSpy.mockReset();
  cancelAddonSpy.mockReset();
  createAddonSpy.mockReset();
  confirmAddonSpy.mockReset();
});

describe("JobDetail 원가·마진 노출", () => {
  it("계약 금액 옆에 예상 원가와 예상 마진·마진율을 그대로 보여준다", () => {
    renderDetail();

    expect(screen.getByTestId("job-estimated-cost")).toHaveTextContent("250,000원");
    expect(screen.getByTestId("job-margin")).toHaveTextContent("750,000원");
    expect(screen.getByTestId("job-margin")).toHaveTextContent("마진율 75%");
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

  it("타임라인에서 사유를 적어 되돌리기를 호출한다", () => {
    renderDetail(jobWithRevision());

    fireEvent.click(screen.getByTestId("revert-revision-revision_ui"));
    fireEvent.change(screen.getByLabelText("되돌림 사유"), { target: { value: "중복 접수" } });
    fireEvent.click(screen.getByTestId("revert-submit-revision_ui"));

    expect(revertRevisionSpy).toHaveBeenCalledWith("job_detail", "revision_ui", "중복 접수");
  });

  it("되돌린 요청은 원문을 지우지 않고 되돌림 배지와 사유를 함께 보여준다", () => {
    const reverted = revertRevision(jobWithRevision(), "revision_ui", "중복 접수", "2026-08-03T00:00:00.000Z");
    renderDetail(reverted);

    // 원문은 그대로 남는다.
    expect(screen.getByText("메인 문구 교체 부탁드려요.")).toBeInTheDocument();
    expect(screen.getByTestId("revert-note-revision_ui")).toHaveTextContent("되돌린 요청 · 중복 접수");
    expect(screen.getByText("되돌림")).toBeInTheDocument();
    // 되돌린 뒤에는 되돌리기 버튼이 사라지고 남은 횟수가 복구된다.
    expect(screen.queryByTestId("revert-revision-revision_ui")).not.toBeInTheDocument();
    expect(screen.getByText("2회 남음")).toBeInTheDocument();
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
