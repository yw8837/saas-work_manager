import type {
  Addon,
  ComposeJobInput,
  CreateAddonInput,
  Job,
  OptionSnapshot,
  OptionTemplate,
  PackageSnapshot,
  PackageTemplate,
  RecordRevisionInput,
  Revision,
  RevisionReceipt,
  RevisionSummary,
  Task,
  TaskStatus,
  TaskTemplate,
} from "./types";

export class DomainValidationError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "INVALID_INPUT"
      | "ARCHIVED_TEMPLATE"
      | "DUPLICATE_OPTION"
      | "DUPLICATE_TASK_KEY"
      | "REVISION_NOT_FOUND"
      | "REVISION_ALREADY_REVERTED"
      | "ADDON_NOT_FOUND"
      | "ADDON_ALREADY_CONFIRMED"
      | "ADDON_ALREADY_CANCELLED",
  ) {
    super(message);
    this.name = "DomainValidationError";
  }
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DomainValidationError(`${label}은(는) 0 이상 정수여야 합니다.`, "INVALID_INPUT");
  }
}

function assertText(value: string, label: string): void {
  if (!value.trim()) {
    throw new DomainValidationError(`${label}을(를) 입력해주세요.`, "INVALID_INPUT");
  }
}

function parseISODate(value: string): Date {
  if (!DATE_PATTERN.test(value)) {
    throw new DomainValidationError("날짜는 YYYY-MM-DD 형식이어야 합니다.", "INVALID_INPUT");
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new DomainValidationError("존재하지 않는 날짜입니다.", "INVALID_INPUT");
  }
  return date;
}

