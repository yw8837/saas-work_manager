import { cleanup, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { DemoState, GuideDemoSpec } from "./guide-demo";
import { GUIDE_DEMOS } from "./guide-demo-screens";
import { GUIDE_STEPS } from "./user-guide";

/** 재 본 적 없는 시간 숫자. '초안'(추가요청 초안)은 시간이 아니다. */
const TIME_NUMBER = /\d+\s*(초(?!안)|분)/;

/** 장면 i를 누르기 전(겨누는 동안) 화면 값. */
const before = (spec: GuideDemoSpec, index: number): DemoState => (index === 0 ? spec.initial : spec.scenes[index - 1].state);

function renderScreen(spec: GuideDemoSpec, state: DemoState, hit?: string) {
  const { Screen } = spec;
  return render(<Screen state={state} hit={hit} />);
}

describe("설명서 단계별 시연 데이터", () => {
  it("10단계 모두 시연이 있고, 장면은 2~4개이며 자막이 비어 있지 않고 서로 다르다", () => {
    expect(GUIDE_STEPS).toHaveLength(10);
    for (const step of GUIDE_STEPS) {
      expect(step.demo, step.id).toBe(GUIDE_DEMOS[step.id as keyof typeof GUIDE_DEMOS]);
      const captions = step.demo.scenes.map((scene) => scene.caption.trim());
      expect(captions.length, step.id).toBeGreaterThanOrEqual(2);
      expect(captions.length, step.id).toBeLessThanOrEqual(4);
      for (const text of captions) {
        expect(text, step.id).not.toBe("");
        // 휴대폰에서 두 줄 안에 읽히게 짧게 둔다.
        expect(text.length, text).toBeLessThanOrEqual(40);
      }
      expect(new Set(captions).size, step.id).toBe(captions.length);
    }
  });

  it("흐름도 단계만 글이 그대로 읽히는 모형이고, 나머지 9단계 모형에는 그림 설명(alt)이 있으며 '로그'를 쓰지 않는다", () => {
    expect(GUIDE_STEPS[0].demo.alt).toBeUndefined();
    for (const step of GUIDE_STEPS.slice(1)) {
      expect(step.demo.alt?.trim(), step.id).toBeTruthy();
      expect(step.demo.alt, step.id).not.toMatch(/로그(?!인|아웃)/);
    }
  });

  it("손가락이 누를 곳은 누르기 전 화면에 실제로 있다(없는 버튼을 누르는 장면이 없다)", () => {
    for (const step of GUIDE_STEPS) {
      step.demo.scenes.forEach((scene, index) => {
        if (!scene.target) return;
        const { container } = renderScreen(step.demo, before(step.demo, index), scene.target);
        const element = container.querySelector(`[data-demo-target="${scene.target}"]`);
        expect(element, `${step.id} ${index + 1}번째 장면 ${scene.target}`).not.toBeNull();
        expect(element).toHaveAttribute("data-hit");
        cleanup();
      });
    }
  });

  it("자막·그림 설명·모형 글 어디에도 '몇 초·몇 분' 같은 시간 숫자가 없다", () => {
    expect(TIME_NUMBER.test("30초")).toBe(true);
    expect(TIME_NUMBER.test("1분")).toBe(true);
    expect(TIME_NUMBER.test("2초안")).toBe(false);
    for (const step of GUIDE_STEPS) {
      for (const scene of step.demo.scenes) expect(scene.caption).not.toMatch(TIME_NUMBER);
      expect(step.demo.alt ?? "").not.toMatch(TIME_NUMBER);
      for (const state of [step.demo.initial, ...step.demo.scenes.map((scene) => scene.state)]) {
        const { container } = renderScreen(step.demo, state);
        expect(container.textContent, step.id).not.toMatch(TIME_NUMBER);
        cleanup();
      }
    }
  });
});

describe("시연이 실제 제품 동작과 같다", () => {
  const revisions = GUIDE_DEMOS.revisions;
  const remainingAt = (state: DemoState) => {
    renderScreen(revisions, state);
    const value = screen.getByTestId("gd-remaining").textContent;
    cleanup();
    return value;
  };

  it("고객이 링크에 요청을 남기기만 하면 남은 수정은 3회 그대로이고, 작업자 화면에는 '확인 대기'로 들어온다", () => {
    expect(remainingAt(revisions.initial)).toBe("3");
    const [sent, waiting] = revisions.scenes;
    expect(sent.caption).toContain("가입 없이");
    expect(remainingAt(sent.state)).toBe("3");
    expect(remainingAt(waiting.state)).toBe("3");
    renderScreen(revisions, waiting.state);
    expect(screen.getByTestId("gd-first-badge")).toHaveTextContent("확인 대기");
    cleanup();
  });

  it("작업자가 고친 뒤 '수정 완료'를 눌러야 3회에서 2회로 줄고 1회차가 되며, 질문을 반려하면 2회 그대로다", () => {
    const [, , done, rejected] = revisions.scenes;
    expect(done.target).toBe("done");
    expect(done.caption).toContain("3회에서 2회");
    expect(remainingAt(done.state)).toBe("2");
    renderScreen(revisions, done.state);
    expect(screen.getByTestId("gd-first-badge")).toHaveTextContent("1회차");
    cleanup();
    expect(rejected.target).toBe("reject");
    expect(remainingAt(rejected.state)).toBe("2");
    renderScreen(revisions, rejected.state);
    expect(screen.getByTestId("gd-second-badge")).toHaveTextContent("반려");
    cleanup();
    // '수정 완료'를 누르는 장면 말고는 줄어드는 장면이 없다.
    const drops = revisions.scenes.filter((scene, index) => remainingAt(scene.state) !== remainingAt(before(revisions, index)));
    expect(drops).toEqual([done]);
  });

  it("카톡 문구는 저절로 가지 않는다: 복사 → 대화창에 붙여 넣기 → 내가 보내기를 눌러야 대화창에 보인다", () => {
    const send = GUIDE_DEMOS["send-message"];
    const sentScenes = send.scenes.filter((scene) => scene.state.sent);
    expect(sentScenes).toHaveLength(1);
    expect(sentScenes[0].target).toBe("chat-send");
    expect(sentScenes[0].caption).toContain("자동으로 보내지지 않아요");
    expect(send.scenes[0].target).toBe("copy");
  });

  it("추가요청은 초안일 때 합계가 그대로이고, 고객 동의 뒤 '확정'을 눌러야 금액·마감·할 일이 바뀐다", () => {
    const addon = GUIDE_DEMOS.addon;
    const [draft, agreed, confirmed] = addon.scenes;
    const strip = (state: DemoState) => {
      const { container } = renderScreen(addon, state);
      const text = container.querySelector(".gdJobStrip > span")?.textContent?.replace(/\s+/g, " ").trim();
      cleanup();
      return text;
    };
    expect(strip(addon.initial)).toBe("300,000원 · 11월 7일 마감 · 할 일 5개");
    expect(strip(draft.state)).toBe(strip(addon.initial));
    expect(strip(agreed.state)).toBe(strip(addon.initial));
    expect(agreed.caption).toContain("동의");
    expect(confirmed.target).toBe("confirm");
    // sample-order.ts의 명함 디자인 추가: +80,000원 · +2일 · 할 일 1개.
    expect(strip(confirmed.state)).toBe("380,000원 · 11월 9일 마감 · 할 일 6개");
  });

  it("새 일감의 금액·마감은 예시 패키지·옵션 값으로 계산된다(STANDARD 7일, 원본 파일 +1일)", () => {
    const newJob = GUIDE_DEMOS["new-job"];
    const bar = (state: DemoState) => {
      const { container } = renderScreen(newJob, state);
      const text = container.querySelector(".gdDarkBar")?.textContent?.replace(/\s+/g, " ").trim();
      cleanup();
      return text;
    };
    expect(bar(newJob.initial)).toContain("패키지를 골라주세요");
    expect(bar(newJob.scenes[1].state)).toContain("250,000원 · 할 일 4개11월 6일 마감 · 수정 3회");
    expect(bar(newJob.scenes[2].state)).toContain("300,000원 · 할 일 5개11월 7일 마감 · 수정 3회");
  });

  it("플랫폼·메신저와 연동되는 것처럼 보이지 않는다(가져오기·자동 전송·연동 문구 없음)", () => {
    for (const step of GUIDE_STEPS) {
      for (const state of [step.demo.initial, ...step.demo.scenes.map((scene) => scene.state)]) {
        const { container } = renderScreen(step.demo, state);
        expect(container.textContent, step.id).not.toMatch(/연동|자동으로 가져|자동 전송|자동으로 보냈/);
        cleanup();
      }
      for (const scene of step.demo.scenes) expect(scene.caption).not.toMatch(/연동|자동으로 가져|자동으로 보내져요/);
    }
  });
});
