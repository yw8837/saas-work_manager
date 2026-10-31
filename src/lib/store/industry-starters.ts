import {
  activeOptionCount,
  activePackageCount,
  type Job,
  type OptionTemplate,
  type PackageTemplate,
  type PlanLimits,
} from "../domain";
import { seedOptions, seedPackages } from "./seed";

/**
 * 첫 실행에서 고르는 업종별 예시 패키지. 금액은 모두 "예시"이며 사용자가 패키지 화면에서 고쳐 쓴다.
 * 웹은 기존 기본 패키지(seed)를 그대로 쓴다.
 */
export type Industry = "web" | "design" | "video" | "photo";

export const INDUSTRY_LABELS: Record<Industry, string> = {
  web: "웹·홈페이지",
  design: "디자인",
  video: "영상",
  photo: "촬영",
};

export const INDUSTRY_ORDER: Industry[] = ["web", "design", "video", "photo"];

type Starter = { packages: PackageTemplate[]; options: OptionTemplate[] };

function task(taskKey: string, title: string, relativeDay: number, order: number) {
  return { taskKey, title, relativeDay, order };
}

export const INDUSTRY_STARTERS: Record<Industry, Starter> = {
  web: { packages: seedPackages, options: seedOptions },
  design: {
    packages: [
      {
        id: "pkg_starter_design_basic",
        name: "Basic 로고 디자인",
        description: "시안 1종과 기본 파일 전달",
        price: 150_000,
        estimatedCost: 20_000,
        durationDays: 5,
        revisionLimit: 2,
        tasks: [task("brief", "요청서와 참고 이미지 확인", 0, 0), task("draft", "로고 시안 1종 공유", 3, 1), task("deliver", "최종 파일 전달", 5, 2)],
      },
      {
        id: "pkg_starter_design_standard",
        name: "Standard 로고 디자인",
        description: "시안 2종, 색상 변형, 최종 파일 전달",
        price: 250_000,
        estimatedCost: 30_000,
        durationDays: 7,
        revisionLimit: 3,
        tasks: [task("brief", "요청서와 참고 이미지 확인", 0, 0), task("draft", "로고 시안 2종 공유", 3, 1), task("color", "색상·흑백 변형 정리", 5, 2), task("deliver", "최종 파일 전달", 7, 3)],
      },
      {
        id: "pkg_starter_design_branding",
        name: "브랜딩 패키지",
        description: "로고, 명함, 간단한 사용 안내서",
        price: 400_000,
        estimatedCost: 50_000,
        durationDays: 10,
        revisionLimit: 5,
        tasks: [task("brief", "요청서와 참고 이미지 확인", 0, 0), task("draft", "로고 시안 3종 공유", 4, 1), task("card", "명함 시안 공유", 7, 2), task("guide", "사용 안내서 작성", 9, 3), task("deliver", "최종 파일 전달", 10, 4)],
      },
    ],
    options: [
      {
        id: "opt_starter_design_source",
        name: "원본 파일(AI·PDF) 제공",
        description: "편집 가능한 원본 파일을 함께 전달",
        priceDelta: 50_000,
        estimatedCostDelta: 0,
        durationDaysDelta: 1,
        revisionLimitDelta: 0,
        taskDeltas: [{ kind: "add", task: task("source", "원본 파일 정리", 7, 0) }],
      },
      {
        id: "opt_starter_design_express",
        name: "빠른 작업",
        description: "일정을 앞당겨 먼저 작업",
        priceDelta: 70_000,
        estimatedCostDelta: 0,
        durationDaysDelta: 0,
        revisionLimitDelta: 0,
        taskDeltas: [],
      },
    ],
  },
  video: {
    packages: [
      {
        id: "pkg_starter_video_short",
        name: "숏폼 편집",
        description: "60초 이하 세로 영상 1편, 컷 편집과 자막",
        price: 120_000,
        estimatedCost: 10_000,
        durationDays: 4,
        revisionLimit: 2,
        tasks: [task("brief", "원본 영상과 요청 사항 확인", 0, 0), task("cut", "1차 편집본 공유", 2, 1), task("deliver", "최종본 전달", 4, 2)],
      },
      {
        id: "pkg_starter_video_youtube",
        name: "유튜브 편집",
        description: "15분 이하 1편, 컷 편집·자막·배경음",
        price: 250_000,
        estimatedCost: 20_000,
        durationDays: 6,
        revisionLimit: 2,
        tasks: [task("brief", "원본 영상과 구성 확인", 0, 0), task("cut", "1차 편집본 공유", 3, 1), task("subtitle", "자막·배경음 정리", 5, 2), task("deliver", "최종본 전달", 6, 3)],
      },
      {
        id: "pkg_starter_video_brand",
        name: "브랜드 홍보 영상",
        description: "기획 구성안부터 최종본까지 1편",
        price: 900_000,
        estimatedCost: 150_000,
        durationDays: 14,
        revisionLimit: 3,
        tasks: [task("brief", "목표와 참고 영상 정리", 0, 0), task("plan", "구성안 공유", 3, 1), task("cut", "1차 편집본 공유", 9, 2), task("color", "색 보정과 음악 정리", 12, 3), task("deliver", "최종본 전달", 14, 4)],
      },
    ],
    options: [
      {
        id: "opt_starter_video_thumbnail",
        name: "썸네일 제작",
        description: "영상 썸네일 1종",
        priceDelta: 30_000,
        estimatedCostDelta: 0,
        durationDaysDelta: 1,
        revisionLimitDelta: 0,
        taskDeltas: [{ kind: "add", task: task("thumbnail", "썸네일 시안 공유", 3, 0) }],
      },
      {
        id: "opt_starter_video_project_file",
        name: "편집 프로젝트 파일 제공",
        description: "편집 프로그램 원본 프로젝트 전달",
        priceDelta: 50_000,
        estimatedCostDelta: 0,
        durationDaysDelta: 0,
        revisionLimitDelta: 0,
        taskDeltas: [{ kind: "add", task: task("project", "프로젝트 파일 정리", 6, 0) }],
      },
    ],
  },
  photo: {
    packages: [
      {
        id: "pkg_starter_photo_profile",
        name: "프로필 촬영",
        description: "1시간 촬영, 보정본 5장",
        price: 150_000,
        estimatedCost: 20_000,
        durationDays: 5,
        revisionLimit: 1,
        tasks: [task("brief", "촬영 콘셉트와 일정 확인", 0, 0), task("shoot", "촬영", 2, 1), task("select", "셀렉 사진 공유", 3, 2), task("deliver", "보정본 전달", 5, 3)],
      },
      {
        id: "pkg_starter_photo_product",
        name: "제품 촬영",
        description: "제품 10종 이하, 보정본 20컷",
        price: 400_000,
        estimatedCost: 50_000,
        durationDays: 7,
        revisionLimit: 2,
        tasks: [task("brief", "제품 목록과 참고 사진 확인", 0, 0), task("shoot", "촬영", 2, 1), task("select", "셀렉 사진 공유", 4, 2), task("deliver", "보정본 전달", 7, 3)],
      },
      {
        id: "pkg_starter_photo_event",
        name: "행사 스냅 촬영",
        description: "3시간 촬영, 보정본 50컷",
        price: 600_000,
        estimatedCost: 80_000,
        durationDays: 10,
        revisionLimit: 1,
        tasks: [task("brief", "행사 일정과 필수 컷 확인", 0, 0), task("shoot", "현장 촬영", 3, 1), task("select", "셀렉 사진 공유", 6, 2), task("deliver", "보정본 전달", 10, 3)],
      },
    ],
    options: [
      {
        id: "opt_starter_photo_extra_edit",
        name: "보정 10장 추가",
        description: "기본 보정 수량을 넘는 추가 보정",
        priceDelta: 50_000,
        estimatedCostDelta: 0,
        durationDaysDelta: 2,
        revisionLimitDelta: 0,
        taskDeltas: [{ kind: "add", task: task("extra-edit", "추가 보정본 정리", 6, 0) }],
      },
      {
        id: "opt_starter_photo_travel",
        name: "출장 촬영",
        description: "고객이 정한 장소로 이동해 촬영",
        priceDelta: 50_000,
        estimatedCostDelta: 20_000,
        durationDaysDelta: 0,
        revisionLimitDelta: 0,
        taskDeltas: [],
      },
    ],
  },
};

