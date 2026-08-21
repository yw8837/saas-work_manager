import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeAppState, type AppState } from "@/lib/store";
import type { Job } from "@/lib/domain";

export type HostedWorkspaceDocument = {
  state: AppState;
  documentVersion: number;
  updatedAt: string;
};

export type PublicRevisionSummary = {
  jobKey: string;
  title: string;
  packageName: string;
  included: number;
  used: number;
  remaining: number;
};

export type PublicRevisionReceipt = {
  requestId: string;
  usage: "used" | "extra_scope";
  sequence: number | null;
  submittedAt: string;
  remaining: number;
};

export class HostedWorkspaceConflictError extends Error {
  constructor(message = "다른 기기에서 먼저 저장했어요. 최신 내용을 다시 불러와주세요.") {
    super(message);
    this.name = "HostedWorkspaceConflictError";
  }
}

/**
 * 서버가 요금제 한도를 막았을 때 던진다.
 * 충돌과 달리 다시 시도해도 결과가 같으므로, 화면에서 재시도 대신 정리·업그레이드를 안내해야 한다.
 */
export class HostedPlanLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HostedPlanLimitError";
  }
}

/** 서버가 던지는 식별자를 그대로 보여주면 안 된다. 사람이 읽을 문장으로 바꾼다. */
const PLAN_LIMIT_MESSAGES: Record<string, string> = {
  plan_active_jobs_exceeded:
    "지금 요금제로 동시에 진행할 수 있는 일감 수를 넘었어요. 끝난 일감을 완료 처리하거나 요금제를 올려주세요.",
  plan_total_jobs_exceeded:
    "무료 요금제에서 만들 수 있는 일감 수를 다 썼어요. 계속 쓰려면 요금제를 올려주세요.",
  plan_packages_exceeded:
    "지금 요금제로 저장할 수 있는 패키지 수를 넘었어요. 쓰지 않는 패키지를 지우거나 요금제를 올려주세요.",
  plan_options_exceeded:
    "지금 요금제로 저장할 수 있는 옵션 수를 넘었어요. 쓰지 않는 옵션을 지우거나 요금제를 올려주세요.",
  plan_limits_missing:
    "요금제 정보를 확인하지 못해 저장을 멈췄어요. 잠시 뒤 다시 시도하고, 계속되면 알려주세요.",
};

function planLimitMessage(serverMessage: string): string | null {
  for (const [code, message] of Object.entries(PLAN_LIMIT_MESSAGES)) {
    if (serverMessage.includes(code)) return message;
  }
  return null;
}

function firstRow<T>(data: unknown): T | null {
  if (Array.isArray(data)) return (data[0] as T | undefined) ?? null;
  return data && typeof data === "object" ? data as T : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isHostedWorkspaceState(value: unknown): value is AppState {
  if (!isRecord(value)) return false;
  if (
    value.version !== 2
    || !Array.isArray(value.packages)
    || !Array.isArray(value.options)
    || !Array.isArray(value.jobs)
    || !isRecord(value.settings)
  ) return false;

  const packagesValid = value.packages.every((item) =>
    isRecord(item)
    && typeof item.id === "string"
    && typeof item.name === "string"
    && Array.isArray(item.tasks));
  const optionsValid = value.options.every((item) =>
    isRecord(item)
    && typeof item.id === "string"
    && typeof item.name === "string"
    && Array.isArray(item.taskDeltas));
  const jobsValid = value.jobs.every((item) =>
    isRecord(item)
    && typeof item.id === "string"
    && typeof item.clientLabel === "string"
    && isRecord(item.packageSnapshot)
    && typeof item.packageSnapshot.name === "string"
    && Array.isArray(item.optionSnapshots)
    && Array.isArray(item.tasks)
    && Array.isArray(item.revisions)
    && Array.isArray(item.addons)
    && Array.isArray(item.links)
    && typeof item.revisionPortalToken === "string"
    && isSecurePortalToken(item.revisionPortalToken)
    && ["active", "completed", "archived"].includes(String(item.status)));
  return packagesValid && optionsValid && jobsValid;
}

function toBase64Url(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let result = "";
  let buffer = 0;
  let bits = 0;

  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      result += alphabet[(buffer >> bits) & 63];
    }
  }

  if (bits > 0) result += alphabet[(buffer << (6 - bits)) & 63];
  return result;
}

export function createSecurePortalToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export function isSecurePortalToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{43,128}$/.test(value);
}

export function prepareStateForHosted(state: AppState): AppState {
  return {
    ...state,
    packages: state.packages.map((item) => ({ ...item, tasks: item.tasks.map((task) => ({ ...task })) })),
    options: state.options.map((item) => ({
      ...item,
      taskDeltas: item.taskDeltas.map((delta) => delta.kind === "add"
        ? { kind: "add" as const, task: { ...delta.task } }
        : { kind: "remove" as const, taskKey: delta.taskKey }),
    })),
    jobs: state.jobs.map((job) => ({
      ...job,
      revisionPortalToken: isSecurePortalToken(job.revisionPortalToken)
        ? job.revisionPortalToken
        : createSecurePortalToken(),
      tasks: job.tasks.map((task) => ({ ...task })),
      revisions: job.revisions.map((revision) => ({ ...revision })),
      addons: job.addons.map((addon) => ({ ...addon, tasks: addon.tasks.map((task) => ({ ...task })) })),
      links: job.links.map((link) => ({ ...link })),
    })),
    settings: { ...state.settings },
  };
}

