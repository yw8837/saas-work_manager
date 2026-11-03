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
import { normalizeOrderSource } from "./order-source";
import { jobFeeRate, marginAfterFee, normalizeFeeRate } from "./platform-fee";

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
      | "REVISION_NOT_OPEN"
      | "REVISION_LIMIT_REACHED"
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
  // 할 일 키는 화면이 이름으로 만드는 내부 값이라 사용자가 적을 수 없다. 비어 있으면 그 할 일을 다시 넣게 한다.
  if (!task.taskKey.trim()) {
    throw new DomainValidationError(`${source}에 알아볼 수 없는 할 일이 있어요. 그 할 일을 지우고 다시 넣어 주세요.`, "INVALID_INPUT");
  }
  assertText(task.title, `${source} 할 일 이름`);
  assertNonNegativeInteger(task.relativeDay, `${source} 할 일 날짜(시작 며칠 뒤)`);
  assertNonNegativeInteger(task.order, `${source} 할 일 순서`);
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
    else if (!delta.taskKey.trim()) {
      throw new DomainValidationError(`${option.name}에서 뺄 할 일을 골라 주세요.`, "INVALID_INPUT");
    }
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
    const [, sources] = duplicate;
    throw new DomainValidationError(
      `${sources.join(", ")}에 겹치는 할 일이 있어요. 한 곳에만 남겨 주세요.`,
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
export const INTAKE_ITEM_LIMIT = 10;
export const INTAKE_LABEL_MAX = 60;

/**
 * '시작 전 받을 자료' 이름을 정리한다. 빈 줄·중복은 빼고, 이름은 60자, 목록은 10개까지.
 * 이름은 고객 링크에 그대로 보이므로 작업자가 적은 글자만 쓴다.
 */
export function normalizeIntakeLabels(labels: unknown): string[] {
  if (!Array.isArray(labels)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of labels) {
    if (typeof raw !== "string") continue;
    const label = raw.trim().slice(0, INTAKE_LABEL_MAX);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    result.push(label);
    if (result.length === INTAKE_ITEM_LIMIT) break;
  }
  return result;
}

/** 받은 자료를 체크하거나 다시 '아직 안 받음'으로 돌린다. */
export function toggleIntakeItem(job: Job, itemId: string, now = new Date().toISOString()): Job {
  if (!job.intakeItems?.some((item) => item.id === itemId)) return job;
  return {
    ...job,
    intakeItems: job.intakeItems.map((item) => {
      if (item.id !== itemId) return item;
      if (item.receivedAt) return { id: item.id, label: item.label };
      return { ...item, receivedAt: now };
    }),
    updatedAt: now,
  };
}

/** 고객 링크에 보여 줄, 아직 받지 못한 자료 이름. */
export function pendingIntakeLabels(job: Pick<Job, "intakeItems">): string[] {
  return (job.intakeItems ?? []).filter((item) => !item.receivedAt).map((item) => item.label);
}

export const BRIEF_QUESTION_LIMIT = 5;
export const BRIEF_QUESTION_MAX = 80;
export const BRIEF_NOTE_MAX = 300;

/**
 * 패키지에 처음 넣어 주는 기본 질문 3개. 고객은 원하는 결과를 처음부터 말로 정리하기 어려우니
 * 업무 용어 없이 목적·예시·넣고 뺄 것만 묻는다. 작업자가 패키지마다 고친다.
 */
export const DEFAULT_BRIEF_QUESTIONS = [
  "이 작업으로 가장 하고 싶은 일은 무엇인가요? (예: 예약 받기, 가게 소개)",
  "마음에 드는 예시(사이트·사진)가 있으면 알려 주세요. 없으면 '없음'도 괜찮아요.",
  "꼭 들어가야 하는 것과 빼고 싶은 것이 있나요?",
] as const;

/** '착수 전 질문'을 정리한다. 빈 줄·중복은 빼고, 질문은 80자, 목록은 5개까지. */
export function normalizeBriefQuestions(questions: unknown): string[] {
  if (!Array.isArray(questions)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of questions) {
    if (typeof raw !== "string") continue;
    const question = raw.trim().slice(0, BRIEF_QUESTION_MAX);
    if (!question || seen.has(question)) continue;
    seen.add(question);
    result.push(question);
    if (result.length === BRIEF_QUESTION_LIMIT) break;
  }
  return result;
}

/** 고객 답을 받았다고 체크하거나 다시 '아직'으로 돌린다. 메모는 그대로 둔다. */
export function toggleBriefQuestion(job: Job, questionId: string, now = new Date().toISOString()): Job {
  if (!job.briefQuestions?.some((item) => item.id === questionId)) return job;
  return {
    ...job,
    briefQuestions: job.briefQuestions.map((item) => {
      if (item.id !== questionId) return item;
      if (item.answeredAt) {
        const { answeredAt: _answeredAt, ...rest } = item;
        return rest;
      }
      return { ...item, answeredAt: now };
    }),
    updatedAt: now,
  };
}

/** 질문 옆 한 줄 메모. 비우면 지운다. */
export function setBriefQuestionNote(job: Job, questionId: string, note: string, now = new Date().toISOString()): Job {
  if (!job.briefQuestions?.some((item) => item.id === questionId)) return job;
  const trimmed = note.trim().slice(0, BRIEF_NOTE_MAX);
  return {
    ...job,
    briefQuestions: job.briefQuestions.map((item) => {
      if (item.id !== questionId) return item;
      const { note: _note, ...rest } = item;
      return trimmed ? { ...rest, note: trimmed } : rest;
    }),
    updatedAt: now,
  };
}

/** 카톡 문구에 넣을, 아직 답을 받지 못한 질문. */
export function pendingBriefQuestions(job: Pick<Job, "briefQuestions">): string[] {
  return (job.briefQuestions ?? []).filter((item) => !item.answeredAt).map((item) => item.question);
}

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
  const intakeLabels = normalizeIntakeLabels(input.package.intakeItems);
  const briefQuestions = normalizeBriefQuestions(input.package.briefQuestions);
  const source = normalizeOrderSource(input.source);
  const feeRate = normalizeFeeRate(input.feeRate);

  return {
    ...(intakeLabels.length > 0
      ? { intakeItems: intakeLabels.map((label, index) => ({ id: `${jobId}_intake_${index + 1}`, label })) }
      : {}),
    ...(briefQuestions.length > 0
      ? { briefQuestions: briefQuestions.map((question, index) => ({ id: `${jobId}_brief_${index + 1}`, question })) }
      : {}),
    ...(source ? { source } : {}),
    ...(feeRate > 0 ? { feeRate } : {}),
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
    margin: marginAfterFee(amount, estimatedCost, feeRate),
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
  const countLive = (usage: Revision["usage"]) =>
    job.revisions.filter((revision) => isLiveRevision(revision) && revision.usage === usage).length;
  const used = countLive("used");
  return {
    included: job.revisionLimit,
    used,
    remaining: Math.max(0, job.revisionLimit - used),
    extraScope: countLive("extra_scope"),
    pending: countLive("pending"),
  };
}

function findOpenRevision(job: Job, revisionId: string): Revision {
  const target = job.revisions.find((revision) => revision.id === revisionId);
  if (!target) {
    throw new DomainValidationError("수정 요청을 찾을 수 없어요.", "REVISION_NOT_FOUND");
  }
  if (target.revertedAt) {
    throw new DomainValidationError("반려하거나 되돌린 요청이에요.", "REVISION_ALREADY_REVERTED");
  }
  return target;
}

/**
 * 작업자가 수정을 마치면 포함 수정 1회를 쓴다(접수만으로는 쓰지 않는다).
 * 추가 작업으로 분류했던 요청도 남은 횟수가 있으면 포함 수정으로 마칠 수 있다.
 * 회차 번호는 되돌린 뒤에도 다시 쓰지 않도록 지금까지 붙은 번호 다음을 쓴다.
 */
export function completeRevision(
  job: Job,
  revisionId: string,
  completedAt = new Date().toISOString(),
): Job {
  const target = findOpenRevision(job, revisionId);
  if (target.usage === "used") {
    throw new DomainValidationError("이미 수정 완료로 센 요청이에요.", "REVISION_NOT_OPEN");
  }
  if (getRevisionSummary(job).remaining <= 0) {
    throw new DomainValidationError(
      "남은 포함 수정이 없어요. 추가 작업으로 처리해 주세요.",
      "REVISION_LIMIT_REACHED",
    );
  }
  const nextSequence = Math.max(0, ...job.revisions.map((item) => item.sequence ?? 0)) + 1;
  return {
    ...job,
    revisions: job.revisions.map((revision) =>
      revision.id === revisionId
        ? { ...revision, usage: "used" as const, status: "done" as const, sequence: nextSequence, completedAt }
        : revision,
    ),
    updatedAt: completedAt,
  };
}

/** 확인 대기 요청을 포함 수정이 아닌 추가 작업으로 분류한다. 횟수는 쓰지 않는다. */
export function markRevisionExtraScope(
  job: Job,
  revisionId: string,
  markedAt = new Date().toISOString(),
): Job {
  const target = findOpenRevision(job, revisionId);
  if (target.usage !== "pending") {
    throw new DomainValidationError("확인 대기 중인 요청만 추가 작업으로 바꿀 수 있어요.", "REVISION_NOT_OPEN");
  }
  return {
    ...job,
    revisions: job.revisions.map((revision) =>
      revision.id === revisionId
        ? { ...revision, usage: "extra_scope" as const, status: "extra_scope" as const }
        : revision,
    ),
    updatedAt: markedAt,
  };
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

/**
 * 고객 링크/수동 접수 모두가 호출하는 단일 접수 경로.
 * 접수만으로는 수정 횟수를 쓰지 않는다(확인 대기). 작업자가 이미 고친 뒤 적는 수동 기록만
 * `completed`로 받아 바로 '수정 완료' 처리한다.
 */
export function recordRevision(
  job: Job,
  input: RecordRevisionInput,
): { job: Job; revision: Revision; receipt: RevisionReceipt } {
  assertText(input.body, "수정 요청내용");
  if (input.source === "manual" && !input.channel) {
    throw new DomainValidationError("수동 기록은 접수 채널을 골라주세요.", "INVALID_INPUT");
  }

  const submittedAt = input.submittedAt ?? new Date().toISOString();
  const pending: Revision = {
    id: input.revisionId ?? createDomainId("revision"),
    jobId: job.id,
    source: input.source,
    channel: input.source === "manual" ? input.channel : undefined,
    clientLabel: input.clientLabel?.trim() || undefined,
    body: input.body.trim(),
    referenceUrl: input.referenceUrl?.trim() || undefined,
    status: "new",
    usage: "pending",
    sequence: null,
    submittedAt,
  };

  const received: Job = {
    ...job,
    revisions: [...job.revisions, pending],
    updatedAt: submittedAt,
  };
  const nextJob = input.completed ? completeRevision(received, pending.id, submittedAt) : received;
  const revision = nextJob.revisions.find((item) => item.id === pending.id)!;
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
        "추가할 할 일이 이 일감의 다른 할 일과 겹쳐요. 다시 추가해 주세요.",
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
        "이 추가요청의 할 일이 일감의 다른 할 일과 겹쳐요. 추가요청을 취소하고 다시 만들어 주세요.",
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
    margin: marginAfterFee(nextAmount, nextEstimatedCost, jobFeeRate(job)),
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
    margin: marginAfterFee(nextAmount, nextEstimatedCost, jobFeeRate(job)),
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
 * 반려(확인 대기 요청)와 되돌림(이미 센 요청)은 원문을 지우지 않고 감사 필드만 남긴다.
 * 수정 완료로 셌던 요청을 되돌리면 그 1회가 사용 횟수에서 빠진다.
 * 추가 작업으로 분류된 다른 요청을 저절로 포함 수정으로 바꾸지는 않는다(작업자가 '수정 완료'로 정한다).
 * 사유는 선택이다. 비워두면 되돌린 사실만 남는다.
 */
export function revertRevision(
  job: Job,
  revisionId: string,
  reason?: string,
  revertedAt = new Date().toISOString(),
): Job {
  const revertReason = reason?.trim();
  findOpenRevision(job, revisionId);

  return {
    ...job,
    revisions: job.revisions.map((revision) =>
      revision.id === revisionId
        ? {
            ...revision,
            revertedAt,
            ...(revertReason ? { revertReason } : {}),
            status: "void" as const,
          }
        : revision,
    ),
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

/** 완료하면 완료 시각을 적고(월별 정리 기준), 다시 진행하면 그 칸을 지운다. */
export function toggleJobCompletion(job: Job, now = new Date().toISOString()): Job {
  if (job.status === "archived") return job;
  if (job.status === "completed") {
    const reopened: Job = { ...job, status: "active", updatedAt: now };
    delete reopened.completedAt;
    return reopened;
  }
  return { ...job, status: "completed", completedAt: now, updatedAt: now };
}

/** 시작 안내를 처음 복사한 시각을 남긴다. 이미 남겼으면 그대로 둔다(처음 한 번만). */
export function markStartShared(job: Job, now = new Date().toISOString()): Job {
  if (job.startSharedAt) return job;
  return { ...job, startSharedAt: now, updatedAt: now };
}
