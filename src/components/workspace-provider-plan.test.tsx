import { act, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSeedState, createStarterState, saveState, type AppState } from "@/lib/store";
import { PLAN_LIMITS, TRIAL_DAYS } from "@/lib/domain";

vi.mock("@/lib/notifications", async () => {
  const actual = await vi.importActual<typeof import("@/lib/notifications")>("@/lib/notifications");
  return { ...actual, registerIlgamcheckServiceWorker: vi.fn().mockResolvedValue(undefined) };
});

vi.mock("@/lib/supabase", async () => {
  const actual = await vi.importActual<typeof import("@/lib/supabase")>("@/lib/supabase");
  return {
    ...actual,
    getHostedRuntimeBoundary: () => ({ requestedMode: "local", configured: false }),
    getSupabaseBrowserClient: () => null,
  };
});

import { WorkspaceProvider, useWorkspace } from "./workspace-provider";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const DAY_MS = 86_400_000;
/** 자동 체험이 이미 끝난 상태. 무료 한도를 그대로 보려면 이게 필요하다. */
const EXPIRED_TRIAL = new Date(Date.now() - (TRIAL_DAYS + 3) * DAY_MS).toISOString();

type Workspace = ReturnType<typeof useWorkspace>;
let workspace: Workspace | null = null;

function Probe() {
  const value = useWorkspace();
  // 렌더 중 바깥 변수를 건드리지 않도록 커밋 뒤에 최신 값을 넘긴다.
  useEffect(() => { workspace = value; });
  const { hydrated, plan, jobsCreatedTotal, canCreateJob, jobLimitHit, planAccess } = value;
  return (
    <div>
      <span data-testid="hydrated">{String(hydrated)}</span>
      <span data-testid="plan">{plan}</span>
      <span data-testid="plan-source">{planAccess.source}</span>
      <span data-testid="created-total">{jobsCreatedTotal}</span>
      <span data-testid="can-create">{String(canCreateJob)}</span>
      <span data-testid="limit-hit">{jobLimitHit ?? "none"}</span>
    </div>
  );
}

/** 저장본을 먼저 깔고 로컬 모드 provider를 띄운다. */
async function mountWith(seed: Partial<AppState>, base: AppState = createStarterState("2026-08-20")) {
  saveState({ ...base, ...seed }, window.localStorage);
  render(
    <WorkspaceProvider>
      <Probe />
    </WorkspaceProvider>,
  );
  // DOM만 기다리면 안 된다. workspace는 passive effect로 채워지는데,
  // React는 커밋 뒤 effect를 비동기로 흘리므로 DOM이 먼저 true가 되는 순간이 존재한다.
  // 그때 값을 읽으면 hydration 이전 상태를 보게 된다.
  await waitFor(() => {
    expect(screen.getByTestId("hydrated")).toHaveTextContent("true");
    expect(workspace?.hydrated).toBe(true);
  });
}

/** 진행 중 일감 2건이 들어 있는 저장본. 무료 동시 한도와 같은 수다. */
function twoActiveJobs(): AppState {
  const state = createSeedState("2026-08-20");
  expect(state.jobs.every((job) => job.status === "active")).toBe(true);
  return state;
}

function createOneJob() {
  const packageId = workspace!.packages.find((item) => !item.archivedAt)!.id;
  act(() => {
    workspace!.createJob({ clientLabel: "새 고객", startDate: "2026-08-20", packageId, optionIds: [] });
  });
}

beforeEach(() => {
  workspace = null;
  Object.defineProperty(window, "localStorage", { configurable: true, value: new MemoryStorage() });
});

