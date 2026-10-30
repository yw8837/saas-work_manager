import {
  composeJob,
  getRevisionSummary,
  recordRevision,
  type Job,
  type OptionTemplate,
  type PackageTemplate,
  type RevisionSummary,
} from "@/lib/domain";

/**
 * 콜드메일·사용설명서용 예시 주문.
 * 고객 체험 링크(/demo/r)와 설명서 캡처가 같은 숫자를 쓰도록 한 곳에만 둔다.
 * 실제 고객·계정 정보가 아니며 서버·DB·브라우저 저장소 어디에도 쓰지 않는다.
 */
export const SAMPLE_PACKAGES: PackageTemplate[] = [
  {
    id: "pkg_sample_logo_basic",
    name: "BASIC 로고",
    description: "시안 1종과 기본 파일 전달",
    price: 150_000,
    estimatedCost: 20_000,
    durationDays: 5,
    revisionLimit: 2,
    tasks: [
      { taskKey: "brief", title: "요청서와 참고 이미지 확인", relativeDay: 0, order: 0 },
      { taskKey: "draft", title: "로고 시안 1종 공유", relativeDay: 3, order: 1 },
      { taskKey: "deliver", title: "최종 파일 전달", relativeDay: 5, order: 2 },
    ],
  },
  {
    id: "pkg_sample_logo_standard",
    name: "STANDARD 로고",
    description: "시안 2종, 색상 변형, 최종 파일 전달",
    price: 250_000,
    estimatedCost: 30_000,
    durationDays: 7,
    revisionLimit: 3,
    tasks: [
      { taskKey: "brief", title: "요청서와 참고 이미지 확인", relativeDay: 0, order: 0 },
      { taskKey: "draft", title: "로고 시안 2종 공유", relativeDay: 3, order: 1 },
      { taskKey: "color", title: "색상·흑백 변형 정리", relativeDay: 5, order: 2 },
      { taskKey: "deliver", title: "최종 파일 전달", relativeDay: 7, order: 3 },
    ],
  },
  {
    id: "pkg_sample_logo_deluxe",
    name: "DELUXE 로고",
    description: "시안 3종과 간단한 사용 안내서",
    price: 400_000,
    estimatedCost: 50_000,
    durationDays: 10,
    revisionLimit: 5,
    tasks: [
      { taskKey: "brief", title: "요청서와 참고 이미지 확인", relativeDay: 0, order: 0 },
      { taskKey: "draft", title: "로고 시안 3종 공유", relativeDay: 4, order: 1 },
      { taskKey: "color", title: "색상·흑백 변형 정리", relativeDay: 7, order: 2 },
      { taskKey: "guide", title: "로고 사용 안내서 작성", relativeDay: 9, order: 3 },
      { taskKey: "deliver", title: "최종 파일 전달", relativeDay: 10, order: 4 },
    ],
  },
];

export const SAMPLE_OPTIONS: OptionTemplate[] = [
  {
    id: "opt_sample_source_file",
    name: "원본 파일(AI·PDF) 제공",
    description: "편집 가능한 원본 파일을 함께 전달",
    priceDelta: 50_000,
    estimatedCostDelta: 0,
    durationDaysDelta: 1,
    revisionLimitDelta: 0,
    taskDeltas: [
      { kind: "add", task: { taskKey: "source", title: "원본 파일 정리", relativeDay: 7, order: 0 } },
    ],
  },
  {
    id: "opt_sample_business_card",
    name: "명함 디자인 추가",
    description: "확정 로고로 앞뒤 명함 1종",
    priceDelta: 80_000,
    estimatedCostDelta: 10_000,
    durationDaysDelta: 2,
    revisionLimitDelta: 1,
    taskDeltas: [
      { kind: "add", task: { taskKey: "card", title: "명함 시안 공유", relativeDay: 7, order: 0 } },
    ],
  },
];

