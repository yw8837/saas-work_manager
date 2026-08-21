import { createSeedState } from "@/lib/store";
import { describe, expect, it } from "vitest";
import {
  clearHostedDraft,
  hostedDraftKey,
  mergeConcurrentWorkspaceState,
  preserveQueuedRevisionEvidence,
  readHostedDraft,
  writeHostedDraft,
} from "./workspace-provider";

function clone<T>(value: T): T {
  return structuredClone(value);
}

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe("hosted workspace serialization", () => {
  it("preserves public evidence through two queued owner edits without collapsing their order", () => {
    const base = createSeedState("2026-08-15");
    const firstOwnerEdit = clone(base);
    firstOwnerEdit.jobs[0].tasks[0].status = "done";

    const secondOwnerEdit = clone(firstOwnerEdit);
    secondOwnerEdit.jobs[0].tasks[1].status = "done";

    const remoteWithPublicEvidence = clone(base);
    remoteWithPublicEvidence.jobs[0].revisions.push({
      id: "revision_remote_between_owner_edits",
      jobId: remoteWithPublicEvidence.jobs[0].id,
      source: "public",
      body: "두 저장 사이에 들어온 고객 요청",
      status: "new",
      usage: "used",
      sequence: 2,
      submittedAt: "2026-08-15T03:00:00.000Z",
    });

    const latestVisible = preserveQueuedRevisionEvidence(
      secondOwnerEdit,
      secondOwnerEdit,
      remoteWithPublicEvidence,
    );
    const firstActualSave = preserveQueuedRevisionEvidence(
      firstOwnerEdit,
      latestVisible,
      remoteWithPublicEvidence,
    );
    const secondActualSave = preserveQueuedRevisionEvidence(
      secondOwnerEdit,
      latestVisible,
      firstActualSave,
    );

    expect(firstActualSave.jobs[0].tasks[0].status).toBe("done");
    expect(firstActualSave.jobs[0].tasks[1].status).not.toBe("done");
    expect(secondActualSave.jobs[0].tasks.slice(0, 2).map((task) => task.status)).toEqual(["done", "done"]);
    expect(secondActualSave.jobs[0].revisions.some((item) => item.id === "revision_remote_between_owner_edits")).toBe(true);
  });

  it("three-way merges disjoint cross-device edits and reports a true same-field conflict", () => {
    const base = createSeedState("2026-08-15");
    const local = clone(base);
    const remote = clone(base);
    local.jobs[0].tasks[0].status = "done";
    local.jobs[0].updatedAt = "2026-08-15T01:00:00.000Z";
    remote.jobs[0].tasks[1].status = "done";
    remote.jobs[0].updatedAt = "2026-08-15T02:00:00.000Z";

    const merged = mergeConcurrentWorkspaceState(base, local, remote);
    expect(merged.conflicts).toEqual([]);
    expect(merged.state.jobs[0].tasks.slice(0, 2).map((task) => task.status)).toEqual(["done", "done"]);
    expect(merged.state.jobs[0].updatedAt).toBe("2026-08-15T02:00:00.000Z");

    const conflictingRemote = clone(base);
    local.jobs[0].clientLabel = "로컬 편집";
    conflictingRemote.jobs[0].clientLabel = "다른 기기 편집";
    const conflict = mergeConcurrentWorkspaceState(base, local, conflictingRemote);
    expect(conflict.conflicts).toContain("workspace.jobs[job_seed_mora].clientLabel");
    expect(conflict.state.jobs[0].clientLabel).toBe("로컬 편집");
  });

  it("두 기기가 각각 일감을 만들면 누적 카운터를 합산해 무료 한도를 우회할 수 없게 한다", () => {
    const base = createSeedState("2026-08-15");
    base.jobsCreatedTotal = 3;
    const local = clone(base);
    const remote = clone(base);

    // 두 기기가 같은 시점에서 각각 한 건씩 만들면 둘 다 4가 된다.
    local.jobs = [{ ...clone(base.jobs[0]), id: "job_local_new" }, ...local.jobs];
    local.jobsCreatedTotal = 4;
    remote.jobs = [{ ...clone(base.jobs[0]), id: "job_remote_new" }, ...remote.jobs];
    remote.jobsCreatedTotal = 4;

    const merged = mergeConcurrentWorkspaceState(base, local, remote);

    // 일감은 합집합으로 늘어나므로 카운터도 그만큼 늘어야 한다.
    expect(merged.state.jobs).toHaveLength(base.jobs.length + 2);
    expect(merged.state.jobsCreatedTotal).toBe(5);
    expect(merged.conflicts).toEqual([]);
  });

  it("한쪽만 일감을 만든 병합에서도 누적 카운터가 뒤로 가지 않는다", () => {
    const base = createSeedState("2026-08-15");
    base.jobsCreatedTotal = 6;
    const local = clone(base);
    const remote = clone(base);
    remote.jobs = [{ ...clone(base.jobs[0]), id: "job_remote_only" }, ...remote.jobs];
    remote.jobsCreatedTotal = 7;

    const merged = mergeConcurrentWorkspaceState(base, local, remote);
    expect(merged.state.jobsCreatedTotal).toBe(7);
  });

  it("keeps a failed hosted draft with its base version and base state until explicitly cleared", () => {
    const storage = new MemoryStorage();
    const base = createSeedState("2026-08-15");
    const dirty = clone(base);
    dirty.jobs[0].clientLabel = "저장 실패 뒤에도 남아야 함";

    writeHostedDraft("owner-a", dirty, 17, base, "network unavailable", storage);

    expect(JSON.parse(storage.getItem("ilgamcheck:mvp:v2:user:owner-a") ?? "null").jobs[0].clientLabel)
      .toBe("저장 실패 뒤에도 남아야 함");
    const draft = readHostedDraft("owner-a", storage);
    expect(draft).toMatchObject({ baseVersion: 17, failure: "network unavailable" });
    expect(draft?.baseState.jobs.map((job) => job.id)).toEqual(base.jobs.map((job) => job.id));

    clearHostedDraft("owner-a", storage);
    expect(storage.getItem(hostedDraftKey("owner-a"))).toBeNull();
  });
});
