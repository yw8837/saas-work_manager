import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {} from "vitest/jsdom";

import { composeJob, PLAN_LIMITS } from "@/lib/domain";
import { FIRST_RUN_STORAGE_KEY } from "@/lib/first-run";
import { PENDING_STARTER_KEY } from "@/lib/starter-link";
import { applyIndustryStarter as applyToState, createStarterState, INDUSTRY_STARTERS } from "@/lib/store";
import { StarterLinkNotice } from "./starter-link-notice";
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

const starter = createStarterState("2026-11-05");
const applyIndustryStarter = vi.fn();
const originalUrl = window.location.href;
let session: MemoryStorage;

type Workspace = {
  hydrated?: boolean;
  runtimeMode?: "local" | "hosted";
  authStatus?: string;
  jobs?: ReturnType<typeof composeJob>[];
  jobsCreatedTotal?: number;
  packages?: typeof starter.packages;
};

function workspaceValue({ hydrated = true, runtimeMode = "local", authStatus = "local", jobs = [], jobsCreatedTotal, packages = starter.packages }: Workspace = {}) {
  return {
    hydrated,
    runtimeMode,
    authStatus,
    jobs,
    jobsCreatedTotal: jobsCreatedTotal ?? jobs.length,
    packages,
    applyIndustryStarter,
  } as unknown as ReturnType<typeof useWorkspace>;
}

function show(workspace: Workspace = {}) {
  vi.mocked(useWorkspace).mockReturnValue(workspaceValue(workspace));
  return render(<StarterLinkNotice />);
}

function job() {
  return composeJob({ jobId: "job_1", clientLabel: "고객", startDate: "2026-11-05", package: starter.packages[0], now: "2026-11-05T00:00:00.000Z" });
}

beforeEach(() => {
  session = new MemoryStorage();
  Object.defineProperty(window, "sessionStorage", { configurable: true, value: session });
  Object.defineProperty(window, "localStorage", { configurable: true, value: new MemoryStorage() });
  applyIndustryStarter.mockReset();
});

afterEach(() => {
  jsdom.reconfigure({ url: originalUrl });
});

