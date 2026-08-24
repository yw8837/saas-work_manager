"use client";

import {
  addCalendarDays,
  betaExpiresAt,
  canActivateJob as canActivateJobFor,
  canCreateJob as canCreateJobFor,
  canCreateOption as canCreateOptionFor,
  canCreatePackage as canCreatePackageFor,
  cancelAddon as applyCancelledAddon,
  composeJob,
  confirmAddon as applyConfirmedAddon,
  createAddon as createAddonDraft,
  createDomainId,
  activeJobCount as countActiveJobs,
  getRevisionSummary,
  addRedeemedCode,
  isValidInviteCode,
  jobLimitReached,
  normalizeInviteCode,
  PLAN_LIMITS,
  recordRevision as appendRevision,
  resolvePlanAccess,
  revertRevision as applyRevertedRevision,
  toggleJobCompletion,
  updateTaskStatus,
  BETA_GRANT_DAYS,
  type CreateAddonInput,
  type Job,
  type JobLimitKind,
  type JobLink,
  type OptionTemplate,
  type PackageTemplate,
  type Plan,
  type PlanAccess,
  type PlanLimits,
  type RevisionChannel,
  type Task,
} from "@/lib/domain";
import {
  createSeedState,
  loadState,
  mutateStoredState,
  normalizeAppState,
  resetState,
  saveState,
  STORAGE_KEY,
  storageKeyForUser,
  type AppSettings,
  type AppState,
} from "@/lib/store";
import { deriveInAppAlerts, registerIlgamcheckServiceWorker } from "@/lib/notifications";
import {
  createSecurePortalToken,
  getHostedRuntimeBoundary,
  getSupabaseBrowserClient,
  loadHostedSubscription,
  loadHostedWorkspace,
  mergeRemoteRevisionEvidence,
  redeemHostedInviteCode,
  type HostedSubscription,
  prepareStateForHosted,
  recordCurrentPolicyAcceptance,
  saveHostedWorkspace,
  syncHostedRevisionPortals,
  type StorageMode,
} from "@/lib/supabase";
import { policySignupMetadata, type PolicyAcceptance } from "@/lib/policies";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type CreateJobInput = {
  clientLabel: string;
  startDate: string;
  packageId: string;
  optionIds: string[];
};

type WorkspaceContextValue = AppState & {
  hydrated: boolean;
  runtimeMode: StorageMode;
  authStatus: "local" | "loading" | "signed_out" | "signed_in" | "configuration_error";
  authError: string | null;
  userEmail: string | null;
  saveStatus: "saved" | "saving" | "error";
  saveError: string | null;
  realtimeStatus: "local" | "idle" | "connecting" | "connected" | "error";
  realtimeError: string | null;
  alerts: ReturnType<typeof deriveInAppAlerts>;
  /** 체험·베타를 반영한 실제 플랜 */
  plan: Plan;
  /** 승급이 없을 때의 플랜 */
  basePlan: Plan;
  planAccess: PlanAccess;
  limits: PlanLimits;
  activeJobCount: number;
  canCreateJob: boolean;
  /** 새 일감을 막은 한도 종류. 막히지 않았으면 null. */
  jobLimitHit: JobLimitKind | null;
  canCreatePackage: boolean;
  canCreateOption: boolean;
  /** 베타 이용 코드를 적용한다. 성공/실패와 화면에 그대로 쓸 문구를 돌려준다. */
  activateInviteCode: (code: string) => Promise<{ ok: boolean; message: string }>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, acceptance: PolicyAcceptance) => Promise<string>;
  signOut: (options?: { discardUnsaved?: boolean }) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
  createJob: (input: CreateJobInput) => string;
  toggleTask: (jobId: string, taskId: string) => void;
  toggleJobWaiting: (jobId: string) => void;
  completeJob: (jobId: string) => void;
  deleteJob: (jobId: string) => void;
  setRevisionPortalEnabled: (jobId: string, enabled: boolean) => void;
  rotateRevisionPortalToken: (jobId: string) => string | null;
  recordRevision: (jobId: string, content: string, channel?: RevisionChannel) => void;
  /** 중복·오접수를 원문 삭제 없이 되돌려 남은 횟수를 복구한다. 사유는 선택. */
  revertRevision: (jobId: string, revisionId: string, reason?: string) => void;
  recordPublicRevision: (
    token: string,
    content: string,
    clientLabel?: string,
  ) => { jobId: string; usage: "used" | "extra_scope" } | null;
  savePackage: (template: PackageTemplate) => void;
  archivePackage: (packageId: string) => void;
  saveOption: (template: OptionTemplate) => void;
  archiveOption: (optionId: string) => void;
  updateJobLinks: (jobId: string, links: JobLink[]) => void;
  createAddon: (jobId: string, input: Omit<CreateAddonInput, "addonId" | "createdAt">) => string;
  confirmAddon: (jobId: string, addonId: string) => void;
  /** 초안은 상태만 바꾸고, 확정본은 금액·원가·마감·할 일 반영분을 되돌린다. */
  cancelAddon: (jobId: string, addonId: string) => void;
  updateSettings: (settings: Partial<AppSettings>) => void;
  resetDemo: () => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function clonePackage(template: PackageTemplate): PackageTemplate {
  return { ...template, tasks: template.tasks.map((task) => ({ ...task })) };
}

function cloneOption(template: OptionTemplate): OptionTemplate {
  return {
    ...template,
    taskDeltas: template.taskDeltas.map((delta) =>
      delta.kind === "add" ? { kind: "add", task: { ...delta.task } } : { kind: "remove", taskKey: delta.taskKey },
    ),
  };
}

function stateWithoutRevisionEvidence(state: AppState): string {
  return JSON.stringify({
    ...state,
    jobs: state.jobs.map((job) => ({
      ...job,
      revisions: [],
      updatedAt: "",
    })),
  });
}

const HOSTED_DRAFT_SCHEMA_VERSION = 1;
const HOSTED_DRAFT_SUFFIX = ":hosted-draft";

export type HostedDraftRecord = {
  schemaVersion: typeof HOSTED_DRAFT_SCHEMA_VERSION;
  baseVersion: number;
  baseState: AppState;
  updatedAt: string;
  failure?: string;
};

export type WorkspaceMergeResult = {
  state: AppState;
  conflicts: string[];
};

function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isKeyedArray(value: unknown[]): value is Array<Record<string, unknown> & { id: string }> {
  return value.every((item) => isRecord(item) && typeof item.id === "string");
}