const starterPackageById = new Map(
  Object.values(INDUSTRY_STARTERS).flatMap((starter) => starter.packages.map((item) => [item.id, item] as const)),
);
const starterOptionById = new Map(
  Object.values(INDUSTRY_STARTERS).flatMap((starter) => starter.options.map((item) => [item.id, item] as const)),
);

function withoutArchive<T extends { archivedAt?: string }>(item: T): Omit<T, "archivedAt"> {
  // archivedAt만 빼고 나머지 내용이 예시 원본과 같은지 비교한다.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { archivedAt, ...rest } = item;
  return rest;
}

/** 키 순서와 무관하게 비교한다. 서버(jsonb)를 거치면 키 순서가 바뀌기 때문이다. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  }
  return value;
}

function sameContent(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

/** 사용자가 손대지 않은 업종 예시 패키지인지. 이름 하나만 바꿔도 사용자 것으로 본다. */
export function isUntouchedStarterPackage(item: PackageTemplate): boolean {
  const template = starterPackageById.get(item.id);
  return Boolean(template) && sameContent(withoutArchive(item), template);
}

export function isUntouchedStarterOption(item: OptionTemplate): boolean {
  const template = starterOptionById.get(item.id);
  return Boolean(template) && sameContent(withoutArchive(item), template);
}

