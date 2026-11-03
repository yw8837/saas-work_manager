import { describe, expect, it } from "vitest";
import { mergeConcurrentWorkspaceState } from "@/components/workspace-provider";
import { isHostedWorkspaceState, prepareStateForHosted } from "@/lib/supabase/workspace";
import { createWorkspaceExport } from "./export";
import { createSeedState, type AppState } from "./seed";
import { loadState, saveState } from "./storage";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

/** 첫 일감에 크몽 20% 스냅숏, 설정에 크몽 20%를 둔 저장본. */
function stateWithFees(): AppState {
  const state = createSeedState("2026-11-03");
  const [first, ...rest] = state.jobs;
  return {
    ...state,
    settings: { ...state.settings, feeRates: { kmong: 20 } },
    jobs: [{ ...first, source: "kmong", feeRate: 20 }, ...rest],
  };
}

describe("떼이는 비율 칸 저장·복원", () => {
  it("로컬 모드(브라우저 저장)에서 일감 비율과 설정 비율이 그대로 돌아온다", () => {
    const storage = new MemoryStorage();
    const state = stateWithFees();
    expect(saveState(state, storage)).toBe(true);
    const loaded = loadState(storage);
    expect(loaded.jobs[0].feeRate).toBe(20);
    expect(loaded.settings.feeRates).toEqual({ kmong: 20 });
  });

  it("비율 칸이 없던 예전 저장본도 그대로 읽힌다(0으로 취급)", () => {
    const storage = new MemoryStorage();
    const legacy = createSeedState("2026-11-03");
    saveState(legacy, storage);
    const loaded = loadState(storage);
    expect(loaded.jobs.some((job) => "feeRate" in job)).toBe(false);
    expect(loaded.settings.feeRates).toBeUndefined();
  });

  it("운영(Supabase) 저장 전 정리와 형식 검사가 칸을 거르지 않는다", () => {
    const prepared = prepareStateForHosted(stateWithFees());
    expect(isHostedWorkspaceState(prepared)).toBe(true);
    expect(prepared.jobs[0].feeRate).toBe(20);
    expect(prepared.settings.feeRates).toEqual({ kmong: 20 });
    // 저장 경로는 JSON 문서 그대로라 직렬화 왕복에서도 남는다.
    const roundTrip = JSON.parse(JSON.stringify(prepared)) as AppState;
    expect(isHostedWorkspaceState(roundTrip)).toBe(true);
    expect(roundTrip.jobs[0].feeRate).toBe(20);
  });

  it("JSON 백업 내보내기에 칸이 담기고 링크 토큰은 빠진다", () => {
    const exported = createWorkspaceExport(stateWithFees(), null, "2026-11-03T00:00:00.000Z");
    expect(exported.workspace.jobs[0].feeRate).toBe(20);
    expect(exported.workspace.settings.feeRates).toEqual({ kmong: 20 });
    expect("revisionPortalToken" in exported.workspace.jobs[0]).toBe(false);
  });

  it("두 기기가 서로 다른 받은 곳 비율을 적어도 충돌 없이 합친다", () => {
    const base = stateWithFees();
    const local = structuredClone(base);
    const remote = structuredClone(base);
    local.settings.feeRates = { kmong: 20, soomgo: 10 };
    remote.settings.feeRates = { kmong: 20, referral: 5 };
    const merged = mergeConcurrentWorkspaceState(base, local, remote);
    expect(merged.conflicts).toEqual([]);
    expect(merged.state.settings.feeRates).toEqual({ kmong: 20, soomgo: 10, referral: 5 });
  });
});