function mergeWorkspaceValue(
  base: unknown,
  local: unknown,
  remote: unknown,
  path: string,
): { value: unknown; conflicts: string[] } {
  // 누적 생성 카운터는 "값"이 아니라 "각자 몇 건 만들었는가"의 합이다.
  // 두 기기가 같은 시점에서 한 건씩 만들면 둘 다 base+1이 되는데, 값이 같다고 그대로 채택하면
  // 일감은 두 건 늘고 카운터는 한 건만 늘어 무료 한도를 계속 넘길 수 있다.
  // 동등성 단축보다 먼저 처리해야 하므로 맨 위에 둔다.
  if (path.endsWith(".jobsCreatedTotal")) {
    const baseCount = typeof base === "number" ? base : 0;
    const localCount = typeof local === "number" ? local : baseCount;
    const remoteCount = typeof remote === "number" ? remote : baseCount;
    const summed = localCount + remoteCount - baseCount;
    // 어떤 경우에도 뒤로 가지 않는다.
    return { value: Math.max(summed, localCount, remoteCount, 0), conflicts: [] };
  }

  if (jsonEqual(local, remote)) return { value: local, conflicts: [] };
  if (jsonEqual(local, base)) return { value: remote, conflicts: [] };
  if (jsonEqual(remote, base)) return { value: local, conflicts: [] };

  if (path.endsWith(".updatedAt") && typeof local === "string" && typeof remote === "string") {
    return { value: local > remote ? local : remote, conflicts: [] };
  }

  if (Array.isArray(local) && Array.isArray(remote) && Array.isArray(base)) {
    if (isKeyedArray(local) && isKeyedArray(remote) && isKeyedArray(base)) {
      const baseById = new Map(base.map((item) => [item.id, item]));
      const localById = new Map(local.map((item) => [item.id, item]));
      const remoteById = new Map(remote.map((item) => [item.id, item]));
      const orderedIds = [...new Set([
        ...local.map((item) => item.id),
        ...remote.map((item) => item.id),
        ...base.map((item) => item.id),
      ])];
      const conflicts: string[] = [];
      const value: unknown[] = [];
      for (const id of orderedIds) {
        const merged = mergeWorkspaceValue(
          baseById.get(id),
          localById.get(id),
          remoteById.get(id),
          `${path}[${id}]`,
        );
        conflicts.push(...merged.conflicts);
        if (merged.value !== undefined) value.push(merged.value);
      }
      return { value, conflicts };
    }
    return { value: local, conflicts: [path] };
  }

  if (isRecord(local) && isRecord(remote) && (isRecord(base) || base === undefined)) {
    const baseRecord = isRecord(base) ? base : {};
    const keys = new Set([...Object.keys(baseRecord), ...Object.keys(local), ...Object.keys(remote)]);
    const conflicts: string[] = [];
    const value: Record<string, unknown> = {};
    for (const key of keys) {
      const merged = mergeWorkspaceValue(
        baseRecord[key],
        local[key],
        remote[key],
        path ? `${path}.${key}` : key,
      );
      conflicts.push(...merged.conflicts);
      if (merged.value !== undefined) value[key] = merged.value;
    }
    return { value, conflicts };
  }

  return { value: local, conflicts: [path] };
}

/** Three-way merge for disjoint owner edits. True same-field conflicts keep the local value and are never auto-saved. */
export function mergeConcurrentWorkspaceState(
  base: AppState,
  local: AppState,
  remote: AppState,
): WorkspaceMergeResult {
  const merged = mergeWorkspaceValue(base, local, remote, "workspace");
  return { state: merged.value as AppState, conflicts: [...new Set(merged.conflicts)] };
}

/** A queued owner snapshot may be old, but immutable public revision evidence must never be removed. */
export function preserveQueuedRevisionEvidence(
  queued: AppState,
  visible: AppState,
  lastSynced: AppState | null,
): AppState {
  const withSyncedEvidence = lastSynced
    ? mergeRemoteRevisionEvidence(queued, lastSynced)
    : queued;
  return mergeRemoteRevisionEvidence(withSyncedEvidence, visible);
}

export function hostedDraftKey(ownerId: string): string {
  return `${storageKeyForUser(ownerId)}${HOSTED_DRAFT_SUFFIX}`;
}

export function readHostedDraft(ownerId: string, storage: Storage = window.localStorage): HostedDraftRecord | null {
  try {
    const parsed = JSON.parse(storage.getItem(hostedDraftKey(ownerId)) ?? "null") as Partial<HostedDraftRecord> | null;
    if (
      !parsed
      || parsed.schemaVersion !== HOSTED_DRAFT_SCHEMA_VERSION
      || !Number.isInteger(parsed.baseVersion)
      || parsed.baseVersion! < 0
      || !parsed.baseState
      || !Array.isArray((parsed.baseState as Partial<AppState>).jobs)
    ) return null;
    // baseState는 3방향 병합의 공통 조상이다. 누적 카운터가 비어 있으면
    // 병합식(local + remote - base)이 base를 0으로 보고 카운터를 두 배로 부풀린다.
    return { ...parsed, baseState: normalizeAppState(parsed.baseState) } as HostedDraftRecord;
  } catch {
    return null;
  }
}

export function writeHostedDraft(
  ownerId: string,
  state: AppState,
  baseVersion: number,
  baseState: AppState,
  failure?: string,
  storage: Storage = window.localStorage,
): void {
  saveState(state, storage, storageKeyForUser(ownerId));
  const record: HostedDraftRecord = {
    schemaVersion: HOSTED_DRAFT_SCHEMA_VERSION,
    baseVersion,
    baseState,
    updatedAt: new Date().toISOString(),
    ...(failure ? { failure } : {}),
  };
  storage.setItem(hostedDraftKey(ownerId), JSON.stringify(record));
}

export function clearHostedDraft(ownerId: string, storage: Storage = window.localStorage): void {
  storage.removeItem(hostedDraftKey(ownerId));
}

/**
 * 저장 실패 안내. 한도 초과는 다시 시도해도 결과가 같으니 재시도를 권하면 안 된다.
 * 대신 지금 실제로 통하는 길(초대 코드·요금제)을 알려준다.
 */
function saveFailureMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : fallback;
  if (error instanceof Error && error.name === "HostedPlanLimitError") {
    return `${message} 이 기기의 편집은 그대로 남아 있어요. 베타 이용 코드가 있다면 설정에서 넣어주세요.`;
  }
  return `${message} 이 기기의 편집은 보존됐고 새로고침하면 자동 재시도해요.`;
}

/**
 * 시간이 흘러 화면이 달라지는 지점.
 * 날짜는 반드시 로컬 기준이어야 한다. UTC로 재면 KST에서는 오전 9시에야 날짜가 넘어가서
 * 자정을 넘긴 뒤 아홉 시간 동안 D-day와 오늘 할 일이 어제 값으로 남는다.
 * 브리핑은 시각을 넘기는 순간에만 달라지므로 분이 아니라 "넘겼는지"만 넣는다.
 */
