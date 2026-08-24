import {
  addCalendarDays,
  composeJob,
  recordRevision,
  updateTaskStatus,
  type BetaAccess,
  type Job,
  type OptionTemplate,
  type PackageTemplate,
} from "../domain";

export const seedPackages: PackageTemplate[] = [
  {
    id: "pkg_basic_homepage",
    name: "Basic 홈페이지",
    description: "핵심 소개와 문의 전환에 집중한 4페이지 홈페이지",
    price: 790_000,
    estimatedCost: 95_000,
    durationDays: 7,
    revisionLimit: 1,
    tasks: [
      { taskKey: "brief", title: "의뢰서와 참고사이트 확인", relativeDay: 0, order: 0 },
      { taskKey: "structure", title: "페이지 구조와 핵심 문구 확인", relativeDay: 1, order: 1 },
      { taskKey: "design", title: "메인 디자인 공유", relativeDay: 3, order: 2 },
      { taskKey: "build", title: "반응형 페이지 제작", relativeDay: 5, order: 3 },
      { taskKey: "launch", title: "모바일 검수와 납품", relativeDay: 7, order: 4 },
    ],
  },
  {
    id: "pkg_standard_homepage",
    name: "Standard 홈페이지",
    description: "브랜드 설계와 전환 흐름을 담은 7페이지 홈페이지",
    price: 1_290_000,
    estimatedCost: 180_000,
    durationDays: 12,
    revisionLimit: 2,
    tasks: [
      { taskKey: "brief", title: "의뢰서와 레퍼런스 정리", relativeDay: 0, order: 0 },
      { taskKey: "wireframe", title: "와이어프레임 공유", relativeDay: 2, order: 1 },
      { taskKey: "copy-review", title: "핵심 문구와 자료 확인", relativeDay: 4, order: 2 },
      { taskKey: "design", title: "메인·하위 디자인 확정", relativeDay: 6, order: 3 },
      { taskKey: "build", title: "반응형 홈페이지 제작", relativeDay: 9, order: 4 },
      { taskKey: "launch", title: "최종 검수와 납품", relativeDay: 12, order: 5 },
    ],
  },
  {
    id: "pkg_deluxe_homepage",
    name: "Deluxe 홈페이지",
    description: "브랜드 스토리와 캠페인 전환까지 설계하는 12페이지 홈페이지",
    price: 1_890_000,
    estimatedCost: 310_000,
    durationDays: 18,
    revisionLimit: 3,
    tasks: [
      { taskKey: "kickoff", title: "킥오프와 목표 지표 정리", relativeDay: 0, order: 0 },
      { taskKey: "research", title: "경쟁사·고객 여정 리서치", relativeDay: 2, order: 1 },
      { taskKey: "wireframe", title: "전환 흐름 와이어프레임 공유", relativeDay: 5, order: 2 },
      { taskKey: "copy-review", title: "브랜드 문구와 자료 확인", relativeDay: 7, order: 3 },
      { taskKey: "design", title: "전체 디자인 확정", relativeDay: 10, order: 4 },
      { taskKey: "build", title: "반응형 홈페이지 제작", relativeDay: 14, order: 5 },
      { taskKey: "qa", title: "기기별 QA와 분석 도구 점검", relativeDay: 16, order: 6 },
      { taskKey: "launch", title: "최종 납품과 인수인계", relativeDay: 18, order: 7 },
    ],
  },
];

export const seedOptions: OptionTemplate[] = [
  {
    id: "opt_extra_pages",
    name: "추가 페이지 3장",
    description: "기본 패키지 범위를 넘는 소개·콘텐츠 페이지",
    priceDelta: 180_000,
    estimatedCostDelta: 30_000,
    durationDaysDelta: 3,
    revisionLimitDelta: 0,
    taskDeltas: [
      {
        kind: "add",
        task: { taskKey: "extra-pages", title: "추가 페이지 3장 제작", relativeDay: 11, order: 0 },
      },
    ],
  },
  {
    id: "opt_copywriting",
    name: "문구 정리",
    description: "고객의 원자료를 웹페이지용으로 다듬는 작업",
    priceDelta: 120_000,
    estimatedCostDelta: 20_000,
    durationDaysDelta: 2,
    revisionLimitDelta: 1,
    taskDeltas: [
      {
        kind: "add",
        task: { taskKey: "copy", title: "페이지별 핵심 문구 정리", relativeDay: 3, order: 0 },
      },
    ],
  },
  {
    id: "opt_seo_setup",
    name: "SEO 기본 설정",
    description: "검색 노출 기본값과 공유 미리보기 설정",
    priceDelta: 90_000,
    estimatedCostDelta: 10_000,
    durationDaysDelta: 1,
    revisionLimitDelta: 0,
    taskDeltas: [
      {
        kind: "add",
        task: { taskKey: "seo", title: "SEO·공유 미리보기 기본 설정", relativeDay: 11, order: 0 },
      },
    ],
  },
  {
    id: "opt_client_design",
    name: "고객 디자인 제공",
    description: "고객이 확정 디자인을 제공해 디자인 업무를 제외",
    priceDelta: 0,
    estimatedCostDelta: 0,
    durationDaysDelta: 0,
    revisionLimitDelta: 0,
    taskDeltas: [{ kind: "remove", taskKey: "design" }],
  },
];