/** 내부 전용: 음수 이동을 허용한다. 확정 취소가 마감일을 정확히 되돌릴 때 쓴다. */
function shiftCalendarDays(isoDate: string, days: number): string {
  const date = parseISODate(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function addCalendarDays(isoDate: string, days: number): string {
  assertNonNegativeInteger(days, "일수");
  return shiftCalendarDays(isoDate, days);
}

/**
 * 옵션과 추가요청은 자기가 붙을 패키지의 기간을 모른 채 상대일을 갖고 있다.
 * 그래서 7일짜리 패키지에 상대일 11일 업무가 붙으면 할 일 마감이 일감 마감보다 뒤로 간다.
 * 일감 마감을 넘는 상대일은 마감일로 끌어당긴다.
 */
function clampRelativeDay(relativeDay: number, durationDays: number): number {
  return Math.min(relativeDay, Math.max(durationDays, 0));
}

/** 시작일부터 마감일까지의 일수. 두 날짜 모두 UTC 자정 기준이라 나눗셈이 정확히 떨어진다. */
function countCalendarDays(startDate: string, endDate: string): number {
  const start = parseISODate(startDate).getTime();
  const end = parseISODate(endDate).getTime();
  return Math.round((end - start) / 86_400_000);
}

export function createDomainId(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}_${uuid}`;
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function clonePackage(template: PackageTemplate): PackageSnapshot {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    price: template.price,
    estimatedCost: template.estimatedCost,
    durationDays: template.durationDays,
    revisionLimit: template.revisionLimit,
    tasks: template.tasks.map((task) => ({ ...task })),
  };
}

function cloneOption(template: OptionTemplate): OptionSnapshot {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    priceDelta: template.priceDelta,
    estimatedCostDelta: template.estimatedCostDelta,
    durationDaysDelta: template.durationDaysDelta,
    revisionLimitDelta: template.revisionLimitDelta,
    taskDeltas: template.taskDeltas.map((delta) =>
      delta.kind === "add"
        ? { kind: "add", task: { ...delta.task } }
        : { kind: "remove", taskKey: delta.taskKey },
    ),
  };
}

function validateTask(task: TaskTemplate, source: string): void {
  assertText(task.taskKey, `${source} 업무 키`);
  assertText(task.title, `${source} 업무명`);
  assertNonNegativeInteger(task.relativeDay, `${source} 업무 상대일`);
  assertNonNegativeInteger(task.order, `${source} 업무 순서`);
}

function validatePackage(template: PackageTemplate): void {
  if (template.archivedAt) {
    throw new DomainValidationError("보관된 패키지로는 일감을 만들 수 없어요.", "ARCHIVED_TEMPLATE");
  }
  assertText(template.id, "패키지 ID");
  assertText(template.name, "패키지명");
  assertNonNegativeInteger(template.price, "패키지 금액");
  assertNonNegativeInteger(template.estimatedCost, "패키지 예상 원가");
  assertNonNegativeInteger(template.durationDays, "패키지 작업일");
  assertNonNegativeInteger(template.revisionLimit, "패키지 수정 한도");
  template.tasks.forEach((task) => validateTask(task, template.name));
}

function validateOption(option: OptionTemplate): void {
  if (option.archivedAt) {
    throw new DomainValidationError(`보관된 옵션 '${option.name}'을(를) 선택할 수 없어요.`, "ARCHIVED_TEMPLATE");
  }
  assertText(option.id, "옵션 ID");
  assertText(option.name, "옵션명");
  assertNonNegativeInteger(option.priceDelta, `${option.name} 추가금`);
  assertNonNegativeInteger(option.estimatedCostDelta, `${option.name} 예상 원가`);
  assertNonNegativeInteger(option.durationDaysDelta, `${option.name} 추가일`);
  assertNonNegativeInteger(option.revisionLimitDelta, `${option.name} 추가 수정`);
  option.taskDeltas.forEach((delta) => {
    if (delta.kind === "add") validateTask(delta.task, option.name);
    else assertText(delta.taskKey, `${option.name} 제거 업무 키`);
  });
}

interface TaskCandidate {
  template: TaskTemplate;
  source: "package" | "option";
  sourceId: string;
  sourceLabel: string;
  sourceRank: number;
}

function composeTasks(
  jobId: string,
  startDate: string,
  template: PackageTemplate,
  options: OptionTemplate[],
  durationDays: number,
): Task[] {
  const removeKeys = new Set(
    options.flatMap((option) =>
      option.taskDeltas
        .filter((delta) => delta.kind === "remove")
        .map((delta) => delta.taskKey),
    ),
  );

  const candidates: TaskCandidate[] = [
    ...template.tasks.map((task) => ({
      template: task,
      source: "package" as const,
      sourceId: template.id,
      sourceLabel: template.name,
      sourceRank: 0,
    })),
    ...options.flatMap((option, optionIndex) =>
      option.taskDeltas
        .filter((delta) => delta.kind === "add")
        .map((delta) => ({
          template: delta.task,
          source: "option" as const,
          sourceId: option.id,
          sourceLabel: option.name,
          sourceRank: optionIndex + 1,
        })),
    ),
  ].filter(({ template: task }) => !removeKeys.has(task.taskKey));

  const sourcesByKey = new Map<string, string[]>();
  for (const candidate of candidates) {
    const sources = sourcesByKey.get(candidate.template.taskKey) ?? [];
    sources.push(candidate.sourceLabel);
    sourcesByKey.set(candidate.template.taskKey, sources);
  }

  const duplicate = [...sourcesByKey.entries()].find(([, sources]) => sources.length > 1);
  if (duplicate) {
    const [taskKey, sources] = duplicate;
    throw new DomainValidationError(
      `업무 키 '${taskKey}'가 ${sources.join(", ")}에 중복됩니다. 한 원천만 남겨주세요.`,
      "DUPLICATE_TASK_KEY",
    );
  }

  return candidates
    .sort(
      (a, b) =>
        a.sourceRank - b.sourceRank ||
        a.template.order - b.template.order ||
        a.template.taskKey.localeCompare(b.template.taskKey, "ko"),
    )
    .map((candidate, index) => {
      // 패키지 마감일에 걸려 있던 업무(보통 납품)는 옵션으로 늘어난 마감을 따라간다.
      // 그러지 않으면 납품 체크가 추가 작업보다 앞에 놓인다.
      const atPackageDeadline =
        candidate.source === "package" && candidate.template.relativeDay === template.durationDays;
      const relativeDay = atPackageDeadline
        ? durationDays
        : clampRelativeDay(candidate.template.relativeDay, durationDays);
      return {
      id: `${jobId}:task:${encodeURIComponent(candidate.template.taskKey)}`,
      jobId,
      taskKey: candidate.template.taskKey,
      title: candidate.template.title,
      relativeDay,
      dueDate: addCalendarDays(startDate, relativeDay),
      status: "todo" as const,
      source: candidate.source,
      sourceId: candidate.sourceId,
      order: index,
      };
    });
}

/**
 * 선택 옵션 순서와 무관하게 같은 일감을 만든다.
 * 원본 템플릿은 깊은 스냅샷으로 복사되므로 이후 편집해도 기존 일감은 변하지 않는다.
 */
export function composeJob(input: ComposeJobInput): Job {
  assertText(input.clientLabel, "고객 별칭");
  parseISODate(input.startDate);
  validatePackage(input.package);

  const options = [...(input.options ?? [])].sort((a, b) => a.id.localeCompare(b.id));
  const optionIds = options.map((option) => option.id);
  if (new Set(optionIds).size !== optionIds.length) {
    throw new DomainValidationError("같은 옵션을 두 번 선택할 수 없어요.", "DUPLICATE_OPTION");
  }
  options.forEach(validateOption);

  const jobId = input.jobId ?? createDomainId("job");
  const createdAt = input.now ?? new Date().toISOString();
  const durationDays =
    input.package.durationDays + options.reduce((total, option) => total + option.durationDaysDelta, 0);
  const amount = input.package.price + options.reduce((total, option) => total + option.priceDelta, 0);
  const estimatedCost =
    input.package.estimatedCost +
    options.reduce((total, option) => total + option.estimatedCostDelta, 0);
  const revisionLimit =
    input.package.revisionLimit +
    options.reduce((total, option) => total + option.revisionLimitDelta, 0);
  const calculatedDueDate = addCalendarDays(input.startDate, durationDays);

  return {
    id: jobId,
    clientLabel: input.clientLabel.trim(),
    title: input.title?.trim() || `${input.clientLabel.trim()} · ${input.package.name}`,
    startDate: input.startDate,
    calculatedDueDate,
    dueDate: calculatedDueDate,
    packageId: input.package.id,
    optionIds,
    packageSnapshot: clonePackage(input.package),
    optionSnapshots: options.map(cloneOption),
    amount,
    estimatedCost,
    margin: amount - estimatedCost,
    revisionLimit,
    tasks: composeTasks(jobId, input.startDate, input.package, options, durationDays),
    revisions: [],
    addons: [],
    links: (input.links ?? []).map((link) => ({ ...link })),
    revisionPortalToken: input.revisionPortalToken ?? createDomainId("rev"),
    revisionPortalEnabled: true,
    status: "active",
    createdAt,
    updatedAt: createdAt,
  };
}

/**
 * 되돌린 기록을 세는 기준은 하나여야 한다.
 * revertedAt과 status="void"는 항상 같이 찍히지만, 두 곳에서 서로 다른 걸 보면
 * 한쪽만 바뀌는 날 used와 extraScope가 어긋난다.
 */
function isLiveRevision(revision: Revision): boolean {
  return !revision.revertedAt;
}

export function getRevisionSummary(job: Pick<Job, "revisionLimit" | "revisions">): RevisionSummary {
  const used = job.revisions.filter(
    (revision) => isLiveRevision(revision) && revision.usage === "used",
  ).length;
  return {
    included: job.revisionLimit,
    used,
    remaining: Math.max(0, job.revisionLimit - used),
    extraScope: job.revisions.filter(
      (revision) => isLiveRevision(revision) && revision.usage === "extra_scope",
    ).length,
  };
}

/**
 * 되돌리기로 한도가 풀리면, 그 뒤에 추가작업으로 잡혀 있던 기록이 순서대로 한도 안으로 들어온다.
 * 이걸 안 하면 되돌린 뒤 새로 온 요청만 무료가 되고, 먼저 온 요청이 계속 추가금으로 남는 역전이 생긴다.
 */
function regradeRevisions(revisions: Revision[], revisionLimit: number): Revision[] {
  let used = revisions.filter(
    (revision) => isLiveRevision(revision) && revision.usage === "used",
  ).length;
  // 회차 번호는 되돌린 뒤에도 다시 쓰지 않는다. 이미 쓴 번호 위에서만 이어 붙인다.
  let nextSequence = Math.max(0, ...revisions.map((revision) => revision.sequence ?? 0));

  return revisions.map((revision) => {
    if (!isLiveRevision(revision) || revision.usage !== "extra_scope") return revision;
    if (used >= revisionLimit) return revision;
    used += 1;
    nextSequence += 1;
    return {
      ...revision,
      usage: "used" as const,
      sequence: nextSequence,
      status: revision.status === "extra_scope" ? ("new" as const) : revision.status,
    };
  });
}

/**
 * 마감일에 걸려 있던 할 일(보통 납품)을 늘어난 마감만큼 함께 민다.
 * 그러지 않으면 추가요청을 확정한 뒤 납품 체크가 추가 작업보다 앞에 놓인다.
 * 이미 손댄 할 일은 기록이므로 건드리지 않고, 아직 시작 안 한 것만 민다.
 */
function shiftDeadlineTasks(job: Job, durationDaysDelta: number): Task[] {
  if (durationDaysDelta === 0) return job.tasks;
  const currentDuration = countCalendarDays(job.startDate, job.dueDate);
  return job.tasks.map((task) => {
    if (task.status !== "todo" || task.relativeDay !== currentDuration) return task;
    const relativeDay = task.relativeDay + durationDaysDelta;
    return { ...task, relativeDay, dueDate: addCalendarDays(job.startDate, relativeDay) };
  });
}

/** 고객 링크/수동 접수 모두가 호출하는 단일 수정 카운터 경로. */
export function recordRevision(
  job: Job,
  input: RecordRevisionInput,
): { job: Job; revision: Revision; receipt: RevisionReceipt } {
  assertText(input.body, "수정 요청내용");
  if (input.source === "manual" && !input.channel) {
    throw new DomainValidationError("수동 기록은 접수 채널을 골라주세요.", "INVALID_INPUT");
  }

  const before = getRevisionSummary(job);
  const submittedAt = input.submittedAt ?? new Date().toISOString();
  const countsAsRevision = before.remaining > 0;
  const nextSequence =
    Math.max(0, ...job.revisions.map((item) => item.sequence ?? 0)) + 1;
  const revision: Revision = {
    id: input.revisionId ?? createDomainId("revision"),
    jobId: job.id,
    source: input.source,
    channel: input.source === "manual" ? input.channel : undefined,
    clientLabel: input.clientLabel?.trim() || undefined,
    body: input.body.trim(),
    referenceUrl: input.referenceUrl?.trim() || undefined,
    status: countsAsRevision ? "new" : "extra_scope",
    usage: countsAsRevision ? "used" : "extra_scope",
    sequence: countsAsRevision ? nextSequence : null,
    submittedAt,
  };

  const nextJob: Job = {
    ...job,
    revisions: [...job.revisions, revision],
    updatedAt: submittedAt,
  };
  const summary = getRevisionSummary(nextJob);

  return {
    job: nextJob,
    revision,
    receipt: {
      revisionId: revision.id,
      usage: revision.usage,
      sequence: revision.sequence,
      submittedAt,
      summary,
    },
  };
}

/**
 * 추가요청은 초안 상태에서는 합계나 일정에 영향을 주지 않는다.
 * Todo 키는 확정 전에도 검증하여 주문에 동일한 업무가 중복되는 일을 막는다.
 */
export function createAddon(job: Job, input: CreateAddonInput): Addon {
  assertText(input.title, "추가요청 제목");
  assertNonNegativeInteger(input.amountDelta, "추가금");
  assertNonNegativeInteger(input.estimatedCostDelta ?? 0, "추가 예상 원가");
  assertNonNegativeInteger(input.durationDaysDelta, "추가 기간");
  const tasks = (input.tasks ?? []).map((task) => ({ ...task }));
  tasks.forEach((task) => validateTask(task, input.title));

  const allKeys = new Set(job.tasks.map((task) => task.taskKey));
  for (const task of tasks) {
    if (allKeys.has(task.taskKey)) {
      throw new DomainValidationError(
        `업무 키 '${task.taskKey}'가 기존 할 일과 중복됩니다. 다른 키를 입력해주세요.`,
        "DUPLICATE_TASK_KEY",
      );
    }
    allKeys.add(task.taskKey);
  }

  return {
    id: input.addonId ?? createDomainId("addon"),
    jobId: job.id,
    title: input.title.trim(),
    amountDelta: input.amountDelta,
    estimatedCostDelta: input.estimatedCostDelta ?? 0,
    durationDaysDelta: input.durationDaysDelta,
    tasks,
    status: "draft",
    sourceRevisionId: input.sourceRevisionId,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

/**
 * 확정 순간에만 돈·마감·할 일을 일감에 반영한다. 원본 패키지/옵션 스냅샷은 바꾸지 않는다.
 */
export function confirmAddon(job: Job, addonId: string, confirmedAt = new Date().toISOString()): Job {
  const addon = job.addons.find((item) => item.id === addonId);
  if (!addon) {
    throw new DomainValidationError("확정할 추가요청을 찾을 수 없어요.", "ADDON_NOT_FOUND");
  }
  if (addon.status === "confirmed") {
    throw new DomainValidationError("이미 확정된 추가요청이에요.", "ADDON_ALREADY_CONFIRMED");
  }
  if (addon.status === "cancelled") {
    throw new DomainValidationError("취소된 추가요청은 확정할 수 없어요.", "INVALID_INPUT");
  }

  const existingKeys = new Set(job.tasks.map((task) => task.taskKey));
  for (const task of addon.tasks) {
    validateTask(task, addon.title);
    if (existingKeys.has(task.taskKey)) {
      throw new DomainValidationError(
        `업무 키 '${task.taskKey}'가 기존 할 일과 중복됩니다.`,
        "DUPLICATE_TASK_KEY",
      );
    }
    existingKeys.add(task.taskKey);
  }

  const nextDueDate = addCalendarDays(job.dueDate, addon.durationDaysDelta);
  const nextDurationDays = countCalendarDays(job.startDate, nextDueDate);
  const addonTasks: Task[] = addon.tasks
    .slice()
    .sort((a, b) => a.order - b.order || a.taskKey.localeCompare(b.taskKey, "ko"))
    .map((task, index) => {
      const relativeDay = clampRelativeDay(task.relativeDay, nextDurationDays);
      return {
        id: `${job.id}:addon:${addon.id}:${encodeURIComponent(task.taskKey)}`,
        jobId: job.id,
        taskKey: task.taskKey,
        title: task.title,
        relativeDay,
        dueDate: addCalendarDays(job.startDate, relativeDay),
        status: "todo" as const,
        source: "addon" as const,
        sourceId: addon.id,
        order: job.tasks.length + index,
      };
    });
  const nextAmount = job.amount + addon.amountDelta;
  const nextEstimatedCost = job.estimatedCost + addon.estimatedCostDelta;

  return {
    ...job,
    amount: nextAmount,
    estimatedCost: nextEstimatedCost,
    margin: nextAmount - nextEstimatedCost,
    calculatedDueDate: nextDueDate,
    dueDate: nextDueDate,
    tasks: [...shiftDeadlineTasks(job, addon.durationDaysDelta), ...addonTasks],
    addons: job.addons.map((item) =>
      item.id === addonId ? { ...item, status: "confirmed", confirmedAt } : item,
    ),
    updatedAt: confirmedAt,
  };
}

/**
 * 확정 취소는 확정의 정확한 역연산이다.
 * 초안은 아직 어디에도 반영된 적이 없어 상태만 바꾸고,
 * 확정본은 금액·원가·마감일과 그때 생성한 할 일을 그대로 되돌린다.
 * 추가요청 기록 자체는 남겨 취소 이력을 감추지 않는다.
 */
export function cancelAddon(job: Job, addonId: string, cancelledAt = new Date().toISOString()): Job {
  const addon = job.addons.find((item) => item.id === addonId);
  if (!addon) {
    throw new DomainValidationError("취소할 추가요청을 찾을 수 없어요.", "ADDON_NOT_FOUND");
  }
  if (addon.status === "cancelled") {
    throw new DomainValidationError("이미 취소된 추가요청이에요.", "ADDON_ALREADY_CANCELLED");
  }

  const addons = job.addons.map((item) =>
    item.id === addonId ? { ...item, status: "cancelled" as const, cancelledAt } : item,
  );

  // 초안은 합계·마감·할 일 어디에도 반영된 적이 없으므로 되돌릴 값이 없다.
  if (addon.status === "draft") {
    return { ...job, addons, updatedAt: cancelledAt };
  }

  const nextAmount = job.amount - addon.amountDelta;
  const nextEstimatedCost = job.estimatedCost - addon.estimatedCostDelta;

  return {
    ...job,
    amount: nextAmount,
    estimatedCost: nextEstimatedCost,
    margin: nextAmount - nextEstimatedCost,
    calculatedDueDate: shiftCalendarDays(job.calculatedDueDate, -addon.durationDaysDelta),
    dueDate: shiftCalendarDays(job.dueDate, -addon.durationDaysDelta),
    // 범위를 취소해도 "이미 손댄 일"의 기록은 지우지 않는다.
    // 아직 시작하지 않은(todo) 할 일만 걷어내고, 완료·대기·취소된 것은 그대로 남긴다.
    // 확정 때 민 마감 할 일도 정확히 되돌린다. 취소는 확정의 역연산이어야 한다.
    tasks: shiftDeadlineTasks(job, -addon.durationDaysDelta)
      .filter((task) => !(task.source === "addon" && task.sourceId === addon.id && task.status === "todo"))
      .map((task, index) => ({ ...task, order: index })),
    addons,
    updatedAt: cancelledAt,
  };
}

/**
 * 되돌림은 원문을 지우지 않고 감사 필드만 남겨 횟수를 복구한다.
 * 사유는 선택이다. 비워두면 되돌린 사실만 남는다.
 */
export function revertRevision(
  job: Job,
  revisionId: string,
  reason?: string,
  revertedAt = new Date().toISOString(),
): Job {
  const revertReason = reason?.trim();
  const target = job.revisions.find((revision) => revision.id === revisionId);
  // 오접수는 한도 안(used)이든 한도를 넘긴 추가작업(extra_scope)이든 똑같이 되돌릴 수 있다.
  // 남은 횟수 복구는 getRevisionSummary가 usage에 따라 알아서 계산한다.
  if (!target) {
    throw new DomainValidationError("되돌릴 수정 기록을 찾을 수 없어요.", "REVISION_NOT_FOUND");
  }
  if (target.revertedAt) {
    throw new DomainValidationError("이미 되돌린 수정 기록이에요.", "REVISION_ALREADY_REVERTED");
  }

  const reverted = job.revisions.map((revision) =>
    revision.id === revisionId
      ? {
          ...revision,
          revertedAt,
          ...(revertReason ? { revertReason } : {}),
          status: "void" as const,
        }
      : revision,
  );

  return {
    ...job,
    revisions: regradeRevisions(reverted, job.revisionLimit),
    updatedAt: revertedAt,
  };
}

export function updateTaskStatus(
  job: Job,
  taskId: string,
  status: TaskStatus,
  now = new Date().toISOString(),
): Job {
  return {
    ...job,
    tasks: job.tasks.map((task) => {
      if (task.id !== taskId || task.status === status) return task;
      return {
        ...task,
        status,
        waitingSince: status === "waiting" ? now : undefined,
        completedAt: status === "done" ? now : undefined,
        cancelledAt: status === "cancelled" ? now : undefined,
      };
    }),
    updatedAt: now,
  };
}

export function toggleJobCompletion(job: Job, now = new Date().toISOString()): Job {
  if (job.status === "archived") return job;
  return {
    ...job,
    status: job.status === "completed" ? "active" : "completed",
    updatedAt: now,
  };
}
