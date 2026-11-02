import { describe, expect, it } from "vitest";

import { activeOptionCount, activePackageCount, composeJob, DEFAULT_BRIEF_QUESTIONS, PLAN_LIMITS } from "@/lib/domain";
import { createStarterState } from "./seed";
import {
  applyIndustryStarter,
  currentStarterIndustry,
  INDUSTRY_INTAKE_ITEMS,
  INDUSTRY_ORDER,
  INDUSTRY_STARTERS,
  isUntouchedStarterPackage,
  usesOnlyStarterPackages,
} from "./industry-starters";

const NOW = "2026-10-30T00:00:00.000Z";

function freshInput() {
  const state = createStarterState("2026-10-30");
  return { packages: state.packages, options: state.options, jobs: state.jobs, jobsCreatedTotal: state.jobsCreatedTotal };
}

describe("업종 예시 패키지", () => {
  it("새 작업공간은 웹 예시에서 시작하고 그 상태를 알아본다", () => {
    const input = freshInput();
    expect(currentStarterIndustry(input.packages)).toBe("web");
    expect(usesOnlyStarterPackages(input.packages)).toBe(true);
  });

  it.each(INDUSTRY_ORDER)("%s 예시는 무료 한도 안에 들어가고 그대로 일감을 만들 수 있다", (industry) => {
    const next = applyIndustryStarter(freshInput(), industry, PLAN_LIMITS.free, NOW);
    expect(activePackageCount(next.packages)).toBe(INDUSTRY_STARTERS[industry].packages.length);
    expect(activePackageCount(next.packages)).toBeLessThanOrEqual(PLAN_LIMITS.free.packages);
    expect(activeOptionCount(next.options)).toBeLessThanOrEqual(PLAN_LIMITS.free.options);
    expect(currentStarterIndustry(next.packages)).toBe(industry);
    for (const template of next.packages.filter((item) => !item.archivedAt)) {
      const job = composeJob({ clientLabel: "예시", startDate: "2026-10-30", package: template, now: NOW });
      expect(job.amount).toBe(template.price);
      expect(job.tasks.length).toBeGreaterThan(0);
    }
  });

  it("다른 업종을 고르면 손대지 않은 예시만 보관(삭제 아님)하고, 다시 고르면 돌아온다", () => {
    const toVideo = applyIndustryStarter(freshInput(), "video", PLAN_LIMITS.free, NOW);
    const webIds = INDUSTRY_STARTERS.web.packages.map((item) => item.id);
    for (const id of webIds) {
      const kept = toVideo.packages.find((item) => item.id === id);
      expect(kept).toBeDefined();
      expect(kept?.archivedAt).toBe(NOW);
    }
    const back = applyIndustryStarter({ ...freshInput(), ...toVideo }, "web", PLAN_LIMITS.free, NOW);
    expect(currentStarterIndustry(back.packages)).toBe("web");
    expect(back.packages.filter((item) => webIds.includes(item.id)).every((item) => !item.archivedAt)).toBe(true);
    // 영상 예시도 지우지 않고 보관만 한다.
    expect(back.packages.filter((item) => item.id.startsWith("pkg_starter_video")).every((item) => item.archivedAt)).toBe(true);
  });

  it("사용자가 고친 예시나 직접 만든 패키지는 건드리지 않는다", () => {
    const input = freshInput();
    const edited = { ...input.packages[0], price: 990_000 };
    const custom = { ...input.packages[1], id: "pkg_my_own", name: "내 패키지" };
    const packages = [edited, input.packages[1], custom];
    const next = applyIndustryStarter({ ...input, packages }, "photo", PLAN_LIMITS.free, NOW);
    expect(next.packages.find((item) => item.id === edited.id)).toEqual(edited);
    expect(next.packages.find((item) => item.id === custom.id)).toEqual(custom);
    expect(next.packages.find((item) => item.id === input.packages[1].id)?.archivedAt).toBe(NOW);
    expect(isUntouchedStarterPackage(edited)).toBe(false);
  });

  it("일감을 한 번이라도 만든 작업공간에서는 바꾸지 않는다", () => {
    const input = freshInput();
    expect(() => applyIndustryStarter({ ...input, jobsCreatedTotal: 1 }, "design", PLAN_LIMITS.free, NOW)).toThrow(/일감을 만든 뒤/);
    const job = composeJob({ clientLabel: "고객", startDate: "2026-10-30", package: input.packages[0], now: NOW });
    expect(() => applyIndustryStarter({ ...input, jobs: [job] }, "design", PLAN_LIMITS.free, NOW)).toThrow(/일감을 만든 뒤/);
  });

  it("직접 만든 패키지가 많아 한도를 넘으면 아무것도 바꾸지 않고 알린다", () => {
    const input = freshInput();
    const mine = [1, 2, 3].map((index) => ({ ...input.packages[0], id: `pkg_mine_${index}`, name: `내 패키지 ${index}` }));
    expect(() => applyIndustryStarter({ ...input, packages: [...input.packages, ...mine] }, "design", PLAN_LIMITS.free, NOW)).toThrow(/한도/);
  });

  it("서버를 거쳐 키 순서가 바뀌어도 손대지 않은 예시로 알아본다", () => {
    const original = INDUSTRY_STARTERS.design.packages[0];
    const reordered = Object.fromEntries(Object.entries(JSON.parse(JSON.stringify(original))).reverse()) as unknown as typeof original;
    expect(isUntouchedStarterPackage(reordered)).toBe(true);
  });

  it("모든 업종 예시 패키지는 업종별 받을 자료와 기본 질문 3개를 갖는다", () => {
    for (const industry of INDUSTRY_ORDER) {
      for (const item of INDUSTRY_STARTERS[industry].packages) {
        expect(item.intakeItems).toEqual(INDUSTRY_INTAKE_ITEMS[industry]);
        expect(item.briefQuestions).toEqual(DEFAULT_BRIEF_QUESTIONS);
      }
    }
    expect(INDUSTRY_INTAKE_ITEMS).toEqual({
      web: ["로고 파일(있으면)", "가게·회사 소개 글", "넣을 사진", "참고하고 싶은 사이트 주소"],
      design: ["가게·브랜드 이름(한글·영문)", "참고 이미지", "원하는 색이나 분위기"],
      video: ["원본 영상 파일", "넣을 자막·문구", "원하는 배경음악(있으면)"],
      photo: ["촬영 장소 주소", "촬영 날짜·시간 후보", "꼭 찍을 장면"],
    });
  });

  it("받을 자료·질문 기본값을 넣기 전에 저장된 예시도 손대지 않은 예시로 보고 업종을 바꿀 수 있다", () => {
    const input = freshInput();
    // 2026-11-02 전 저장본의 웹 예시에는 받을 자료·착수 질문 칸이 없다.
    const legacy = input.packages.map((item) => {
      const copy = { ...item };
      delete copy.intakeItems;
      delete copy.briefQuestions;
      return copy;
    });
    expect(currentStarterIndustry(legacy)).toBe("web");
    const next = applyIndustryStarter({ ...input, packages: legacy }, "design", PLAN_LIMITS.free, NOW);
    expect(activePackageCount(next.packages)).toBe(INDUSTRY_STARTERS.design.packages.length);
    expect(currentStarterIndustry(next.packages)).toBe("design");
  });

  it("예전 예시만 있는 빈 작업공간에서 같은 업종을 다시 고르면 새 기본값으로 바뀐다", () => {
    const input = freshInput();
    // 받을 자료·착수 질문이 없던 예전 웹 예시 3개만 있고 일감은 0건이다.
    const legacy = input.packages.map((item) => {
      const copy = { ...item };
      delete copy.intakeItems;
      delete copy.briefQuestions;
      return copy;
    });
    const next = applyIndustryStarter({ ...input, packages: legacy }, "web", PLAN_LIMITS.free, NOW);
    const live = next.packages.filter((item) => !item.archivedAt);
    expect(live).toHaveLength(INDUSTRY_STARTERS.web.packages.length);
    for (const item of live) {
      expect(item.intakeItems).toEqual(INDUSTRY_INTAKE_ITEMS.web);
      expect(item.briefQuestions).toEqual(DEFAULT_BRIEF_QUESTIONS);
    }

    // 사용자가 고친 예전 예시는 같은 업종을 골라도 그대로 둔다.
    const edited = { ...legacy[0], price: 990_000 };
    const kept = applyIndustryStarter({ ...input, packages: [edited, ...legacy.slice(1)] }, "web", PLAN_LIMITS.free, NOW);
    expect(kept.packages.find((item) => item.id === edited.id)).toEqual(edited);
  });

  it("업종 예시의 패키지·옵션 id는 서로 겹치지 않는다", () => {
    const packageIds = Object.values(INDUSTRY_STARTERS).flatMap((starter) => starter.packages.map((item) => item.id));
    const optionIds = Object.values(INDUSTRY_STARTERS).flatMap((starter) => starter.options.map((item) => item.id));
    expect(new Set(packageIds).size).toBe(packageIds.length);
    expect(new Set(optionIds).size).toBe(optionIds.length);
  });
});
