export type ISODate = string;

export type TaskStatus = "todo" | "waiting" | "done" | "cancelled";
export type JobStatus = "active" | "completed" | "archived";
export type RevisionSource = "public" | "manual";
export type RevisionChannel =
  | "kakao"
  | "kmong"
  | "soomgo"
  | "instagram"
  | "discord"
  | "phone"
  | "other";

export interface TaskTemplate {
  taskKey: string;
  title: string;
  relativeDay: number;
  order: number;
}

export type TaskDelta =
  | { kind: "add"; task: TaskTemplate }
  | { kind: "remove"; taskKey: string };

export interface PackageTemplate {
  id: string;
  name: string;
  description?: string;
  price: number;
  estimatedCost: number;
  durationDays: number;
  revisionLimit: number;
  tasks: TaskTemplate[];
  archivedAt?: string;
}

export interface OptionTemplate {
  id: string;
  name: string;
  description?: string;
  priceDelta: number;
  estimatedCostDelta: number;
  durationDaysDelta: number;
  revisionLimitDelta: number;
  taskDeltas: TaskDelta[];
  archivedAt?: string;
}

export type PackageSnapshot = Omit<PackageTemplate, "archivedAt">;
export type OptionSnapshot = Omit<OptionTemplate, "archivedAt">;

export interface Task {
  id: string;
  jobId: string;
  taskKey: string;
  title: string;
  relativeDay: number;
  dueDate: ISODate;
  status: TaskStatus;
  source: "package" | "option" | "addon" | "manual";
  sourceId: string;
  order: number;
  waitingSince?: string;
  completedAt?: string;
  cancelledAt?: string;
}

export type RevisionStatus = "new" | "seen" | "done" | "extra_scope" | "void";

/**
 * 고객 링크와 작업자 수동 접수가 공유하는 하나의 수정 로그다.
 * `usage` is immutable business meaning; a reversal is recorded separately
 * through the `revertedAt`/`revertReason` audit fields without deleting text.
 */
export interface Revision {
  id: string;
  jobId: string;
  source: RevisionSource;
  channel?: RevisionChannel;
  clientLabel?: string;
  body: string;
  referenceUrl?: string;
  status: RevisionStatus;
  usage: "used" | "extra_scope";
  sequence: number | null;
  submittedAt: string;
  revertedAt?: string;
  revertReason?: string;
}

export interface Addon {
  id: string;
  jobId: string;
  title: string;
  amountDelta: number;
  estimatedCostDelta: number;
  durationDaysDelta: number;
  tasks: TaskTemplate[];
  status: "draft" | "confirmed" | "cancelled";
  sourceRevisionId?: string;
  createdAt: string;
  confirmedAt?: string;
  cancelledAt?: string;
}

export interface CreateAddonInput {
  addonId?: string;
  title: string;
  amountDelta: number;
  estimatedCostDelta?: number;
  durationDaysDelta: number;
  tasks?: TaskTemplate[];
  sourceRevisionId?: string;
  createdAt?: string;
}

export interface JobLink {
  id: string;
  label: string;
  url: string;
  kind: "contact" | "work" | "figma" | "drive" | "github" | "other";
}

export interface Job {
  id: string;
  clientLabel: string;
  title: string;
  startDate: ISODate;
  calculatedDueDate: ISODate;
  dueDate: ISODate;
  dueDateOverride?: ISODate;
  packageId: string;
  optionIds: string[];
  packageSnapshot: PackageSnapshot;
  optionSnapshots: OptionSnapshot[];
  amount: number;
  estimatedCost: number;
  margin: number;
  revisionLimit: number;
  tasks: Task[];
  revisions: Revision[];
  addons: Addon[];
  links: JobLink[];
  revisionPortalToken: string;
  revisionPortalEnabled: boolean;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ComposeJobInput {
  clientLabel: string;
  title?: string;
  startDate: ISODate;
  package: PackageTemplate;
  options?: OptionTemplate[];
  links?: JobLink[];
  jobId?: string;
  now?: string;
  revisionPortalToken?: string;
}

export interface RecordRevisionInput {
  source: RevisionSource;
  channel?: RevisionChannel;
  clientLabel?: string;
  body: string;
  referenceUrl?: string;
  revisionId?: string;
  submittedAt?: string;
}

export interface RevisionSummary {
  included: number;
  used: number;
  remaining: number;
  extraScope: number;
}

export interface RevisionReceipt {
  revisionId: string;
  usage: Revision["usage"];
  sequence: number | null;
  submittedAt: string;
  summary: RevisionSummary;
}

export type InAppAlertKind = "deadline" | "waiting" | "revision" | "digest";

export interface InAppAlert {
  id: string;
  kind: InAppAlertKind;
  jobId: string;
  title: string;
  message: string;
  occurredAt: string;
  severity: "info" | "attention" | "urgent";
  taskId?: string;
  revisionId?: string;
}
