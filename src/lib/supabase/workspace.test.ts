import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createSeedState } from "@/lib/store";
import {
  createSecurePortalToken,
  HostedPlanLimitError,
  HostedWorkspaceConflictError,
  isHostedWorkspaceState,
  isSecurePortalToken,
  loadHostedWorkspace,
  mergeRemoteRevisionEvidence,
  prepareStateForHosted,
  saveHostedWorkspace,
} from "./workspace";

describe("hosted workspace helpers", () => {
  it("creates an unguessable 256-bit base64url portal token", () => {
    const tokens = new Set(Array.from({ length: 20 }, () => createSecurePortalToken()));
    expect(tokens.size).toBe(20);
    for (const token of tokens) expect(isSecurePortalToken(token)).toBe(true);
  });

  it("replaces weak demo tokens before first hosted save", () => {
    const state = createSeedState("2026-08-15");
    const prepared = prepareStateForHosted(state);

    expect(prepared.jobs.every((job) => isSecurePortalToken(job.revisionPortalToken))).toBe(true);
    expect(state.jobs.some((job) => !isSecurePortalToken(job.revisionPortalToken))).toBe(true);
  });

  it("rejects a malformed hosted document before rendering it", () => {
    const prepared = prepareStateForHosted(createSeedState("2026-08-15"));
    expect(isHostedWorkspaceState(prepared)).toBe(true);
    expect(isHostedWorkspaceState({ ...prepared, jobs: [{ id: "broken" }] })).toBe(false);
    expect(isHostedWorkspaceState({ ...prepared, version: 1 })).toBe(false);
  });

  it("merges only remote revision evidence without overwriting a local task edit", () => {
    const local = createSeedState("2026-08-15");
    const remote = structuredClone(local);
    local.jobs[0].tasks[0].status = "done";
    remote.jobs[0].revisions.push({
      id: "remote-public-revision",
      jobId: remote.jobs[0].id,
      source: "public",
      body: "외부 기기에서 들어온 수정",
      status: "new",
      usage: "used",
      sequence: 2,
      submittedAt: "2026-08-15T10:00:00.000Z",
    });

    const merged = mergeRemoteRevisionEvidence(local, remote);

    expect(merged.jobs[0].tasks[0].status).toBe("done");
    expect(merged.jobs[0].revisions.some((item) => item.id === "remote-public-revision")).toBe(true);
  });

  it("누적 카운터가 없던 예전 서버 문서도 현재 일감 수만큼 채워서 읽는다", async () => {
    const stored = prepareStateForHosted(createSeedState("2026-08-15")) as unknown as Record<string, unknown>;
    // 이 기능이 나오기 전에 저장된 문서에는 세 필드가 아예 없다.
    delete stored.jobsCreatedTotal;
    delete stored.trialStartedAt;
    delete stored.betaAccess;

    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { state: stored, document_version: 7, updated_at: "2026-08-15T00:00:00.000Z" },
              error: null,
            }),
          }),
        }),
      }),
    } as unknown as Parameters<typeof loadHostedWorkspace>[0];

    const document = await loadHostedWorkspace(client, "owner-1");

    // 카운터가 0에서 다시 시작하면 무료 한도를 그만큼 더 쓸 수 있게 된다.
    expect(document?.state.jobsCreatedTotal).toBe((stored.jobs as unknown[]).length);
    expect(document?.state.trialStartedAt).toBeNull();
    expect(document?.state.betaAccess).toBeNull();
    expect(document?.documentVersion).toBe(7);
  });
});

describe("hosted save errors", () => {
  function clientRejecting(message: string, code = "P0001"): SupabaseClient {
    return { rpc: async () => ({ data: null, error: { message, code } }) } as unknown as SupabaseClient;
  }

  it("한도 초과는 SQL 식별자 대신 사람이 읽을 문장으로 온다", async () => {
    const state = prepareStateForHosted(createSeedState("2026-08-15"));

    await expect(saveHostedWorkspace(clientRejecting("plan_active_jobs_exceeded"), state, 1))
      .rejects.toThrowError(HostedPlanLimitError);
    await expect(saveHostedWorkspace(clientRejecting("plan_total_jobs_exceeded"), state, 1))
      .rejects.toThrowError(/무료 요금제에서 만들 수 있는 일감 수를 다 썼어요/);
    await expect(saveHostedWorkspace(clientRejecting("plan_limits_missing"), state, 1))
      .rejects.toThrowError(/요금제 정보를 확인하지 못해/);

    // 어떤 경우에도 서버 식별자를 그대로 노출하지 않는다.
    await expect(saveHostedWorkspace(clientRejecting("plan_packages_exceeded"), state, 1))
      .rejects.toThrowError(/^(?!.*plan_packages_exceeded)/);
  });

  it("충돌은 한도 초과와 다른 오류로 구분된다", async () => {
    const state = prepareStateForHosted(createSeedState("2026-08-15"));
    await expect(saveHostedWorkspace(clientRejecting("workspace_conflict"), state, 1))
      .rejects.toThrowError(HostedWorkspaceConflictError);
  });
});