/**
 * A public portal update may race with an owner's local edit. We only merge
 * immutable public revision evidence automatically; unrelated cross-device
 * edits remain a visible conflict instead of being silently overwritten.
 */
export function mergeRemoteRevisionEvidence(local: AppState, remote: AppState): AppState {
  const remoteJobs = new Map(remote.jobs.map((job) => [job.id, job]));

  return {
    ...local,
    jobs: local.jobs.map((job) => {
      const remoteJob = remoteJobs.get(job.id);
      if (!remoteJob) return job;
      const localIds = new Set(job.revisions.map((revision) => revision.id));
      const appended = remoteJob.revisions.filter((revision) => !localIds.has(revision.id));
      return appended.length
        ? { ...job, revisions: [...job.revisions, ...appended], updatedAt: remoteJob.updatedAt }
        : job;
    }),
  };
}

export async function loadHostedWorkspace(
  client: SupabaseClient,
  ownerId: string,
): Promise<HostedWorkspaceDocument | null> {
  const { data, error } = await client
    .from("workspace_documents")
    .select("state, document_version, updated_at")
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (error) throw new Error(`Hosted 작업공간을 불러오지 못했어요: ${error.message}`);
  if (!data) return null;

  if (!isHostedWorkspaceState(data.state)) {
    throw new Error("Hosted 작업공간 데이터 형식이 손상됐어요. 백업 복원 또는 운영자 확인이 필요합니다.");
  }

  return {
    // 이 기능이 나오기 전에 저장된 문서에는 누적 카운터·체험 필드가 없다.
    // 로컬 저장본과 같은 규칙으로 채워야 기존 계정이 카운터 0에서 다시 시작하지 않는다.
    state: normalizeAppState(data.state),
    documentVersion: Number(data.document_version),
    updatedAt: String(data.updated_at),
  };
}

export async function saveHostedWorkspace(
  client: SupabaseClient,
  state: AppState,
  expectedVersion: number,
  idempotencyKey = crypto.randomUUID(),
): Promise<{ documentVersion: number; updatedAt: string }> {
  const { data, error } = await client.rpc("save_workspace_document", {
    p_state: state,
    p_expected_version: expectedVersion,
    p_idempotency_key: idempotencyKey,
  });

  if (error) {
    if (error.message.includes("workspace_conflict") || error.code === "40001") {
      throw new HostedWorkspaceConflictError();
    }
    const limitMessage = planLimitMessage(error.message);
    if (limitMessage) throw new HostedPlanLimitError(limitMessage);
    throw new Error(`Hosted 저장에 실패했어요: ${error.message}`);
  }

  const row = firstRow<{ document_version: number; updated_at: string }>(data);
  if (!row) throw new Error("Hosted 저장 결과가 비어 있어요.");
  return { documentVersion: Number(row.document_version), updatedAt: String(row.updated_at) };
}

export async function syncHostedRevisionPortals(client: SupabaseClient, jobs: Job[]): Promise<void> {
  await Promise.all(jobs.map(async (job) => {
    const { error } = await client.rpc("register_workspace_revision_portal", {
      p_job_key: job.id,
      p_raw_token: job.revisionPortalToken,
      p_enabled: job.status === "active" && job.revisionPortalEnabled,
    });
    if (error) throw new Error(`고객 수정 링크를 동기화하지 못했어요: ${error.message}`);
  }));
}

export async function getHostedPublicRevisionSummary(
  client: SupabaseClient,
  token: string,
): Promise<PublicRevisionSummary | null> {
  const { data, error } = await client.rpc("get_workspace_revision_summary", { p_token: token });
  if (error) throw new Error("사용할 수 없는 링크예요.");
  const row = firstRow<{
    job_key: string;
    title: string;
    package_name: string;
    included: number;
    used: number;
    remaining: number;
  }>(data);
  return row ? {
    jobKey: row.job_key,
    title: row.title,
    packageName: row.package_name,
    included: Number(row.included),
    used: Number(row.used),
    remaining: Number(row.remaining),
  } : null;
}

export async function submitHostedPublicRevision(
  client: SupabaseClient,
  input: { token: string; body: string; clientLabel?: string; idempotencyKey?: string },
): Promise<PublicRevisionReceipt> {
  const { data, error } = await client.rpc("submit_workspace_revision_request", {
    p_token: input.token,
    p_body: input.body,
    p_client_label: input.clientLabel?.trim() || null,
    p_idempotency_key: input.idempotencyKey ?? crypto.randomUUID(),
  });

  if (error) {
    if (error.message.includes("rate_limited")) {
      throw new Error("요청이 너무 빨라요. 잠시 뒤 다시 시도해주세요.");
    }
    throw new Error("수정 요청을 저장하지 못했어요. 링크 상태를 확인해주세요.");
  }

  const row = firstRow<{
    request_id: string;
    usage: "used" | "extra_scope";
    sequence: number | null;
    submitted_at: string;
    remaining: number;
  }>(data);
  if (!row) throw new Error("수정 요청 저장 결과가 비어 있어요.");
  return {
    requestId: row.request_id,
    usage: row.usage,
    sequence: row.sequence === null ? null : Number(row.sequence),
    submittedAt: row.submitted_at,
    remaining: Number(row.remaining),
  };
}