function timeSignalOf(at: Date, access: PlanAccess, settings: AppSettings): string {
  const localDate = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
  const localTime = `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
  const digestDue = settings.morningDigestEnabled && localTime >= settings.morningDigestTime;
  return `${localDate}|${access.plan}|${access.source}|${access.remainingDays}|${digestDue}`;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const boundary = useMemo(() => getHostedRuntimeBoundary(), []);
  const hostedRequested = boundary.requestedMode === "hosted";
  /**
   * hosted에서는 서버 구독이 권한의 근거다. 화면이 서버보다 후하면
   * 사용자는 만들 수 있다고 믿고 만든 뒤 저장에서 거부당한다.
   * 로컬 모드는 서버가 없으므로 브라우저 상태로만 판단한다.
   */
  const [hostedSubscription, setHostedSubscription] = useState<HostedSubscription | null>(null);
  const hostedConfigurationError = hostedRequested && !boundary.configured;
  const [state, setState] = useState<AppState>(() => createSeedState());
  /**
   * 만료·마감 계산의 기준 시각.
   * 저장 상태가 바뀔 때만 다시 계산하면 탭을 열어둔 사용자는 체험이 끝나도 Pro로 남고,
   * 자정을 넘겨도 D-day가 그대로였다. 1분마다, 그리고 탭이 다시 보일 때 확인한다.
   *
   * 다만 확인과 갱신은 다르다. 매분 상태를 바꾸면 앱 전체가 매분 다시 그려진다.
   * 화면에 보이는 것이 실제로 달라졌을 때(날짜가 넘어갔거나 플랜이 바뀌었을 때)만 갱신한다.
   */
  const [now, setNow] = useState(() => Date.now());
  const timeSignalRef = useRef<() => string>(() => "");
  const lastTimeSignalRef = useRef<string | null>(null);
  useEffect(() => {
    const tick = () => {
      const signal = timeSignalRef.current();
      if (signal === lastTimeSignalRef.current) return;
      lastTimeSignalRef.current = signal;
      setNow(Date.now());
    };
    const timer = window.setInterval(tick, 60_000);
    // 백그라운드 탭은 타이머가 느려지므로 돌아온 순간 즉시 맞춘다.
    window.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, []);

  /**
   * 실제로 적용되는 플랜. 7일 체험이나 베타 코드가 살아 있으면 Pro로 올라가고,
   * 만료되면 조용히 기본 플랜으로 돌아온다.
   */
  const resolveAccessAt = useCallback(
    (at: string): PlanAccess => {
      if (hostedRequested) {
        // 서버가 아직 대답하지 않았으면 가장 보수적으로 본다.
        // 후하게 잡았다가 저장에서 거부당하는 것보다 잠깐 좁게 보이는 편이 낫다.
        if (!hostedSubscription) {
          return resolvePlanAccess({ basePlan: "free", now: at });
        }
        return resolvePlanAccess({
          basePlan: hostedSubscription.plan,
          // 체험·베타 기간도 서버가 준 값만 쓴다. 브라우저 값은 위조할 수 있다.
          trialStartedAt: null,
          betaAccess: hostedSubscription.betaEndsAt
            ? { code: "server", grantedAt: at, expiresAt: hostedSubscription.betaEndsAt }
            : null,
          now: at,
        });
      }

      return resolvePlanAccess({
        basePlan: "free",
        trialStartedAt: state.trialStartedAt ?? null,
        betaAccess: state.betaAccess ?? null,
        now: at,
      });
    },
    [hostedRequested, hostedSubscription, state.trialStartedAt, state.betaAccess],
  );

  const [planAccess, planAccessAt] = useMemo(
    // now는 "다시 계산하라"는 신호로만 쓰고, 값은 계산 시점의 실제 시각을 쓴다.
    // 틱 값을 그대로 넣으면 최대 1분 뒤처진 시각으로 남은 일수를 재게 된다.
    () => {
      const at = new Date();
      return [resolveAccessAt(at.toISOString()), at] as const;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- now는 주기적 재계산 트리거다
    [resolveAccessAt, now],
  );
  /**
   * 틱이 값을 바꿔야 하는지 판단하는 기준.
   * 기준은 반드시 "지금 화면에 그려진 값"이어야 한다. 한 번만 잡아두면
   * hydration 이전 값에 굳어 버리고, 그게 만료 후 값과 같으면 틱이 영원히 안 뛴다.
   */
  useEffect(() => {
    timeSignalRef.current = () => {
      const at = new Date();
      return timeSignalOf(at, resolveAccessAt(at.toISOString()), state.settings);
    };
    lastTimeSignalRef.current = timeSignalOf(planAccessAt, planAccess, state.settings);
  });

  const plan = planAccess.plan;
  const basePlan = planAccess.basePlan;
  const [hydrated, setHydrated] = useState(hostedConfigurationError);
  const [authStatus, setAuthStatus] = useState<WorkspaceContextValue["authStatus"]>(
    hostedRequested ? (hostedConfigurationError ? "configuration_error" : "loading") : "local",
  );
  const [authError, setAuthError] = useState<string | null>(
    hostedConfigurationError
      ? "Hosted 모드 환경값이 빠졌어요. Supabase URL과 anon key를 연결해주세요."
      : null,
  );
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<WorkspaceContextValue["saveStatus"]>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<WorkspaceContextValue["realtimeStatus"]>(
    hostedRequested ? "idle" : "local",
  );
  const [realtimeError, setRealtimeError] = useState<string | null>(null);
  const [recoveryPending, setRecoveryPending] = useState(false);
  const stateRef = useRef(state);
  const hostedClientRef = useRef<SupabaseClient | null>(null);
  const hostedOwnerRef = useRef<string | null>(null);
  const remoteVersionRef = useRef(0);
  const lastSyncedStateRef = useRef<AppState | null>(null);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const saveFailureRef = useRef<unknown>(null);
  const saveSequenceRef = useRef(0);
  const hostedConflictRef = useRef<string | null>(null);

  const setCurrentState = useCallback((next: AppState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const persistHostedState = useCallback((next: AppState) => {
    const client = hostedClientRef.current;
    const ownerId = hostedOwnerRef.current;
    if (!client || !ownerId) {
      setSaveStatus("error");
      setSaveError("로그인 세션이 없어 저장하지 못했어요.");
      return;
    }

    const existingDraft = readHostedDraft(ownerId);
    writeHostedDraft(
      ownerId,
      next,
      existingDraft?.baseVersion ?? remoteVersionRef.current,
      existingDraft?.baseState ?? lastSyncedStateRef.current ?? next,
      hostedConflictRef.current ?? undefined,
    );
    if (hostedConflictRef.current) {
      setSaveStatus("error");
      setSaveError(hostedConflictRef.current);
      return;
    }

    const sequence = ++saveSequenceRef.current;
    setSaveStatus("saving");
    setSaveError(null);

    const operation = saveChainRef.current.then(async () => {
      if (hostedOwnerRef.current !== ownerId) return;
      if (hostedConflictRef.current) throw new Error(hostedConflictRef.current);
      let stateToSave = preserveQueuedRevisionEvidence(
        next,
        stateRef.current,
        lastSyncedStateRef.current,
      );
      try {
        const saved = await saveHostedWorkspace(client, stateToSave, remoteVersionRef.current);
        if (hostedOwnerRef.current !== ownerId) return;
        remoteVersionRef.current = saved.documentVersion;
      } catch (error) {
        if (!(error instanceof Error) || error.name !== "HostedWorkspaceConflictError") throw error;
        const remote = await loadHostedWorkspace(client, ownerId);
        if (hostedOwnerRef.current !== ownerId) return;
        const previous = lastSyncedStateRef.current;
        const publicRevisionOnly = remote
          && previous
          && stateWithoutRevisionEvidence(remote.state) === stateWithoutRevisionEvidence(previous);
        if (!remote || !previous) throw error;

        if (publicRevisionOnly) {
          stateToSave = mergeRemoteRevisionEvidence(stateToSave, remote.state);
        } else {
          const merged = mergeConcurrentWorkspaceState(previous, stateToSave, remote.state);
          if (merged.conflicts.length) {
            const message = "다른 기기와 같은 항목을 수정해 자동 병합을 멈췄어요. 이 기기의 편집은 보존됐으며 새로고침해 다시 시도할 수 있어요.";
            hostedConflictRef.current = message;
            remoteVersionRef.current = remote.documentVersion;
            lastSyncedStateRef.current = remote.state;
            const visible = preserveQueuedRevisionEvidence(stateRef.current, stateRef.current, remote.state);
            setCurrentState(visible);
            const draft = readHostedDraft(ownerId);
            writeHostedDraft(
              ownerId,
              visible,
              draft?.baseVersion ?? remote.documentVersion,
              draft?.baseState ?? previous,
              message,
            );
            throw new Error(message);
          }
          stateToSave = merged.state;
        }

        stateToSave = preserveQueuedRevisionEvidence(stateToSave, stateRef.current, remote.state);
        remoteVersionRef.current = remote.documentVersion;
        const saved = await saveHostedWorkspace(client, stateToSave, remoteVersionRef.current);
        if (hostedOwnerRef.current !== ownerId) return;
        remoteVersionRef.current = saved.documentVersion;
      }

      if (hostedOwnerRef.current !== ownerId) return;
      await syncHostedRevisionPortals(client, stateToSave.jobs);
      if (hostedOwnerRef.current !== ownerId) return;
      lastSyncedStateRef.current = stateToSave;
      const rebasedVisible = mergeConcurrentWorkspaceState(next, stateRef.current, stateToSave);
      if (rebasedVisible.conflicts.length) {
        const message = "저장 대기 중 다른 기기와 같은 항목이 바뀌어 후속 편집 자동 저장을 멈췄어요. 이 기기의 편집은 보존됐어요.";
        hostedConflictRef.current = message;
        const visible = preserveQueuedRevisionEvidence(stateRef.current, stateRef.current, stateToSave);
        setCurrentState(visible);
        saveState(visible, undefined, storageKeyForUser(ownerId));
        throw new Error(message);
      }

      hostedConflictRef.current = null;
      saveFailureRef.current = null;
      const visible = rebasedVisible.state;
      if (!jsonEqual(visible, stateRef.current)) setCurrentState(visible);
      saveState(visible, undefined, storageKeyForUser(ownerId));
      if (sequence === saveSequenceRef.current) {
        clearHostedDraft(ownerId);
        setSaveStatus("saved");
      } else {
        writeHostedDraft(ownerId, visible, remoteVersionRef.current, stateToSave);
      }
    });

    saveChainRef.current = operation.catch((error: unknown) => {
      if (hostedOwnerRef.current !== ownerId) return;
      saveFailureRef.current = error;
      const draft = readHostedDraft(ownerId);
      const message = error instanceof Error ? error.message : "저장 중 알 수 없는 오류가 발생했어요.";
      writeHostedDraft(
        ownerId,
        stateRef.current,
        draft?.baseVersion ?? remoteVersionRef.current,
        draft?.baseState ?? lastSyncedStateRef.current ?? stateRef.current,
        message,
      );
      if (sequence !== saveSequenceRef.current) return;
      setSaveStatus("error");
      setSaveError(saveFailureMessage(error, "저장 중 알 수 없는 오류가 발생했어요."));
    });
  }, [setCurrentState]);

  useEffect(() => {
    registerIlgamcheckServiceWorker().catch(() => undefined);

    if (hostedRequested) {
      if (!boundary.configured) {
        return;
      }

      const client = getSupabaseBrowserClient();
      if (!client) {
        const timer = window.setTimeout(() => {
          setAuthStatus("configuration_error");
          setAuthError("Supabase 브라우저 클라이언트를 시작하지 못했어요.");
          setHydrated(true);
        }, 0);
        return () => window.clearTimeout(timer);
      }

      hostedClientRef.current = client;
      let cancelled = false;
      let activation = 0;
      let channel: ReturnType<SupabaseClient["channel"]> | null = null;
      let activeSessionIdentity: string | null | undefined;

      const activateSession = async (session: Session | null) => {
        const currentActivation = ++activation;
        if (channel) {
          await client.removeChannel(channel);
          channel = null;
        }
        if (cancelled || currentActivation !== activation) return;

        if (!session?.user) {
          hostedOwnerRef.current = null;
          remoteVersionRef.current = 0;
          lastSyncedStateRef.current = null;
          setCurrentState(createSeedState());
          setUserEmail(null);
          setAuthStatus("signed_out");
          setAuthError(null);
          setRealtimeStatus("idle");
          setRealtimeError(null);
          setHydrated(true);
          return;
        }

        setHydrated(false);
        setAuthStatus("loading");
        setAuthError(null);
        setRealtimeStatus("connecting");
        setRealtimeError(null);
        hostedOwnerRef.current = session.user.id;
        hostedConflictRef.current = null;
        saveFailureRef.current = null;
        setUserEmail(session.user.email ?? null);
        const isStaleActivation = () => (
          cancelled
          || currentActivation !== activation
          || hostedOwnerRef.current !== session.user.id
        );

        try {
          // 무엇을 저장할 수 있는지 결정하는 값이라 작업공간보다 먼저 읽는다.
          // 실패해도 로그인을 막지는 않는다 — 그때는 가장 보수적인 무료로 남는다.
          try {
            const subscription = await loadHostedSubscription(client, session.user.id);
            if (!isStaleActivation()) setHostedSubscription(subscription);
          } catch {
            if (!isStaleActivation()) setHostedSubscription(null);
          }

          const cacheKey = storageKeyForUser(session.user.id);
          const cached = prepareStateForHosted(loadState(undefined, undefined, cacheKey));
          const draft = readHostedDraft(session.user.id);
          let remote = await loadHostedWorkspace(client, session.user.id);
          if (isStaleActivation()) return;

          if (!remote) {
            try {
              if (isStaleActivation()) return;
              const saved = await saveHostedWorkspace(client, cached, 0);
              if (isStaleActivation()) return;
              await syncHostedRevisionPortals(client, cached.jobs);
              if (isStaleActivation()) return;
              remote = { state: cached, documentVersion: saved.documentVersion, updatedAt: saved.updatedAt };
              clearHostedDraft(session.user.id);
            } catch (error) {
              if (isStaleActivation()) return;
              const message = error instanceof Error ? error.message : "Hosted 첫 저장에 실패했어요.";
              writeHostedDraft(session.user.id, cached, draft?.baseVersion ?? 0, draft?.baseState ?? cached, message);
              remoteVersionRef.current = 0;
              lastSyncedStateRef.current = null;
              setCurrentState(cached);
              setSaveStatus("error");
              setSaveError(saveFailureMessage(error, "Hosted 첫 저장에 실패했어요."));
              setAuthStatus("signed_in");
              setHydrated(true);
              return;
            }
          }
          if (isStaleActivation()) return;

          let visibleState = remote.state;
          let recoveryError: string | null = null;

          if (draft) {
            let recoveredState: AppState | null = null;
            if (draft.baseVersion === remote.documentVersion) {
              recoveredState = preserveQueuedRevisionEvidence(cached, cached, remote.state);
            } else {
              const merged = mergeConcurrentWorkspaceState(draft.baseState, cached, remote.state);
              if (merged.conflicts.length) {
                recoveryError = "다른 기기와 같은 항목을 수정해 자동 복구를 멈췄어요. 이 기기의 편집은 그대로 보존됐어요.";
                hostedConflictRef.current = recoveryError;
              } else {
                recoveredState = preserveQueuedRevisionEvidence(merged.state, cached, remote.state);
              }
            }

            if (recoveredState && !jsonEqual(recoveredState, remote.state)) {
              try {
                if (isStaleActivation()) return;
                const saved = await saveHostedWorkspace(client, recoveredState, remote.documentVersion);
                if (isStaleActivation()) return;
                await syncHostedRevisionPortals(client, recoveredState.jobs);
                if (isStaleActivation()) return;
                remote = {
                  state: recoveredState,
                  documentVersion: saved.documentVersion,
                  updatedAt: saved.updatedAt,
                };
                visibleState = recoveredState;
                clearHostedDraft(session.user.id);
              } catch (error) {
                if (isStaleActivation()) return;
                recoveryError = saveFailureMessage(error, "보존된 편집을 다시 저장하지 못했어요.");
              }
            } else if (recoveredState) {
              // The document may already contain the local edit while the
              // follow-up portal-hash synchronization failed. Repair that
              // second phase before declaring the preserved draft recovered.
              try {
                if (isStaleActivation()) return;
                await syncHostedRevisionPortals(client, remote.state.jobs);
                if (isStaleActivation()) return;
                clearHostedDraft(session.user.id);
                visibleState = remote.state;
              } catch (error) {
                if (isStaleActivation()) return;
                recoveryError = error instanceof Error
                  ? error.message
                  : "고객 수정 링크 동기화를 다시 완료하지 못했어요.";
              }
            }

            if (recoveryError) {
              visibleState = preserveQueuedRevisionEvidence(cached, cached, remote.state);
              writeHostedDraft(
                session.user.id,
                visibleState,
                draft.baseVersion,
                draft.baseState,
                recoveryError,
              );
            }
          }

          remoteVersionRef.current = remote.documentVersion;
          lastSyncedStateRef.current = remote.state;
          setCurrentState(visibleState);
          saveState(visibleState, undefined, cacheKey);
          setSaveStatus(recoveryError ? "error" : "saved");
          setSaveError(recoveryError
            ? recoveryError
            : null);
          setAuthStatus("signed_in");
          setHydrated(true);

          channel = client
            .channel(`workspace:${session.user.id}`)
            .on(
              "postgres_changes",
              {
                event: "UPDATE",
                schema: "public",
                table: "workspace_documents",
                filter: `owner_id=eq.${session.user.id}`,
              },
              () => {
                const reconcileAfterPendingSaves = async () => {
                  for (let attempt = 0; attempt < 3; attempt += 1) {
                    if (isStaleActivation()) return;
                    const pendingSaves = saveChainRef.current;
                    await pendingSaves;
                    if (isStaleActivation()) return;
                    const sequenceBeforeLoad = saveSequenceRef.current;
                    const fresh = await loadHostedWorkspace(client, session.user.id);
                    if (isStaleActivation()) return;
                    if (
                      pendingSaves !== saveChainRef.current
                      || sequenceBeforeLoad !== saveSequenceRef.current
                    ) continue;
                    if (!fresh || fresh.documentVersion <= remoteVersionRef.current) return;

                    const draft = readHostedDraft(session.user.id);
                    if (draft) {
                      const merged = mergeConcurrentWorkspaceState(
                        draft.baseState,
                        stateRef.current,
                        fresh.state,
                      );
                      remoteVersionRef.current = fresh.documentVersion;
                      lastSyncedStateRef.current = fresh.state;
                      if (merged.conflicts.length) {
                        const message = "다른 기기와 같은 항목을 수정해 자동 병합을 멈췄어요. 이 기기의 편집은 보존됐어요.";
                        hostedConflictRef.current = message;
                        const visible = preserveQueuedRevisionEvidence(stateRef.current, stateRef.current, fresh.state);
                        setCurrentState(visible);
                        writeHostedDraft(
                          session.user.id,
                          visible,
                          draft.baseVersion,
                          draft.baseState,
                          message,
                        );
                        setSaveStatus("error");
                        setSaveError(`${message} 새로고침하면 다시 확인해요.`);
                        return;
                      }

                      const visible = preserveQueuedRevisionEvidence(merged.state, stateRef.current, fresh.state);
                      setCurrentState(visible);
                      clearHostedDraft(session.user.id);
                      persistHostedState(visible);
                      return;
                    }

                    remoteVersionRef.current = fresh.documentVersion;
                    lastSyncedStateRef.current = fresh.state;
                    setCurrentState(fresh.state);
                    saveState(fresh.state, undefined, cacheKey);
                    return;
                  }
                };
                void reconcileAfterPendingSaves().catch((error: unknown) => {
                  if (isStaleActivation()) return;
                  setRealtimeStatus("error");
                  setRealtimeError(error instanceof Error
                    ? `실시간 갱신 실패: ${error.message}`
                    : "실시간 갱신에 실패했어요. 새로고침하면 서버 내용을 다시 확인해요.");
                });
              },
            )
            .subscribe((status) => {
              if (isStaleActivation()) return;
              if (status === "SUBSCRIBED") {
                setRealtimeStatus("connected");
                setRealtimeError(null);
                return;
              }
              if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
                setRealtimeStatus("error");
                setRealtimeError("실시간 연결이 끊겼어요. 저장은 계속되지만 고객 요청 자동 반영은 새로고침으로 확인해주세요.");
              }
            });
        } catch (error) {
          if (cancelled || currentActivation !== activation) return;
          setAuthStatus("configuration_error");
          setAuthError(error instanceof Error ? error.message : "Hosted 작업공간을 시작하지 못했어요.");
          setRealtimeStatus("error");
          setRealtimeError("실시간 연결을 시작하지 못했어요.");
          setHydrated(true);
        }
      };

      const { data: authListener } = client.auth.onAuthStateChange((event, session) => {
        const identity = session?.user.id ?? null;
        if (event !== "INITIAL_SESSION" && identity === activeSessionIdentity) {
          if (session?.user.email) setUserEmail(session.user.email);
          return;
        }
        activeSessionIdentity = identity;
        queueMicrotask(() => void activateSession(session));
      });

      return () => {
        cancelled = true;
        activation += 1;
        authListener.subscription.unsubscribe();
        if (channel) void client.removeChannel(channel);
      };
    }

    const hydrationTimer = window.setTimeout(() => {
      setCurrentState(loadState());
      setHydrated(true);
    }, 0);
    const syncOtherTab = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setCurrentState(loadState());
    };
    window.addEventListener("storage", syncOtherTab);
    return () => {
      window.clearTimeout(hydrationTimer);
      window.removeEventListener("storage", syncOtherTab);
    };
  }, [boundary.configured, hostedRequested, persistHostedState, setCurrentState]);

  const signIn = useCallback(async (email: string, password: string) => {
    const client = hostedClientRef.current;
    if (!client) throw new Error("Hosted 로그인이 설정되지 않았어요.");
    setAuthError(null);
    const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setAuthError(error.message);
      throw new Error(error.message);
    }
  }, []);

  const signUp = useCallback(async (
    email: string,
    password: string,
    acceptance: PolicyAcceptance,
  ) => {
    const client = hostedClientRef.current;
    if (!client) throw new Error("Hosted 회원가입이 설정되지 않았어요.");
    setAuthError(null);
    const { data, error } = await client.auth.signUp({
      email: email.trim(),
      password,
      options: { data: policySignupMetadata() },
    });
    if (error) {
      setAuthError(error.message);
      throw new Error(error.message);
    }
    if (data.session) {
      try {
        await recordCurrentPolicyAcceptance(client, acceptance);
      } catch (policyError) {
        const message = policyError instanceof Error
          ? policyError.message
          : "정책 동의 기록을 저장하지 못했어요.";
        setAuthError(message);
        throw new Error(message);
      }
    }
    return data.session
      ? "가입과 로그인이 완료됐어요."
      : "확인 메일을 보냈어요. 메일 인증 뒤 로그인해주세요.";
  }, []);

  const signOut = useCallback(async ({ discardUnsaved = false }: { discardUnsaved?: boolean } = {}) => {
    const client = hostedClientRef.current;
    const ownerId = hostedOwnerRef.current;
    if (!client) return;
    await saveChainRef.current.catch(() => undefined);
    if (hostedOwnerRef.current !== ownerId) return;
    if (!discardUnsaved && (saveFailureRef.current || hostedConflictRef.current || (ownerId && readHostedDraft(ownerId)))) {
      setSaveStatus("error");
      const message = "미저장 변경이 있어 로그아웃을 멈췄어요. 다시 저장하거나 '미저장 변경 버리고 로그아웃'을 선택해주세요.";
      setSaveError(message);
      throw Object.assign(new Error(message), { code: "UNSAVED_WORKSPACE" });
    }
    if (hostedOwnerRef.current !== ownerId) return;
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) throw new Error(error.message);
    if (ownerId) {
      window.localStorage.removeItem(storageKeyForUser(ownerId));
      clearHostedDraft(ownerId);
    }
    const registration = await navigator.serviceWorker?.getRegistration();
    const notifications = await registration?.getNotifications();
    notifications?.forEach((notification) => notification.close());
    if ("clearAppBadge" in navigator) {
      await (navigator as Navigator & { clearAppBadge: () => Promise<void> }).clearAppBadge().catch(() => undefined);
    }
  }, []);

  const deleteAccount = useCallback(async (password: string) => {
    if (!hostedRequested) throw new Error("이 기기에 저장하는 모드라 지울 서버 계정이 없어요.");
    const client = hostedClientRef.current;
    const ownerId = hostedOwnerRef.current;
    if (!client || !ownerId) throw new Error("로그인 세션을 다시 확인해주세요.");

    await saveChainRef.current.catch(() => undefined);
    const { data: currentSession } = await client.auth.getSession();
    const email = currentSession.session?.user.email;
    if (!email || currentSession.session?.user.id !== ownerId) {
      throw new Error("현재 계정 정보를 확인하지 못했어요. 다시 로그인해주세요.");
    }

    const { data: reauthenticated, error: reauthenticationError } = await client.auth.signInWithPassword({
      email,
      password,
    });
    if (reauthenticationError || !reauthenticated.session) {
      throw new Error("비밀번호가 맞지 않아요.");
    }
    if (reauthenticated.user?.id !== ownerId) {
      throw new Error("다른 계정으로 인증되어 삭제를 중단했어요.");
    }

    const response = await fetch("/api/account/delete", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Authorization: `Bearer ${reauthenticated.session.access_token}`,
        "Content-Type": "application/json",
        "X-Ilgamcheck-Delete-Confirm": "DELETE_ACCOUNT",
      },
      body: JSON.stringify({ confirmation: "DELETE_ACCOUNT" }),
    });
    const result = await response.json().catch(() => null) as { message?: unknown } | null;
    if (!response.ok) {
      throw new Error(typeof result?.message === "string" ? result.message : "계정을 삭제하지 못했어요.");
    }

    hostedOwnerRef.current = null;
    remoteVersionRef.current = 0;
    lastSyncedStateRef.current = null;
    hostedConflictRef.current = null;
    saveFailureRef.current = null;
    window.localStorage.removeItem(storageKeyForUser(ownerId));
    clearHostedDraft(ownerId);

    const registration = await navigator.serviceWorker?.getRegistration().catch(() => undefined);
    const notifications = await registration?.getNotifications().catch(() => undefined);
    notifications?.forEach((notification) => notification.close());
    if ("clearAppBadge" in navigator) {
      await (navigator as Navigator & { clearAppBadge: () => Promise<void> }).clearAppBadge().catch(() => undefined);
    }
    await client.auth.signOut({ scope: "local" }).catch(() => undefined);

    setCurrentState(createSeedState());
    setUserEmail(null);
    setAuthStatus("signed_out");
    setAuthError(null);
    setSaveStatus("saved");
    setSaveError(null);
    setRealtimeStatus("idle");
    setRealtimeError(null);
    setHydrated(true);
  }, [hostedRequested, setCurrentState]);

  const resolveHostedDraft = useCallback(async (strategy: "local" | "server") => {
    const client = hostedClientRef.current;
    const ownerId = hostedOwnerRef.current;
    if (!client || !ownerId) return;

    setRecoveryPending(true);
    setSaveStatus("saving");
    setSaveError(null);
    try {
      await saveChainRef.current;
      if (hostedOwnerRef.current !== ownerId) return;
      const draft = readHostedDraft(ownerId);
      const remote = await loadHostedWorkspace(client, ownerId);
      if (hostedOwnerRef.current !== ownerId) return;
      if (!remote) throw new Error("서버 작업공간을 찾지 못했어요.");

      if (strategy === "server") {
        await syncHostedRevisionPortals(client, remote.state.jobs);
        if (hostedOwnerRef.current !== ownerId) return;
        remoteVersionRef.current = remote.documentVersion;
        lastSyncedStateRef.current = remote.state;
        setCurrentState(remote.state);
        saveState(remote.state, undefined, storageKeyForUser(ownerId));
      } else {
        const base = draft?.baseState ?? lastSyncedStateRef.current ?? remote.state;
        const merged = mergeConcurrentWorkspaceState(base, stateRef.current, remote.state);
        const stateToSave = preserveQueuedRevisionEvidence(merged.state, stateRef.current, remote.state);
        const saved = await saveHostedWorkspace(client, stateToSave, remote.documentVersion);
        if (hostedOwnerRef.current !== ownerId) return;
        await syncHostedRevisionPortals(client, stateToSave.jobs);
        if (hostedOwnerRef.current !== ownerId) return;
        remoteVersionRef.current = saved.documentVersion;
        lastSyncedStateRef.current = stateToSave;
        setCurrentState(stateToSave);
        saveState(stateToSave, undefined, storageKeyForUser(ownerId));
      }

      clearHostedDraft(ownerId);
      hostedConflictRef.current = null;
      saveFailureRef.current = null;
      setSaveStatus("saved");
      setSaveError(null);
    } catch (error) {
      if (hostedOwnerRef.current !== ownerId) return;
      const message = saveFailureMessage(error, "보존된 편집을 복구하지 못했어요.");
      const draft = readHostedDraft(ownerId);
      writeHostedDraft(
        ownerId,
        stateRef.current,
        draft?.baseVersion ?? remoteVersionRef.current,
        draft?.baseState ?? lastSyncedStateRef.current ?? stateRef.current,
        message,
      );
      saveFailureRef.current = error;
      setSaveStatus("error");
      setSaveError(message);
    } finally {
      if (hostedOwnerRef.current === ownerId) setRecoveryPending(false);
    }
  }, [setCurrentState]);

  const commitState = useCallback((mutator: (current: AppState) => AppState) => {
    if (!hostedRequested) {
      const { state: next, saved } = mutateStoredState(mutator);
      setCurrentState(next);
      // 저장에 실패해도 화면은 갱신한다. 다만 조용히 넘어가면 사용자는 탭을 닫은 뒤에야 잃은 걸 안다.
      if (saved) {
        setSaveStatus("saved");
        setSaveError(null);
      } else {
        setSaveStatus("error");
        setSaveError("이 브라우저에 저장하지 못했어요. 저장 공간이 가득 찼거나 브라우저가 저장을 막고 있어요. 설정에서 JSON으로 내보내 보관해주세요.");
      }
      return next;
    }
    if (authStatus !== "signed_in") throw new Error("로그인 뒤에 저장할 수 있어요.");
    const next = mutator(stateRef.current);
    setCurrentState(next);
    persistHostedState(next);
    return next;
  }, [authStatus, hostedRequested, persistHostedState, setCurrentState]);

  const updateJob = useCallback((jobId: string, updater: (job: Job) => Job) => {
    commitState((previous) => ({
      ...previous,
      jobs: previous.jobs.map((job) => (job.id === jobId ? updater(job) : job)),
    }));
  }, [commitState]);

  const createJob = useCallback(
    (input: CreateJobInput) => {
      let createdJobId = "";
      commitState((current) => {
        const createdTotal = Math.max(current.jobsCreatedTotal ?? 0, 0);
        // 플랜 한도를 넘으면 조용히 no-op한다. UI는 호출 전에 미리 막아 업그레이드 안내를 보여준다.
        if (!canCreateJobFor(plan, current.jobs, createdTotal)) return current;
        const selectedPackage = current.packages.find((item) => item.id === input.packageId);
        if (!selectedPackage) throw new Error("선택한 패키지를 찾을 수 없어요.");
        const selectedOptions = current.options.filter((item) => input.optionIds.includes(item.id));
        const job = composeJob({
          clientLabel: input.clientLabel,
          startDate: input.startDate,
          package: selectedPackage,
          options: selectedOptions,
          revisionPortalToken: createSecurePortalToken(),
        });
        createdJobId = job.id;
        return {
          ...current,
          jobs: [job, ...current.jobs],
          // 누적 카운터는 여기서만 올라가고, 어디서도 내려가지 않는다.
          jobsCreatedTotal: createdTotal + 1,
          // 첫 일감을 만든 순간 7일 무제한 체험이 자동으로 시작된다. 두 번째부터는 그대로 둔다.
          trialStartedAt: current.trialStartedAt ?? new Date().toISOString(),
        };
      });
      return createdJobId;
    },
    [commitState, plan],
  );

  const toggleTask = useCallback(
    (jobId: string, taskId: string) => {
      updateJob(jobId, (job) => {
        if (job.status !== "active") return job;
        const task = job.tasks.find((item) => item.id === taskId);
        return task ? updateTaskStatus(job, taskId, task.status === "done" ? "todo" : "done") : job;
      });
    },
    [updateJob],
  );

  const toggleJobWaiting = useCallback(
    (jobId: string) => {
      updateJob(jobId, (job) => {
        if (job.status !== "active") return job;
        const waiting = job.tasks.find((task) => task.status === "waiting");
        if (waiting) return updateTaskStatus(job, waiting.id, "todo");
        const next = job.tasks.find((task) => task.status === "todo");
        return next ? updateTaskStatus(job, next.id, "waiting") : job;
      });
    },
    [updateJob],
  );

  const completeJob = useCallback(
    (jobId: string) => {
      commitState((current) => {
        const target = current.jobs.find((job) => job.id === jobId);
        if (!target) return current;
        const next = toggleJobCompletion(target);
        // 재진행(완료 → 활성)은 새 활성 일감을 만드는 것과 같으므로 동시 진행 한도를 다시 확인한다.
        // 누적 수는 늘지 않으니 누적 한도로는 막지 않는다.
        if (next.status === "active" && target.status !== "active" && !canActivateJobFor(plan, current.jobs)) {
          return current;
        }
        const resolved = next.status === "completed"
          ? { ...next, revisionPortalEnabled: false }
          : next;
        return {
          ...current,
          jobs: current.jobs.map((job) => (job.id === jobId ? resolved : job)),
        };
      });
    },
    [commitState, plan],
  );

  const deleteJob = useCallback((jobId: string) => {
    commitState((current) => ({
      ...current,
      jobs: current.jobs.filter((job) => job.id !== jobId),
    }));
  }, [commitState]);

  const setRevisionPortalEnabled = useCallback((jobId: string, enabled: boolean) => {
    updateJob(jobId, (job) => {
      if (job.status !== "active" || job.revisionPortalEnabled === enabled) return job;
      return {
        ...job,
        revisionPortalEnabled: enabled,
        updatedAt: new Date().toISOString(),
      };
    });
  }, [updateJob]);

  const rotateRevisionPortalToken = useCallback((jobId: string) => {
    let rotatedToken: string | null = null;
    updateJob(jobId, (job) => {
      if (job.status !== "active") return job;
      rotatedToken = createSecurePortalToken();
      return {
        ...job,
        revisionPortalToken: rotatedToken,
        updatedAt: new Date().toISOString(),
      };
    });
    return rotatedToken;
  }, [updateJob]);

  const recordRevision = useCallback(
    (jobId: string, content: string, channel: RevisionChannel = "kakao") => {
      if (!content.trim()) return;
      updateJob(jobId, (job) =>
        job.status === "active"
          ? appendRevision(job, { source: "manual", channel, body: content }).job
          : job,
      );
    },
    [updateJob],
  );

  const revertRevision = useCallback(
    (jobId: string, revisionId: string, reason?: string) => {
      updateJob(jobId, (job) =>
        job.status === "active" ? applyRevertedRevision(job, revisionId, reason) : job,
      );
    },
    [updateJob],
  );

  const recordPublicRevision = useCallback(
    (token: string, content: string, clientLabel?: string) => {
      if (!content.trim()) return null;
      let receipt: { jobId: string; usage: "used" | "extra_scope" } | null = null;
      commitState((current) => {
        const job = current.jobs.find(
          (item) =>
            item.status === "active" &&
            item.revisionPortalToken === token &&
            item.revisionPortalEnabled,
        );
        if (!job) return current;
        const recorded = appendRevision(job, {
          source: "public",
          clientLabel,
          body: content,
        });
        receipt = { jobId: job.id, usage: recorded.revision.usage };
        return {
          ...current,
          jobs: current.jobs.map((item) => (item.id === job.id ? recorded.job : item)),
        };
      });
      return receipt;
    },
    [commitState],
  );

  const savePackage = useCallback((template: PackageTemplate) => {
    const normalized = clonePackage({ ...template, id: template.id || createDomainId("pkg") });
    commitState((current) => {
      const isExisting = current.packages.some((item) => item.id === normalized.id);
      // 새 패키지 추가만 한도로 막는다. 기존 패키지 편집은 항상 허용한다.
      if (!isExisting && !canCreatePackageFor(plan, current.packages)) return current;
      return {
        ...current,
        packages: isExisting
          ? current.packages.map((item) => (item.id === normalized.id ? normalized : item))
          : [...current.packages, normalized],
      };
    });
  }, [commitState, plan]);

  const archivePackage = useCallback((packageId: string) => {
    commitState((current) => ({
      ...current,
      packages: current.packages.map((item) =>
        item.id === packageId ? { ...item, archivedAt: new Date().toISOString() } : item,
      ),
    }));
  }, [commitState]);

  const saveOption = useCallback((template: OptionTemplate) => {
    const normalized = cloneOption({ ...template, id: template.id || createDomainId("opt") });
    commitState((current) => {
      const isExisting = current.options.some((item) => item.id === normalized.id);
      // 새 옵션 추가만 한도로 막는다. 기존 옵션 편집은 항상 허용한다.
      if (!isExisting && !canCreateOptionFor(plan, current.options)) return current;
      return {
        ...current,
        options: isExisting
          ? current.options.map((item) => (item.id === normalized.id ? normalized : item))
          : [...current.options, normalized],
      };
    });
  }, [commitState, plan]);

  const archiveOption = useCallback((optionId: string) => {
    commitState((current) => ({
      ...current,
      options: current.options.map((item) =>
        item.id === optionId ? { ...item, archivedAt: new Date().toISOString() } : item,
      ),
    }));
  }, [commitState]);

  const updateJobLinks = useCallback((jobId: string, links: JobLink[]) => {
    updateJob(jobId, (job) => ({
      ...job,
      links: links.map((link) => ({ ...link })),
      updatedAt: new Date().toISOString(),
    }));
  }, [updateJob]);

  const createAddon = useCallback((jobId: string, input: Omit<CreateAddonInput, "addonId" | "createdAt">) => {
    let addonId = "";
    updateJob(jobId, (job) => {
      const addon = createAddonDraft(job, input);
      addonId = addon.id;
      return { ...job, addons: [...job.addons, addon], updatedAt: addon.createdAt };
    });
    return addonId;
  }, [updateJob]);

  const confirmAddon = useCallback((jobId: string, addonId: string) => {
    // 확정은 금액·원가·마감·Todo를 바꾼다. 끝난 일감이 뒤늦게 흔들리지 않도록
    // 취소와 같은 조건으로 막는다. 화면 가드만으로는 오래된 탭을 막지 못한다.
    updateJob(jobId, (job) => (job.status === "active" ? applyConfirmedAddon(job, addonId) : job));
  }, [updateJob]);

  const cancelAddon = useCallback((jobId: string, addonId: string) => {
    updateJob(jobId, (job) => (job.status === "active" ? applyCancelledAddon(job, addonId) : job));
  }, [updateJob]);

  const updateSettings = useCallback((updates: Partial<AppSettings>) => {
    commitState((current) => ({ ...current, settings: { ...current.settings, ...updates } }));
  }, [commitState]);

  /** Hosted는 서버 RPC, 로컬 데모는 저장 상태로 계정당 한 번만 적용한다. */
  const activateInviteCode = useCallback(async (rawCode: string) => {
    const code = normalizeInviteCode(rawCode);
    if (!code) return { ok: false, message: "베타 이용 코드를 입력해주세요." };

    // hosted에서는 서버가 코드를 검증하고 기간을 적는다.
    // 브라우저 판정만으로 Pro를 주면 화면과 서버가 어긋나 저장이 거부된다.
    if (hostedRequested) {
      const client = getSupabaseBrowserClient();
      const ownerId = hostedOwnerRef.current;
      if (!client || !ownerId) {
        return { ok: false, message: "로그인 뒤에 코드를 넣을 수 있어요." };
      }
      try {
        const result = await redeemHostedInviteCode(client, code);
        if (result.status === "already_redeemed") {
          return { ok: false, message: "베타 Pro는 계정당 한 번만 사용할 수 있어요." };
        }
        if (result.status === "rate_limited") {
          return { ok: false, message: "코드를 여러 번 잘못 넣었어요. 한 시간 뒤에 다시 시도해주세요." };
        }
        if (result.status !== "ok") {
          return { ok: false, message: "확인되지 않는 코드예요. 받은 코드를 다시 확인해주세요." };
        }
        const subscription = await loadHostedSubscription(client, ownerId);
        setHostedSubscription(subscription);
        return { ok: true, message: `코드를 확인했어요. ${BETA_GRANT_DAYS}일 동안 Pro를 무제한으로 써요.` };
      } catch {
        return { ok: false, message: "코드를 확인하지 못했어요. 잠시 뒤에 다시 시도해주세요." };
      }
    }

    if (!isValidInviteCode(code)) {
      return { ok: false, message: "확인되지 않는 코드예요. 받은 코드를 다시 확인해주세요." };
    }

    const current = stateRef.current;
    const alreadyActive = current.betaAccess
      && current.betaAccess.code === code
      && Date.parse(current.betaAccess.expiresAt) > Date.now();
    if (alreadyActive) {
      return { ok: false, message: "이미 적용된 코드예요." };
    }
    // 코드 종류를 바꿔도 계정당 한 번만 허용한다.
    if (current.redeemedInviteCodes.length > 0) {
      return { ok: false, message: "베타 Pro는 계정당 한 번만 사용할 수 있어요." };
    }

    const grantedAt = new Date().toISOString();
    commitState((previous) => ({
      ...previous,
      betaAccess: { code, grantedAt, expiresAt: betaExpiresAt(grantedAt) },
      redeemedInviteCodes: addRedeemedCode(previous.redeemedInviteCodes, code),
    }));
    return { ok: true, message: `코드를 확인했어요. ${BETA_GRANT_DAYS}일 동안 Pro를 무제한으로 써요.` };
  }, [commitState, hostedRequested]);

  const resetDemo = useCallback(() => {
    if (hostedRequested) {
      return;
    }
    const fresh = resetState();
    saveState(fresh);
    setCurrentState(fresh);
  }, [hostedRequested, setCurrentState]);

  // 알림도 같은 기준 시각을 쓴다. 그래야 탭을 열어둔 채 자정이나 브리핑 시각을 넘겨도 갱신된다.
  const alerts = useMemo(() => {
    const reference = new Date(now);
    const referenceDate = `${reference.getFullYear()}-${String(reference.getMonth() + 1).padStart(2, "0")}-${String(reference.getDate()).padStart(2, "0")}`;
    const referenceTime = `${String(reference.getHours()).padStart(2, "0")}:${String(reference.getMinutes()).padStart(2, "0")}`;
    return deriveInAppAlerts(state.jobs, state.settings, referenceDate, referenceTime);
  }, [state.jobs, state.settings, now]);

  const limits = PLAN_LIMITS[plan];
  const activeJobs = useMemo(() => countActiveJobs(state.jobs), [state.jobs]);
  const jobLimitHit = useMemo(
    () => jobLimitReached(plan, state.jobs, state.jobsCreatedTotal ?? 0),
    [plan, state.jobs, state.jobsCreatedTotal],
  );
  const canCreateJob = jobLimitHit === null;
  const canCreatePackage = useMemo(() => canCreatePackageFor(plan, state.packages), [plan, state.packages]);
  const canCreateOption = useMemo(() => canCreateOptionFor(plan, state.options), [plan, state.options]);

  const value = useMemo(
    () => ({
      ...state,
      hydrated,
      runtimeMode: boundary.requestedMode,
      authStatus,
      authError,
      userEmail,
      saveStatus,
      saveError,
      realtimeStatus,
      realtimeError,
      alerts,
      plan,
      basePlan,
      planAccess,
      limits,
      activeJobCount: activeJobs,
      canCreateJob,
      jobLimitHit,
      canCreatePackage,
      canCreateOption,
      activateInviteCode,
      signIn,
      signUp,
      signOut,
      deleteAccount,
      createJob,
      toggleTask,
      toggleJobWaiting,
      completeJob,
      deleteJob,
      setRevisionPortalEnabled,
      rotateRevisionPortalToken,
      recordRevision,
      revertRevision,
      recordPublicRevision,
      savePackage,
      archivePackage,
      saveOption,
      archiveOption,
      updateJobLinks,
      createAddon,
      confirmAddon,
      cancelAddon,
      updateSettings,
      resetDemo,
    }),
    [state, hydrated, boundary.requestedMode, authStatus, authError, userEmail, saveStatus, saveError, realtimeStatus, realtimeError, alerts, plan, basePlan, planAccess, limits, activeJobs, canCreateJob, jobLimitHit, canCreatePackage, canCreateOption, activateInviteCode, signIn, signUp, signOut, deleteAccount, createJob, toggleTask, toggleJobWaiting, completeJob, deleteJob, setRevisionPortalEnabled, rotateRevisionPortalToken, recordRevision, revertRevision, recordPublicRevision, savePackage, archivePackage, saveOption, archiveOption, updateJobLinks, createAddon, confirmAddon, cancelAddon, updateSettings, resetDemo],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
      {hostedRequested && authStatus === "signed_in" && saveStatus === "error" && (
        <aside
          role="alert"
          aria-live="assertive"
          data-testid="hosted-recovery-banner"
          className="hostedRecoveryBanner"
        >
          <strong style={{ display: "block", marginBottom: 5 }}>저장 복구가 필요해요</strong>
          <p style={{ margin: "0 0 12px", fontSize: 13 }}>{saveError}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              type="button"
              className="primaryButton"
              disabled={recoveryPending}
              onClick={() => {
                if (window.confirm("서버의 다른 변경은 합치고, 같은 항목은 이 기기의 편집으로 저장할까요?")) {
                  void resolveHostedDraft("local");
                }
              }}
            >
              {recoveryPending ? "복구 중…" : "이 기기 편집으로 재시도"}
            </button>
            <button
              type="button"
              className="quietButton"
              disabled={recoveryPending}
              onClick={() => {
                if (window.confirm("이 기기의 보존본을 삭제하고 서버에 저장된 내용으로 돌아갈까요?")) {
                  void resolveHostedDraft("server");
                }
              }}
            >
              서버본 사용
            </button>
          </div>
        </aside>
      )}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return value;
}

export { addCalendarDays as addDaysISO, getRevisionSummary };
export type { Job, Task, JobLink, PackageTemplate, OptionTemplate };

export function formatWon(value: number) {
  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

export function formatShortDate(value: string) {
  const [, month, day] = value.split("-");
  return `${Number(month)}월 ${Number(day)}일`;
}

export function getDday(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const due = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return "오늘 마감";
  if (diff > 0) return `D-${diff}`;
  return `${Math.abs(diff)}일 지연`;
}
