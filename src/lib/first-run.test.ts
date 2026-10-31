import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { composeJob, recordRevision } from "@/lib/domain";
import { seedPackages } from "@/lib/store/seed";
import { FIRST_RUN_STORAGE_KEY, firstRunSteps, markFirstRun, readFirstRunFlags } from "./first-run";

const NO_FLAGS = { packagesReviewed: false, linkShared: false, dismissed: false };

function job() {
  return composeJob({ jobId: "job_first", clientLabel: "고객", startDate: "2026-10-30", package: seedPackages[0], now: "2026-10-30T00:00:00.000Z" });
}

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

let storage: MemoryStorage;
beforeEach(() => {
  storage = new MemoryStorage();
  Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("첫 실행 체크리스트 단계", () => {
  it("아무것도 안 했으면 0/3", () => {
    expect(firstRunSteps({ jobs: [], flags: NO_FLAGS, packagesCustomized: false }).map((step) => step.done)).toEqual([false, false, false]);
  });

  it("패키지를 고쳤거나 화면을 봤으면 1단계 완료", () => {
    expect(firstRunSteps({ jobs: [], flags: NO_FLAGS, packagesCustomized: true })[0].done).toBe(true);
    expect(firstRunSteps({ jobs: [], flags: { ...NO_FLAGS, packagesReviewed: true }, packagesCustomized: false })[0].done).toBe(true);
  });

  it("일감이 있으면 1·2단계 완료, 링크를 복사하면 3단계 완료", () => {
    const steps = firstRunSteps({ jobs: [job()], flags: NO_FLAGS, packagesCustomized: false });
    expect(steps.map((step) => step.done)).toEqual([true, true, false]);
    expect(firstRunSteps({ jobs: [job()], flags: { ...NO_FLAGS, linkShared: true }, packagesCustomized: false })[2].done).toBe(true);
  });

  it("복사 표시가 없어도 고객 링크로 들어온 요청이 있으면 링크는 보낸 것으로 본다", () => {
    const withCustomer = recordRevision(job(), { source: "public", body: "고객 요청", submittedAt: "2026-10-30T02:00:00.000Z" }).job;
    expect(firstRunSteps({ jobs: [withCustomer], flags: NO_FLAGS, packagesCustomized: false })[2].done).toBe(true);
  });

  it("링크 복사 표시만 있고 일감이 없으면 3단계는 끝나지 않는다", () => {
    expect(firstRunSteps({ jobs: [], flags: { ...NO_FLAGS, linkShared: true }, packagesCustomized: false })[2].done).toBe(false);
  });
});

describe("첫 실행 표시 저장", () => {
  it("이 브라우저에 표시를 남기고 같은 값이면 같은 객체를 돌려준다", () => {
    const listener = vi.fn();
    window.addEventListener("ilgam:first-run", listener);
    markFirstRun("linkShared");
    expect(JSON.parse(window.localStorage.getItem(FIRST_RUN_STORAGE_KEY) ?? "{}")).toEqual({ ...NO_FLAGS, linkShared: true });
    expect(readFirstRunFlags()).toBe(readFirstRunFlags());
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener("ilgam:first-run", listener);
  });

  it("저장이 막히거나 값이 깨져도 화면을 멈추지 않는다", () => {
    window.localStorage.setItem(FIRST_RUN_STORAGE_KEY, "{broken");
    expect(readFirstRunFlags()).toEqual(NO_FLAGS);
    vi.spyOn(storage, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(() => markFirstRun("packagesReviewed")).not.toThrow();
  });
});