/** 보관하지 않은 패키지가 모두 손대지 않은 예시인지. 패키지 화면의 "예시" 안내에 쓴다. */
export function usesOnlyStarterPackages(packages: PackageTemplate[]): boolean {
  const live = packages.filter((item) => !item.archivedAt);
  return live.length > 0 && live.every(isUntouchedStarterPackage);
}

/** 지금 보이는 예시 패키지가 어느 업종 것인지. 섞였거나 사용자가 고쳤으면 null. */
export function currentStarterIndustry(packages: PackageTemplate[]): Industry | null {
  const live = packages.filter((item) => !item.archivedAt);
  if (!usesOnlyStarterPackages(packages)) return null;
  return INDUSTRY_ORDER.find((industry) => {
    const ids = INDUSTRY_STARTERS[industry].packages.map((item) => item.id);
    return live.length === ids.length && live.every((item) => ids.includes(item.id));
  }) ?? null;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export type IndustryStarterInput = {
  packages: PackageTemplate[];
  options: OptionTemplate[];
  jobs: Job[];
  jobsCreatedTotal: number;
};

/**
 * 업종 예시로 바꿔 끼운다.
 * - 일감이 한 건도 없고 한 번도 만든 적 없는 새 작업공간에서만 된다.
 * - 사용자가 만들었거나 고친 패키지·옵션은 그대로 둔다(삭제·덮어쓰기 없음).
 * - 손대지 않은 다른 업종 예시만 "보관"으로 숨긴다. 보관은 삭제가 아니며 같은 업종을 다시 고르면 돌아온다.
 */
export function applyIndustryStarter(
  input: IndustryStarterInput,
  industry: Industry,
  limits: Pick<PlanLimits, "packages" | "options">,
  now = new Date().toISOString(),
): { packages: PackageTemplate[]; options: OptionTemplate[] } {
  if (input.jobs.length > 0 || input.jobsCreatedTotal > 0) {
    throw new Error("일감을 만든 뒤에는 예시 패키지를 바꾸지 않아요. 패키지 화면에서 직접 고쳐 주세요.");
  }
  const starter = INDUSTRY_STARTERS[industry];
  const chosenPackageIds = new Set(starter.packages.map((item) => item.id));
  const chosenOptionIds = new Set(starter.options.map((item) => item.id));

  const packages = input.packages.map((item) => {
    if (chosenPackageIds.has(item.id)) {
      return item.archivedAt && isUntouchedStarterPackage(item) ? clone(starter.packages.find((t) => t.id === item.id)!) : item;
    }
    return !item.archivedAt && isUntouchedStarterPackage(item) ? { ...item, archivedAt: now } : item;
  });
  for (const template of starter.packages) {
    if (!packages.some((item) => item.id === template.id)) packages.push(clone(template));
  }

  const options = input.options.map((item) => {
    if (chosenOptionIds.has(item.id)) {
      return item.archivedAt && isUntouchedStarterOption(item) ? clone(starter.options.find((t) => t.id === item.id)!) : item;
    }
    return !item.archivedAt && isUntouchedStarterOption(item) ? { ...item, archivedAt: now } : item;
  });
  for (const template of starter.options) {
    if (!options.some((item) => item.id === template.id)) options.push(clone(template));
  }

  if (activePackageCount(packages) > limits.packages || activeOptionCount(options) > limits.options) {
    throw new Error("직접 만든 패키지가 많아 예시를 더 넣으면 플랜 한도를 넘어요. 패키지 화면에서 직접 고쳐 주세요.");
  }
  return { packages, options };
}