describe("/today?starter=<업종>", () => {
  it("빈 작업공간: 업종 칩과 같은 applyIndustryStarter를 1번 부르고, 주소에서 지우고, 결과를 알린다", async () => {
    jsdom.reconfigure({ url: "https://ilgam.example/today?starter=design" });
    const view = show();
    await screen.findByTestId("starter-link-notice");
    expect(applyIndustryStarter).toHaveBeenCalledTimes(1);
    expect(applyIndustryStarter).toHaveBeenCalledWith("design");
    expect(window.location.search).toBe("");
    expect(session.getItem(PENDING_STARTER_KEY)).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(`디자인 예시 패키지 ${INDUSTRY_STARTERS.design.packages.length}개로 시작했어요. 금액과 횟수는 예시예요.`);
    expect(JSON.parse(window.localStorage.getItem(FIRST_RUN_STORAGE_KEY) ?? "{}")).toMatchObject({ packagesReviewed: true });
    // 다시 그려도 다시 적용하지 않는다.
    vi.mocked(useWorkspace).mockReturnValue(workspaceValue({ packages: INDUSTRY_STARTERS.design.packages }));
    view.rerender(<StarterLinkNotice />);
    expect(applyIndustryStarter).toHaveBeenCalledTimes(1);
  });

  it("새로 고침해도(주소에 파라미터 없음) 다시 적용하지 않는다", async () => {
    jsdom.reconfigure({ url: "https://ilgam.example/today?starter=design" });
    const first = show();
    await screen.findByTestId("starter-link-notice");
    first.unmount();
    applyIndustryStarter.mockReset();
    show();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(applyIndustryStarter).not.toHaveBeenCalled();
    expect(screen.queryByTestId("starter-link-notice")).not.toBeInTheDocument();
  });

  it("고친 패키지가 있으면 덮어쓰지 않고 짧게 알리기만 한다", async () => {
    jsdom.reconfigure({ url: "https://ilgam.example/today?starter=video" });
    const edited = starter.packages.map((item, index) => (index === 0 ? { ...item, price: 999_000 } : item));
    show({ packages: edited });
    expect(await screen.findByRole("status")).toHaveTextContent("예시 패키지로 바꾸지 않았어요");
    expect(applyIndustryStarter).not.toHaveBeenCalled();
    expect(window.location.search).toBe("");
    expect(session.getItem(PENDING_STARTER_KEY)).toBeNull();
    expect(window.localStorage.getItem(FIRST_RUN_STORAGE_KEY)).toBeNull();
  });

  it("일감이 있으면 덮어쓰지 않는다", async () => {
    jsdom.reconfigure({ url: "https://ilgam.example/today?starter=video" });
    show({ jobs: [job()], jobsCreatedTotal: 1 });
    expect(await screen.findByRole("status")).toHaveTextContent("예시 패키지로 바꾸지 않았어요");
    expect(applyIndustryStarter).not.toHaveBeenCalled();
  });

  it("일감을 지워 0건이어도 누적이 있으면 덮어쓰지 않는다", async () => {
    jsdom.reconfigure({ url: "https://ilgam.example/today?starter=video" });
    show({ jobs: [], jobsCreatedTotal: 2 });
    await screen.findByRole("status");
    expect(applyIndustryStarter).not.toHaveBeenCalled();
  });

  it("없는 업종 키는 아무것도 바꾸지 않고, 안내도 없고, 주소에서 지운다", async () => {
    jsdom.reconfigure({ url: "https://ilgam.example/today?starter=hacked" });
    show();
    await waitFor(() => expect(window.location.search).toBe(""));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(applyIndustryStarter).not.toHaveBeenCalled();
    expect(screen.queryByTestId("starter-link-notice")).not.toBeInTheDocument();
    expect(session.getItem(PENDING_STARTER_KEY)).toBeNull();
  });

  it("파라미터가 없으면 아무 일도 없다", async () => {
    jsdom.reconfigure({ url: "https://ilgam.example/today" });
    show();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(applyIndustryStarter).not.toHaveBeenCalled();
    expect(screen.queryByTestId("starter-link-notice")).not.toBeInTheDocument();
  });

  it("작업공간을 다 불러올 때까지 기다린다(서버 저장본을 보기 전에 판단하지 않는다)", async () => {
    jsdom.reconfigure({ url: "https://ilgam.example/today?starter=photo" });
    vi.mocked(useWorkspace).mockReturnValue(workspaceValue({ hydrated: false, runtimeMode: "hosted", authStatus: "loading" }));
    const view = render(<StarterLinkNotice />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    // 주소에서는 바로 지우지만 값은 남겨 둔다.
    expect(window.location.search).toBe("");
    expect(session.getItem(PENDING_STARTER_KEY)).toBe("photo");
    expect(applyIndustryStarter).not.toHaveBeenCalled();

    vi.mocked(useWorkspace).mockReturnValue(workspaceValue({ hydrated: true, runtimeMode: "hosted", authStatus: "signed_in" }));
    view.rerender(<StarterLinkNotice />);
    await screen.findByTestId("starter-link-notice");
    expect(applyIndustryStarter).toHaveBeenCalledTimes(1);
    expect(applyIndustryStarter).toHaveBeenCalledWith("photo");
  });

  it("로그인 왕복 뒤: 주소엔 파라미터가 없어도 보관한 값으로 적용한다", async () => {
    session.setItem(PENDING_STARTER_KEY, "video");
    jsdom.reconfigure({ url: "https://ilgam.example/today" });
    show({ runtimeMode: "hosted", authStatus: "signed_in" });
    await screen.findByTestId("starter-link-notice");
    expect(applyIndustryStarter).toHaveBeenCalledWith("video");
    expect(session.getItem(PENDING_STARTER_KEY)).toBeNull();
  });

  it("플랜 한도 등으로 실패하면 오류를 보여 준다", async () => {
    jsdom.reconfigure({ url: "https://ilgam.example/today?starter=design" });
    applyIndustryStarter.mockImplementation(() => { throw new Error("플랜 한도를 넘어요."); });
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent("플랜 한도를 넘어요.");
  });

  it("실제 적용 함수에 넘기면 고른 업종 예시만 남는다(칩과 같은 결과)", () => {
    const result = applyToState({ packages: starter.packages, options: starter.options, jobs: [], jobsCreatedTotal: 0 }, "design", PLAN_LIMITS.free, "2026-11-05T00:00:00.000Z");
    expect(result.packages.filter((item) => !item.archivedAt).map((item) => item.id)).toEqual(INDUSTRY_STARTERS.design.packages.map((item) => item.id));
  });
});