describe("workspace plan — 누적 일감 카운터는 단조 증가한다", () => {
  it("완료해도 줄지 않는다", async () => {
    const base = twoActiveJobs();
    await mountWith({ jobsCreatedTotal: 5, trialStartedAt: EXPIRED_TRIAL }, base);
    expect(workspace!.jobsCreatedTotal).toBe(5);

    act(() => workspace!.completeJob(base.jobs[0].id));
    expect(workspace!.jobs.find((job) => job.id === base.jobs[0].id)?.status).toBe("completed");
    expect(workspace!.jobsCreatedTotal).toBe(5);
  });

  it("삭제해도 줄지 않는다", async () => {
    const base = twoActiveJobs();
    await mountWith({ jobsCreatedTotal: 7, trialStartedAt: EXPIRED_TRIAL }, base);

    act(() => workspace!.deleteJob(base.jobs[0].id));
    act(() => workspace!.deleteJob(base.jobs[1].id));
    expect(workspace!.jobs).toHaveLength(0);
    expect(workspace!.jobsCreatedTotal).toBe(7);
  });

  it("전체 초기화를 해도 카운터·체험·베타가 그대로 남는다", async () => {
    const base = twoActiveJobs();
    await mountWith(
      {
        jobsCreatedTotal: 9,
        trialStartedAt: EXPIRED_TRIAL,
        betaAccess: { code: "BETA2026", grantedAt: EXPIRED_TRIAL, expiresAt: EXPIRED_TRIAL },
      },
      base,
    );

    act(() => workspace!.resetDemo());
    expect(workspace!.jobs).toHaveLength(0);
    // 초기화로 0이 되면 "전체 초기화"가 무료 한도를 무한히 푸는 우회로가 된다.
    expect(workspace!.jobsCreatedTotal).toBe(9);
    expect(workspace!.trialStartedAt).toBe(EXPIRED_TRIAL);
    expect(workspace!.betaAccess?.code).toBe("BETA2026");
  });

  it("새 일감을 만들 때만 하나씩 올라간다", async () => {
    await mountWith({});
    expect(workspace!.jobsCreatedTotal).toBe(0);
    createOneJob();
    expect(workspace!.jobsCreatedTotal).toBe(1);
    createOneJob();
    expect(workspace!.jobsCreatedTotal).toBe(2);
  });
});

describe("workspace plan — 무료 한도", () => {
  it("누적 10건을 다 쓰면 일감이 하나도 없어도 막힌다", async () => {
    await mountWith({ jobsCreatedTotal: PLAN_LIMITS.free.totalJobs, trialStartedAt: EXPIRED_TRIAL });

    expect(screen.getByTestId("can-create")).toHaveTextContent("false");
    expect(screen.getByTestId("limit-hit")).toHaveTextContent("totalJobs");

    createOneJob();
    // 한도를 넘은 생성은 조용히 무시되고 카운터도 움직이지 않는다.
    expect(workspace!.jobs).toHaveLength(0);
    expect(workspace!.jobsCreatedTotal).toBe(PLAN_LIMITS.free.totalJobs);
  });

  it("동시 2건을 다 쓰면 누적이 남아 있어도 막힌다", async () => {
    await mountWith({ jobsCreatedTotal: 3, trialStartedAt: EXPIRED_TRIAL }, twoActiveJobs());

    expect(screen.getByTestId("can-create")).toHaveTextContent("false");
    expect(screen.getByTestId("limit-hit")).toHaveTextContent("activeJobs");
  });
});

