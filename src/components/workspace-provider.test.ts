import { completeRevision, getRevisionSummary, recordRevision } from "@/lib/domain";
import { createSeedState } from "@/lib/store";
import { describe, expect, it } from "vitest";
import {
  clearHostedDraft,
  hostedDraftKey,
  isPublicRevisionAppendOnly,
  mergeConcurrentWorkspaceState,
  preserveQueuedRevisionEvidence,
  readHostedDraft,
  resolveHostedSaveConflict,
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

  it("다른 기기에서 바꾼 받은 곳이 병합 뒤 남는다", () => {
    const base = createSeedState("2026-08-15");
    const local = clone(base);
    const remote = clone(base);
    expect("source" in base.jobs[0]).toBe(false);
    // 이 기기는 다른 칸을 고쳤고, 다른 기기는 받은 곳만 정했다.
    local.jobs[0].tasks[0].status = "done";
    local.jobs[0].updatedAt = "2026-08-15T01:00:00.000Z";
    remote.jobs[0] = { ...remote.jobs[0], source: "referral", updatedAt: "2026-08-15T02:00:00.000Z" };

    const merged = mergeConcurrentWorkspaceState(base, local, remote);

    expect(merged.conflicts).toEqual([]);
    expect(merged.state.jobs[0].source).toBe("referral");
    expect(merged.state.jobs[0].tasks[0].status).toBe("done");
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

  // 수정 완료는 작업자 문서 저장으로 처리한다. 그 사이 고객이 링크로 새 요청을 남겨도(서버가 기록을 추가) 둘 다 살아야 한다.
  it("작업자의 '수정 완료'와 그 사이 고객이 남긴 새 요청을 충돌 없이 둘 다 살린다", () => {
    const base = createSeedState("2026-08-15");
    const jobId = base.jobs[0].id;
    base.jobs[0] = recordRevision(base.jobs[0], { revisionId: "r_first", source: "public", body: "첫 요청", submittedAt: "2026-08-16T00:00:00.000Z" }).job;
    const local = clone(base);
    const remote = clone(base);

    local.jobs[0] = completeRevision(local.jobs[0], "r_first", "2026-08-16T02:00:00.000Z");
    remote.jobs[0] = recordRevision(remote.jobs[0], { revisionId: "r_second", source: "public", body: "두 번째 요청", submittedAt: "2026-08-16T01:00:00.000Z" }).job;

    const merged = mergeConcurrentWorkspaceState(base, local, remote);
    const job = merged.state.jobs.find((item) => item.id === jobId)!;

    expect(merged.conflicts).toEqual([]);
    const ours = job.revisions.filter((item) => item.id.startsWith("r_"));
    expect(ours.map((item) => [item.id, item.usage])).toEqual([["r_first", "used"], ["r_second", "pending"]]);
    // 기본 예시에 이미 1회 쓴 기록이 있어서 사용 2회, 대기 1건이 된다.
    expect(getRevisionSummary(job)).toMatchObject({ used: 2, pending: 1 });
  });

  // Codex 4차 P1: 다른 기기의 '수정 완료'를 '고객 요청이 붙은 것뿐'으로 잘못 보면 오래된 확인 대기로 덮어쓴다.
  it("저장 충돌 때 '고객 요청 추가만'은 새 기록만 붙은 경우로 좁히고, 기존 기록이 바뀌면 아니다", () => {
    const previous = createSeedState("2026-08-15");
    previous.jobs[0] = recordRevision(previous.jobs[0], { revisionId: "r_a", source: "public", body: "요청 A", submittedAt: "2026-08-16T00:00:00.000Z" }).job;

    const appended = clone(previous);
    appended.jobs[0] = recordRevision(appended.jobs[0], { revisionId: "r_new", source: "public", body: "새 요청", submittedAt: "2026-08-16T01:00:00.000Z" }).job;
    expect(isPublicRevisionAppendOnly(previous, appended)).toBe(true);

    const completedElsewhere = clone(previous);
    completedElsewhere.jobs[0] = completeRevision(completedElsewhere.jobs[0], "r_a", "2026-08-16T02:00:00.000Z");
    expect(isPublicRevisionAppendOnly(previous, completedElsewhere)).toBe(false);
  });

  it("다른 기기가 '수정 완료'한 요청을 이 기기의 오래된 저장(다른 항목 편집)이 확인 대기로 되돌리지 않는다", () => {
    const previous = createSeedState("2026-08-15");
    previous.jobs[0] = recordRevision(previous.jobs[0], { revisionId: "r_a", source: "public", body: "요청 A", submittedAt: "2026-08-16T00:00:00.000Z" }).job;
    const local = clone(previous);
    local.jobs[0] = { ...local.jobs[0], title: "이 기기에서 바꾼 제목" };
    const remote = clone(previous);
    remote.jobs[0] = completeRevision(remote.jobs[0], "r_a", "2026-08-16T02:00:00.000Z");

    expect(isPublicRevisionAppendOnly(previous, remote)).toBe(false);
    const merged = mergeConcurrentWorkspaceState(previous, local, remote);
    const job = merged.state.jobs[0];
    expect(merged.conflicts).toEqual([]);
    expect(job.title).toBe("이 기기에서 바꾼 제목");
    expect(job.revisions.find((item) => item.id === "r_a")).toMatchObject({ usage: "used", status: "done" });
  });

  // Codex 4차 P2: 두 기기가 서로 다른 요청을 각각 완료하면 필드 합치기는 둘 다 받아들여 한도를 넘기거나 회차가 겹친다.
  it.each([
    ["포함 한도를 넘기는 경우", 2],
    ["한도 안이지만 회차 번호가 겹치는 경우", 3],
  ])("두 기기의 '수정 완료'를 합친 결과가 규칙을 깨면(%s) 충돌로 멈춘다", (_, limit) => {
    const previous = createSeedState("2026-08-15");
    let job = { ...previous.jobs[0], revisionLimit: limit };
    for (const id of ["r_a", "r_b"]) job = recordRevision(job, { revisionId: id, source: "public", body: id, submittedAt: "2026-08-16T00:00:00.000Z" }).job;
    previous.jobs[0] = job;
    const local = clone(previous);
    local.jobs[0] = completeRevision(local.jobs[0], "r_a", "2026-08-16T02:00:00.000Z");
    const remote = clone(previous);
    remote.jobs[0] = completeRevision(remote.jobs[0], "r_b", "2026-08-16T02:00:00.000Z");

    const merged = mergeConcurrentWorkspaceState(previous, local, remote);
    expect(merged.conflicts).toContain(`workspace.jobs[${job.id}].revisions`);
  });

  it("원래부터 한도를 넘은 기록이 있어도, 합치기가 새로 깬 게 아니면 저장을 막지 않는다", () => {
    const previous = createSeedState("2026-08-15");
    // 예시 일감은 이미 1회를 썼다. 한도를 0으로 낮춰 원래부터 깨진 상태를 만든다.
    previous.jobs[0] = { ...previous.jobs[0], revisionLimit: 0 };
    const local = clone(previous);
    local.jobs[0] = { ...local.jobs[0], title: "제목만 바꿈" };
    const remote = clone(previous);
    remote.jobs[0] = recordRevision(remote.jobs[0], { revisionId: "r_new", source: "public", body: "새 요청", submittedAt: "2026-08-16T01:00:00.000Z" }).job;

    expect(mergeConcurrentWorkspaceState(previous, local, remote).conflicts).toEqual([]);
  });

  // Codex 5차 P2: 원래 회차가 겹친 일감이라고 검사를 통째로 건너뛰면, 두 기기의 동시 완료로 새로 늘어난 초과·중복을 놓친다.
  it("원래 회차가 겹친 일감에서도 합치기가 초과·중복을 더 늘리면 충돌로 멈춘다", () => {
    const previous = createSeedState("2026-08-15");
    // 예시 일감은 이미 1회차를 썼다. 같은 1회차 기록을 하나 더 넣어 원래부터 회차가 겹친 상태(사용 2·한도 3)를 만든다.
    let job = {
      ...previous.jobs[0],
      revisionLimit: 3,
      revisions: [
        ...previous.jobs[0].revisions,
        { id: "r_dup", jobId: previous.jobs[0].id, source: "manual" as const, body: "겹친 회차", status: "done" as const, usage: "used" as const, sequence: 1, submittedAt: "2026-08-15T05:00:00.000Z" },
      ],
    };
    for (const id of ["r_x", "r_y"]) job = recordRevision(job, { revisionId: id, source: "public", body: id, submittedAt: "2026-08-16T00:00:00.000Z" }).job;
    previous.jobs[0] = job;
    const local = clone(previous);
    local.jobs[0] = completeRevision(local.jobs[0], "r_x", "2026-08-16T02:00:00.000Z");
    const remote = clone(previous);
    remote.jobs[0] = completeRevision(remote.jobs[0], "r_y", "2026-08-16T02:00:00.000Z");

    const merged = mergeConcurrentWorkspaceState(previous, local, remote);
    expect(getRevisionSummary(merged.state.jobs[0]).used).toBe(4);
    expect(merged.conflicts).toContain(`workspace.jobs[${job.id}].revisions`);
  });

  // Codex 5차 P2: 다른 기기가 '수정 완료로 기록'한 새 수동 기록도 새 id라서 '고객 요청 추가만' 경로로 들어온다.
  it("'추가만'으로 보이는 충돌에서도 합친 결과가 한도를 넘거나 회차가 겹치면 충돌로 돌려준다", () => {
    const previous = createSeedState("2026-08-15");
    previous.jobs[0] = recordRevision({ ...previous.jobs[0], revisionLimit: 2 }, { revisionId: "r_a", source: "public", body: "요청 A", submittedAt: "2026-08-16T00:00:00.000Z" }).job;
    const local = clone(previous);
    local.jobs[0] = completeRevision(local.jobs[0], "r_a", "2026-08-16T02:00:00.000Z");
    const remote = clone(previous);
    remote.jobs[0] = recordRevision(remote.jobs[0], { revisionId: "r_manual", source: "manual", channel: "kakao", body: "다른 기기 수동 완료", submittedAt: "2026-08-16T01:00:00.000Z", completed: true }).job;

    expect(isPublicRevisionAppendOnly(previous, remote)).toBe(true);
    const resolved = resolveHostedSaveConflict(previous, local, remote);
    expect(resolved.conflicts).toContain(`workspace.jobs[${previous.jobs[0].id}].revisions`);

    // 고객 요청(확인 대기)만 붙은 경우는 그대로 붙이고 충돌이 아니다.
    const publicOnly = clone(previous);
    publicOnly.jobs[0] = recordRevision(publicOnly.jobs[0], { revisionId: "r_public", source: "public", body: "새 고객 요청", submittedAt: "2026-08-16T01:00:00.000Z" }).job;
    const appended = resolveHostedSaveConflict(previous, local, publicOnly);
    expect(appended.conflicts).toEqual([]);
    expect(appended.state.jobs[0].revisions.map((item) => [item.id, item.usage]).slice(-2)).toEqual([["r_a", "used"], ["r_public", "pending"]]);
  });

  // Codex 7차 P2: 충돌로 멈출 때 화면 보존 과정에서 다른 기기의 새 완료 기록이 이 기기 화면에 붙으면,
  // 이 기기 화면이 한도를 넘은 상태가 된다. 그 위반을 '원래 있던 위반'으로 인정하면 다음 합치기가 그대로 저장한다.
  it("이 기기 화면에만 있는 한도 초과(합치는 중에 붙은 것)는 원래 있던 위반으로 인정하지 않는다", () => {
    const base = createSeedState("2026-08-15");
    // 예시 일감은 이미 1회를 썼다. 한도 2.
    base.jobs[0] = { ...base.jobs[0], revisionLimit: 2 };
    const remote = clone(base);
    remote.jobs[0] = recordRevision(remote.jobs[0], { revisionId: "r_other_manual", source: "manual", channel: "kakao", body: "다른 기기 수동 완료", submittedAt: "2026-08-16T01:00:00.000Z", completed: true }).job;
    const local = clone(base);
    local.jobs[0] = recordRevision(local.jobs[0], { revisionId: "r_local_manual", source: "manual", channel: "kakao", body: "이 기기 수동 완료", submittedAt: "2026-08-16T01:30:00.000Z", completed: true }).job;
    // 자동 저장을 멈출 때 화면 보존이 서버의 새 기록을 붙인 상태.
    const preservedLocal = preserveQueuedRevisionEvidence(local, local, remote);
    expect(getRevisionSummary(preservedLocal.jobs[0]).used).toBe(3);

    expect(mergeConcurrentWorkspaceState(base, preservedLocal, remote).conflicts).toContain(`workspace.jobs[${base.jobs[0].id}].revisions`);
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
