import { normalizeRedeemedCodes } from "@/lib/domain";
import { createSecurePortalToken, isHostedWorkspaceState, isSecurePortalToken } from "@/lib/supabase/workspace";

import type { AppState } from "./seed";
import { normalizeAppState } from "./storage";

/** 백업 파일은 사람이 쓰는 자료라 이보다 크면 잘못 고른 파일일 가능성이 크다. */
export const WORKSPACE_IMPORT_MAX_BYTES = 5 * 1024 * 1024;

export type WorkspaceImportResult =
  | { ok: true; workspace: AppState; jobCount: number; exportedAt: string | null }
  | { ok: false; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * 설정의 "데이터 내보내기"로 받은 JSON을 다시 읽는다.
 * 내보내기는 공개 수정링크 토큰을 빼고 저장하므로, 불러올 때 일감마다 새 토큰을 만든다.
 * 예전에 보낸 수정링크는 그래서 다시 쓰이지 않는다.
 */
export function parseWorkspaceImport(text: string): WorkspaceImportResult {
  if (text.length > WORKSPACE_IMPORT_MAX_BYTES) {
    return { ok: false, message: "파일이 너무 커요. 일감체크에서 내보낸 백업 파일인지 확인해 주세요." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, message: "JSON 파일을 읽지 못했어요. 일감체크에서 내보낸 백업 파일을 골라 주세요." };
  }

  if (!isRecord(parsed) || parsed.product !== "ilgamcheck") {
    return { ok: false, message: "일감체크 백업 파일이 아니에요. 설정의 '데이터 내보내기'로 받은 파일을 골라 주세요." };
  }
  if (parsed.schemaVersion !== 1) {
    return { ok: false, message: "지원하지 않는 백업 형식이에요. 앱을 최신으로 새로고침한 뒤 다시 시도해 주세요." };
  }
  if (!isRecord(parsed.workspace) || !Array.isArray(parsed.workspace.jobs)) {
    return { ok: false, message: "백업 파일 내용이 손상됐어요. 다른 백업 파일로 다시 시도해 주세요." };
  }

  const workspace = parsed.workspace;
  const jobs = (workspace.jobs as unknown[]).map((job) => {
    if (!isRecord(job)) return job;
    const token = typeof job.revisionPortalToken === "string" && isSecurePortalToken(job.revisionPortalToken)
      ? job.revisionPortalToken
      : createSecurePortalToken();
    return { ...job, revisionPortalToken: token };
  });
  const candidate = { ...workspace, jobs };

  if (!isHostedWorkspaceState(candidate)) {
    return { ok: false, message: "백업 파일 내용이 손상됐어요. 다른 백업 파일로 다시 시도해 주세요." };
  }

  return {
    ok: true,
    workspace: normalizeAppState(candidate),
    jobCount: candidate.jobs.length,
    exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : null,
  };
}

/**
 * 백업의 자료(패키지·옵션·일감·설정)로 바꾸되, 한도 관리 값은 되돌리지 않는다.
 * 전체 초기화와 같은 원칙이다. 되돌아가면 백업 불러오기가 무료 한도를 푸는 우회로가 된다.
 */
export function mergeImportedWorkspace(current: AppState, imported: AppState): AppState {
  return normalizeAppState({
    ...imported,
    version: 2,
    jobsCreatedTotal: Math.max(current.jobsCreatedTotal ?? 0, imported.jobsCreatedTotal ?? 0, imported.jobs.length),
    trialStartedAt: current.trialStartedAt ?? imported.trialStartedAt ?? null,
    betaAccess: current.betaAccess ?? null,
    redeemedInviteCodes: normalizeRedeemedCodes(current.redeemedInviteCodes),
    activityDates: [...(current.activityDates ?? []), ...(imported.activityDates ?? [])],
  });
}