describe("workspace plan — 체험과 베타 코드", () => {
  it("첫 일감을 만들면 7일 무제한 체험이 시작된다", async () => {
    await mountWith({});
    expect(screen.getByTestId("plan")).toHaveTextContent("free");
    expect(workspace!.trialStartedAt).toBeNull();

    createOneJob();
    expect(workspace!.trialStartedAt).not.toBeNull();
    expect(screen.getByTestId("plan")).toHaveTextContent("pro");
    expect(screen.getByTestId("plan-source")).toHaveTextContent("trial");
    expect(workspace!.planAccess.remainingDays).toBe(TRIAL_DAYS);

    // 두 번째 일감이 체험 시작 시각을 밀어 연장하지 않는다.
    const startedAt = workspace!.trialStartedAt;
    createOneJob();
    expect(workspace!.trialStartedAt).toBe(startedAt);
  });

  it("체험이 끝나면 조용히 무료로 돌아온다", async () => {
    await mountWith({ jobsCreatedTotal: 3, trialStartedAt: EXPIRED_TRIAL });

    expect(screen.getByTestId("plan")).toHaveTextContent("free");
    expect(workspace!.planAccess.trialExpired).toBe(true);
    expect(workspace!.planAccess.remainingDays).toBe(0);
  });

  it("탭을 열어둔 채 체험이 끝나면 틱이 알아서 무료로 내린다", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      // 30초 뒤에 만료되는 체험. 틱이 없으면 탭을 열어둔 동안 Pro로 남는다.
      const almostOver = new Date(Date.now() - (TRIAL_DAYS * DAY_MS - 30_000)).toISOString();
      await mountWith({ jobsCreatedTotal: 3, trialStartedAt: almostOver });
      expect(screen.getByTestId("plan")).toHaveTextContent("pro");

      await act(async () => { vi.advanceTimersByTime(120_000); });

      expect(screen.getByTestId("plan")).toHaveTextContent("free");
      expect(workspace!.planAccess.trialExpired).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("유효한 초대 코드는 Pro를 열고 누적 벽도 함께 풀린다", async () => {
    await mountWith({ jobsCreatedTotal: PLAN_LIMITS.free.totalJobs, trialStartedAt: EXPIRED_TRIAL });
    expect(screen.getByTestId("can-create")).toHaveTextContent("false");

    let result: { ok: boolean; message: string } | undefined;
    await act(async () => { result = await workspace!.activateInviteCode("  beta2026 "); });
    expect(result?.ok).toBe(true);
    expect(workspace!.betaAccess?.code).toBe("BETA2026");
    expect(screen.getByTestId("plan")).toHaveTextContent("pro");
    expect(screen.getByTestId("plan-source")).toHaveTextContent("beta");
    expect(screen.getByTestId("can-create")).toHaveTextContent("true");
  });

  it("모르는 코드는 아무것도 바꾸지 않는다", async () => {
    await mountWith({});
    let result: { ok: boolean; message: string } | undefined;
    await act(async () => { result = await workspace!.activateInviteCode("NOPE2026"); });
    expect(result?.ok).toBe(false);
    expect(workspace!.betaAccess).toBeNull();
    expect(screen.getByTestId("plan")).toHaveTextContent("free");
  });

  it("세션을 열어둔 채 체험이 끝나면 새로고침 없이도 무료로 내려온다", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      // 체험이 1분 뒤에 끝나는 상태에서 화면을 열어둔다.
      const startedAt = new Date(Date.now() - (TRIAL_DAYS * DAY_MS - 60_000)).toISOString();
      await mountWith({ jobsCreatedTotal: 4, trialStartedAt: startedAt });
      expect(screen.getByTestId("plan")).toHaveTextContent("pro");

      // 아무것도 저장하지 않고 시간만 흐른다.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5 * 60_000);
      });

      // 탭을 열어둔 것만으로 Pro가 유지되면 안 된다.
      expect(screen.getByTestId("plan")).toHaveTextContent("free");
      expect(workspace!.planAccess.trialExpired).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("만료된 코드를 다시 넣어 기간을 무한히 늘릴 수 없다", async () => {
    await mountWith({
      jobsCreatedTotal: 4,
      trialStartedAt: EXPIRED_TRIAL,
      betaAccess: {
        code: "BETA2026",
        grantedAt: new Date(Date.now() - 40 * DAY_MS).toISOString(),
        expiresAt: new Date(Date.now() - DAY_MS).toISOString(),
      },
      redeemedInviteCodes: ["BETA2026"],
    });
    expect(screen.getByTestId("plan")).toHaveTextContent("free");

    let result: { ok: boolean; message: string } | null = null;
    await act(async () => {
      result = await workspace!.activateInviteCode("beta2026");
    });

    expect(result!.ok).toBe(false);
    expect(result!.message).toContain("계정당 한 번");
    expect(screen.getByTestId("plan")).toHaveTextContent("free");
  });

  it("이미 다른 베타 코드를 쓴 계정도 두 번째 30일을 받을 수 없다", async () => {
    await mountWith({
      jobsCreatedTotal: 4,
      trialStartedAt: EXPIRED_TRIAL,
      betaAccess: {
        code: "KMONG2026",
        grantedAt: new Date(Date.now() - 40 * DAY_MS).toISOString(),
        expiresAt: new Date(Date.now() - DAY_MS).toISOString(),
      },
      redeemedInviteCodes: ["KMONG2026"],
    });

    let result: { ok: boolean; message: string } | null = null;
    await act(async () => {
      result = await workspace!.activateInviteCode("SOOMGO2026");
    });

    expect(result!.ok).toBe(false);
    expect(result!.message).toContain("계정당 한 번");
    expect(workspace!.redeemedInviteCodes).toEqual(["KMONG2026"]);
    expect(screen.getByTestId("plan")).toHaveTextContent("free");
  });

  it("전체 초기화로도 쓴 코드 이력이 지워지지 않는다", async () => {
    await mountWith({
      jobsCreatedTotal: 4,
      trialStartedAt: EXPIRED_TRIAL,
      redeemedInviteCodes: ["BETA2026"],
    });

    act(() => workspace!.resetDemo());

    // 초기화가 코드 재사용의 우회로가 되면 안 된다.
    let result: { ok: boolean; message: string } | null = null;
    await act(async () => {
      result = await workspace!.activateInviteCode("BETA2026");
    });
    expect(result!.ok).toBe(false);
  });

  it("만료된 베타 코드는 무료로 되돌리고 만료를 알린다", async () => {
    await mountWith({
      jobsCreatedTotal: 4,
      trialStartedAt: EXPIRED_TRIAL,
      betaAccess: {
        code: "BETA2026",
        grantedAt: new Date(Date.now() - 40 * DAY_MS).toISOString(),
        expiresAt: new Date(Date.now() - DAY_MS).toISOString(),
      },
    });

    expect(screen.getByTestId("plan")).toHaveTextContent("free");
    expect(workspace!.planAccess.betaExpired).toBe(true);
    expect(workspace!.planAccess.remainingDays).toBe(0);
  });
});
