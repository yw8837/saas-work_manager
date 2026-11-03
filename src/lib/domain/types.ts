export type ISODate = string;

export type TaskStatus = "todo" | "waiting" | "done" | "cancelled";
export type JobStatus = "active" | "completed" | "archived";
export type RevisionSource = "public" | "manual";
/** 주문을 받은 곳(수주처). 작업자 화면에서만 쓰고 고객 문구·고객 링크에는 넣지 않는다. */
export type OrderSource = "kmong" | "soomgo" | "referral" | "direct" | "other";
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
  /** 작업을 시작하기 전에 고객에게 받을 자료 이름(최대 10개). 아직 못 받은 것은 고객 링크에 그대로 보인다. */
  intakeItems?: string[];
  /** 작업을 시작하기 전에 고객에게 물을 짧은 질문(최대 5개). 고객이 쓰는 말로 적고, 카톡 문구에 들어간다. */
  briefQuestions?: string[];
  archivedAt?: string;
}

/** 일감마다 복사되는 '시작 전 받을 자료' 한 줄. 받은 시각이 있으면 받은 것이다. */
export interface IntakeItem {
  id: string;
  label: string;
  receivedAt?: string;
}

/** 일감마다 복사되는 '착수 전 질문' 하나. 답은 고객이 평소 대화창으로 보내고, 작업자는 받았다고 체크만 한다. */
export interface BriefQuestion {
  id: string;
  question: string;
  answeredAt?: string;
  /** 작업자가 남기는 한 줄 메모(선택). 작업자 문서에만 있고 고객 화면으로 나가지 않는다. */
  note?: string;
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
 * pending: 접수됐지만 작업자가 아직 처리하지 않음(횟수를 쓰지 않는다).
 * used: 작업자가 '수정 완료'를 눌러 포함 수정 1회를 씀.
 * extra_scope: 작업자가 추가 작업으로 분류함(예전 규칙에서는 한도를 넘겨 접수된 요청).
 */
export type RevisionUsage = "pending" | "used" | "extra_scope";

/**
 * 고객 링크와 작업자 수동 접수가 공유하는 하나의 수정 로그다.
 * 수정 횟수는 접수가 아니라 작업자가 수정을 마칠 때 쓴다. `usage`는 pending에서
 * used/extra_scope로 한 번만 바뀌고, 되돌림은 원문을 지우지 않고
 * `revertedAt`/`revertReason` 감사 필드로 남긴다.
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
  usage: RevisionUsage;
  sequence: number | null;
  submittedAt: string;
  /** 작업자가 '수정 완료'를 누른 시각. 이때 포함 수정 1회를 쓴다. */
  completedAt?: string;
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
  /** 패키지의 '시작 전 받을 자료'를 일감을 만들 때 복사한 것. 없던 저장본에서는 비어 있다. */
  intakeItems?: IntakeItem[];
  /** 패키지의 '착수 전 질문'을 일감을 만들 때 복사한 것. 없던 저장본에서는 비어 있다. */
  briefQuestions?: BriefQuestion[];
  /** 주문을 받은 곳(선택). 없던 저장본·고르지 않은 일감에는 칸이 없다. */
  source?: OrderSource;
  /**
   * 받은 곳에서 떼이는 비율(%, 소수점 한 자리). 일감을 만들 때(또는 받은 곳을 바꿀 때) 설정 값을 남긴 스냅숏이라
   * 나중에 설정을 바꿔도 이 일감 금액은 그대로다. 0이면 칸이 없고, 칸이 없던 예전 일감도 0으로 본다. `margin`은 이 수수료를 뺀 값이다.
   */
  feeRate?: number;
  /** 일감을 완료한 시각(월별 정리의 기준). 완료를 되돌리면 칸을 지운다. 이 칸이 생기기 전에 완료한 저장본에는 없다. */
  completedAt?: string;
  /**
   * 시작 안내(저장 직후 안내의 문구·링크 복사, '시작 안내' 칩 복사)를 처음 복사한 시각. 한 번 남기면 바꾸지 않는다.
   * 없고 진행된 흔적(받은 자료·답·끝낸 할 일·수정 기록·추가요청)도 없으면 '고객에게 보낼 말'이 시작 안내를 먼저 고른다.
   * 없던 저장본·아직 안 보낸 일감에는 칸이 없다.
   */
  startSharedAt?: string;
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
  /** 주문을 받은 곳(선택). */
  source?: OrderSource;
  /** 그 받은 곳에서 떼이는 비율(%, 선택). 0이거나 없으면 떼지 않는다. */
  feeRate?: number;
}

export interface RecordRevisionInput {
  source: RevisionSource;
  channel?: RevisionChannel;
  clientLabel?: string;
  body: string;
  referenceUrl?: string;
  revisionId?: string;
  submittedAt?: string;
  /** 작업자가 이미 고친 뒤 적는 수동 기록이면 true. 접수와 동시에 '수정 완료'로 1회를 쓴다. */
  completed?: boolean;
}

export interface RevisionSummary {
  included: number;
  used: number;
  remaining: number;
  extraScope: number;
  /** 접수됐지만 작업자가 아직 처리하지 않은 요청 수(횟수에 들어가지 않음). */
  pending: number;
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