export const SAMPLE_ORDER_ID = "job_sample_cafe_logo";
export const SAMPLE_CLIENT_LABEL = "예시 고객";
/** 체험 화면 머리에 크게 보이는 작업자 이름. 실제 사업자가 아닌 가상의 이름이다. */
export const SAMPLE_WORKER_NAME = "샘플 디자인 스튜디오";
export const SAMPLE_ORDER_TITLE = "샘플 카페 로고 디자인";
/** 설명서 캡처용 로컬 일감에만 쓰는 가짜 링크 값. 실제 고객 토큰 형식(256-bit 난수)이 아니다. */
export const SAMPLE_PORTAL_TOKEN = "sample-cafe-logo-guide";
export const SAMPLE_FIRST_REVISION = "1. 로고 글자를 조금 더 굵게 해주세요.\n2. 커피잔 아이콘 크기를 키워주세요.";

function shiftDate(isoDate: string, delta: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

/** 브라우저 현지 날짜. 저장소 모듈을 끌어오지 않으려고 따로 둔다. */
export function sampleToday(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/**
 * STANDARD 로고 + 원본 파일 옵션 = 300,000원, 8일, 수정 3회.
 * 사흘 전에 시작했고 고객 링크로 수정 1회를 이미 썼다.
 */
export function createSampleOrder(referenceDate = sampleToday()): Job {
  const startDate = shiftDate(referenceDate, -3);
  const composed = composeJob({
    jobId: SAMPLE_ORDER_ID,
    revisionPortalToken: SAMPLE_PORTAL_TOKEN,
    clientLabel: SAMPLE_CLIENT_LABEL,
    title: SAMPLE_ORDER_TITLE,
    startDate,
    package: SAMPLE_PACKAGES[1],
    options: [SAMPLE_OPTIONS[0]],
    now: `${startDate}T01:00:00.000Z`,
  });
  return recordRevision(composed, {
    source: "public",
    clientLabel: SAMPLE_CLIENT_LABEL,
    body: SAMPLE_FIRST_REVISION,
    revisionId: "revision_sample_first",
    submittedAt: `${shiftDate(referenceDate, -1)}T06:20:00.000Z`,
  }).job;
}

export type CustomerDemoState = {
  order: Job;
  /** 예시 주문을 만든 기준일. 마감을 "며칠 남음"으로 보여줄 때 쓴다. */
  referenceDate: string;
  /** 이 체험 화면에서 남긴 요청 수. 새로고침하면 처음으로 돌아간다. */
  submitted: number;
};

export type CustomerDemoView = {
  title: string;
  packageName: string;
  amount: number;
  dueDate: string;
  /**
   * 기준일부터 마감까지 남은 날. Next가 이 화면을 빌드 때 미리 그리므로
   * 날짜 대신 늘 같은 값인 남은 일수를 보여줘야 열람일과 어긋나지 않는다.
   */
  daysLeft: number;
  revision: RevisionSummary;
};

export function createCustomerDemoState(referenceDate = sampleToday()): CustomerDemoState {
  return { order: createSampleOrder(referenceDate), referenceDate, submitted: 0 };
}

export function viewCustomerDemo(state: CustomerDemoState): CustomerDemoView {
  return {
    title: state.order.title,
    packageName: state.order.packageSnapshot.name,
    amount: state.order.amount,
    dueDate: state.order.dueDate,
    daysLeft: Math.round(
      (Date.parse(`${state.order.dueDate}T00:00:00.000Z`) - Date.parse(`${state.referenceDate}T00:00:00.000Z`)) / 86_400_000,
    ),
    revision: getRevisionSummary(state.order),
  };
}

/**
 * 실제 고객 링크와 같은 규칙으로 요청을 기록한다.
 * 남은 횟수가 있으면 1회 차감, 다 썼으면 추가 작업 검토로 넘어간다.
 * 메모리 안의 상태만 바꾸며 어떤 저장소나 네트워크도 부르지 않는다.
 */
export function submitCustomerDemoRevision(
  state: CustomerDemoState,
  input: { body: string; clientLabel?: string; submittedAt?: string },
): { state: CustomerDemoState; usage: "used" | "extra_scope" } {
  if (input.body.trim().length < 2) {
    throw new Error("수정 요청 내용을 두 글자 이상 적어주세요.");
  }
  const { job, receipt } = recordRevision(state.order, {
    source: "public",
    clientLabel: input.clientLabel,
    body: input.body,
    revisionId: `revision_demo_${state.submitted + 1}`,
    submittedAt: input.submittedAt,
  });
  return {
    state: { ...state, order: job, submitted: state.submitted + 1 },
    usage: receipt.usage,
  };
}