export interface AppSettings {
  morningDigestEnabled: boolean;
  morningDigestTime: string;
  deadlineAlertsEnabled: boolean;
  deadlineAlertTime: string;
  deadlineOffsets: number[];
  waitingAlertsEnabled: boolean;
  waitingAlertTime: string;
  waitingOffsets: number[];
  revisionAlertsEnabled: boolean;
  revisionAlertTime: string;
  privateNotificationDetails: boolean;
  /** 첫 로그인에서 베타 코드 안내를 적용하거나 건너뛴 시각. */
  betaCodeOnboardingCompletedAt?: string;
}

export interface AppState {
  version: 2;
  packages: PackageTemplate[];
  options: OptionTemplate[];
  jobs: Job[];
  settings: AppSettings;
  /**
   * 지금까지 만든 일감 누적 수. 무료 플랜의 누적 한도 기준이다.
   * 단조 증가만 한다 — 완료·삭제·전체 초기화로 절대 줄지 않으며 jobs 배열과 독립적으로 산다.
   * 저장본에 없으면 loadState가 jobs.length로 채운다(기존 사용자 보호).
   */
  jobsCreatedTotal: number;
  /** 첫 일감을 만든 시각. 여기서부터 7일간 무제한 체험이 열린다. */
  trialStartedAt: string | null;
  /** 베타 초대 코드로 받은 Pro 권한. 클라이언트 저장분이라 위조 가능하다. */
  betaAccess: BetaAccess | null;
  /**
   * 이미 사용한 베타 초대 코드. 만료돼도 같은 코드를 다시 쓰지 못하게 막는다.
   * 전체 초기화로도 지워지지 않는다.
   */
  redeemedInviteCodes: string[];
}

function shiftDate(isoDate: string, delta: number): string {
  if (delta >= 0) return addCalendarDays(isoDate, delta);
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

export function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function createSeedState(referenceDate = localToday()): AppState {
  const homepage = composeJob({
    jobId: "job_seed_mora",
    revisionPortalToken: "demo-mora-revision",
    clientLabel: "모라스튜디오",
    title: "모라스튜디오 브랜드 사이트",
    startDate: shiftDate(referenceDate, -6),
    package: seedPackages[1],
    options: [seedOptions[0], seedOptions[1]],
    now: `${referenceDate}T00:00:00.000Z`,
    links: [
      { id: "link_mora_work", label: "작업 사이트", url: "https://example.com", kind: "work" },
      { id: "link_mora_kakao", label: "카카오톡", url: "https://open.kakao.com", kind: "contact" },
      { id: "link_mora_discord", label: "디스코드", url: "https://discord.com", kind: "contact" },
      { id: "link_mora_figma", label: "Figma", url: "https://www.figma.com", kind: "figma" },
      { id: "link_mora_drive", label: "Drive", url: "https://drive.google.com", kind: "drive" },
    ],
  });
  const withWaiting = updateTaskStatus(
    homepage,
    homepage.tasks.find((task) => task.taskKey === "wireframe")?.id ?? "",
    "waiting",
    `${shiftDate(referenceDate, -2)}T09:20:00.000Z`,
  );
  const withRevision = recordRevision(withWaiting, {
    revisionId: "revision_seed_mora_1",
    source: "public",
    clientLabel: "김담당",
    body: "첫 화면 메인 문구를 신제품 중심으로 바꿔주세요.",
    referenceUrl: "https://example.com/reference",
    submittedAt: `${shiftDate(referenceDate, -1)}T11:30:00.000Z`,
  }).job;

  const deluxe = composeJob({
    jobId: "job_seed_damda",
    revisionPortalToken: "demo-damda-revision",
    clientLabel: "담다상점",
    title: "담다상점 브랜드 홈페이지 개편",
    startDate: shiftDate(referenceDate, -20),
    package: seedPackages[2],
    options: [seedOptions[2]],
    now: `${shiftDate(referenceDate, -20)}T02:00:00.000Z`,
  });

  return {
    version: 2,
    packages: seedPackages.map((template) => ({
      ...template,
      tasks: template.tasks.map((task) => ({ ...task })),
    })),
    options: seedOptions.map((option) => ({
      ...option,
      taskDeltas: option.taskDeltas.map((delta) =>
        delta.kind === "add"
          ? { kind: "add", task: { ...delta.task } }
          : { kind: "remove", taskKey: delta.taskKey },
      ),
    })),
    jobs: [withRevision, deluxe],
    jobsCreatedTotal: 2,
    trialStartedAt: null,
    betaAccess: null,
    redeemedInviteCodes: [],
    settings: {
      morningDigestEnabled: true,
      morningDigestTime: "09:00",
      deadlineAlertsEnabled: true,
      deadlineAlertTime: "09:00",
      deadlineOffsets: [2, 1, 0],
      waitingAlertsEnabled: true,
      waitingAlertTime: "10:00",
      waitingOffsets: [2, 5],
      revisionAlertsEnabled: true,
      revisionAlertTime: "즉시",
      privateNotificationDetails: true,
    },
  };
}

/** 데모 화면이 바로 쓸 수 있는 기본 상태. 현재 날짜는 import 시점에 한 번만 반영된다. */
export const seedState: AppState = createSeedState();

/**
 * 처음 들어온 사용자의 첫 상태.
 * 남의 고객 이름과 지연된 일감을 보여주지 않도록 일감은 비우고,
 * 바로 "딸깍"을 시험해볼 수 있게 패키지·옵션 예시만 남긴다.
 */
export function createStarterState(referenceDate = localToday()): AppState {
  // 아직 아무 일감도 만들지 않았으니 누적 카운터도 0에서 시작한다.
  return { ...createSeedState(referenceDate), jobs: [], jobsCreatedTotal: 0 };
}
