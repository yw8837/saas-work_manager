import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PLAN_LIMITS } from "@/lib/domain";
import { MarketingHome } from "./marketing-home";
import { GUIDE_STEPS, UserGuide } from "./user-guide";

describe("랜딩 히어로", () => {
  it("첫 문구는 포함 수정 횟수와 처리 기록을 앞세운다(3줄 구조 유지)", () => {
    render(<MarketingHome />);
    const title = screen.getByTestId("landing-hero-title");
    const lines = [...title.querySelectorAll(".heroLine")].map((line) => line.textContent);
    expect(lines).toEqual(["수정 몇 번까지였는지,", "다시 찾지", "않아도 돼요."]);
    expect(title.querySelectorAll(".heroAccent")).toHaveLength(2);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("수정 몇 번까지였는지, 다시 찾지 않아도 돼요.");
    expect(screen.getByTestId("landing-hero-lead")).toHaveTextContent(
      "고객·시작일·패키지만 고르면 금액·마감·포함 수정 횟수가 정해져요. 고객 수정 요청은 링크로 모이고, 수정 완료를 누를 때마다 몇 번째인지 남아요.",
    );
    // 예전 문구가 남아 있지 않다.
    expect(document.body.textContent).not.toContain("운영까지 혼자 할");
  });

  it("보조 버튼은 가입 없이 고객 화면 체험으로 간다", () => {
    render(<MarketingHome />);
    const demo = screen.getByTestId("landing-customer-demo");
    expect(demo).toHaveAttribute("href", "/demo/r");
    expect(demo).toHaveTextContent("가입 없이 고객 화면 체험");
    expect(demo.closest(".heroActions")).not.toBeNull();
  });

  it("CTA 아래 안심 줄은 사실만, 무료 한도는 플랜 값 그대로", () => {
    render(<MarketingHome />);
    const reassure = screen.getByRole("list", { name: "시작 조건" });
    const items = within(reassure).getAllByRole("listitem").map((item) => item.textContent?.trim());
    expect(items).toEqual([
      "Google 계정으로 가입",
      "카드 등록 없음",
      `무료로 동시 ${PLAN_LIMITS.free.activeJobs}건 · 누적 ${PLAN_LIMITS.free.totalJobs}건`,
    ]);
  });
});

describe("랜딩 문구는 지금 동작(수정 완료 때 차감·직접 등록)과 아직 안 되는 것을 섞지 않는다", () => {
  it("수정 구획과 FAQ는 '확인 대기 → 수정 완료 때 1회'로 말하고, 고객 확인 뒤 차감은 준비 전이라고 밝힌다", () => {
    render(<MarketingHome />);
    const revision = document.getElementById("revision");
    // 지금 규칙: 접수는 확인 대기, 작업자가 '수정 완료'를 누를 때 1회(engine.ts completeRevision).
    expect(revision).toHaveTextContent("먼저 확인 대기로 들어오고, 작업자가 수정을 마치면 그때 1회로 세요.");
    expect(revision).toHaveTextContent("링크 요청은 확인 대기로 접수");
    expect(revision).toHaveTextContent("‘수정 완료’를 누를 때 1회 차감");
    expect(revision).toHaveTextContent("질문·중복은 반려, 횟수를 쓰지 않음");
    expect(revision).toHaveTextContent("남은 수정을 다 쓰면 추가 작업으로 분리");
    expect(screen.getByTestId("landing-revision-note")).toHaveTextContent("고객이 결과를 확인한 뒤에 차감하는 방식은 아직 준비 전이에요.");
    const faq = document.getElementById("faq");
    expect(faq).toHaveTextContent("먼저 확인 대기로 쌓이고, 작업자가 고친 뒤 ‘수정 완료’를 누를 때 1회 차감돼요.");
    expect(faq).toHaveTextContent("질문이나 중복은 반려하면 횟수를 쓰지 않고");
    // 예전 표현: 주문이 저절로 들어오거나, 접수만으로 차감되거나, 되돌리면 횟수가 반드시 늘어난다고 읽힐 수 있는 문장.
    expect(document.body.textContent).not.toContain("주문이 들어오면");
    expect(document.body.textContent).not.toContain("다시 옮겨 적지 않고");
    expect(document.body.textContent).not.toContain("자동으로 1회 차감");
    expect(document.body.textContent).not.toContain("접수되는 즉시");
    expect(document.body.textContent).not.toContain("접수 즉시");
    expect(document.body.textContent).not.toContain("횟수 복구");
  });

  it("주문은 직접 등록하고 플랫폼 메시지를 가져오지 않으며, 플랫폼 안 거래의 외부 링크는 규정 확인을 먼저 권한다", () => {
    render(<MarketingHome />);
    const faq = document.getElementById("faq");
    expect(faq).toHaveTextContent("받은 주문을 직접 등록한 뒤");
    expect(faq).toHaveTextContent("플랫폼의 주문이나 메시지를 자동으로 가져오지는 않아요.");
    expect(faq).toHaveTextContent("외부 링크를 보내도 되는지 그 플랫폼 규정을 먼저 확인해 주세요.");
  });

  it("'지금 되는 것과 아직 안 되는 것' FAQ가 두 묶음을 나눠 보여 준다", () => {
    render(<MarketingHome />);
    const item = screen.getByTestId("faq-now-and-not-yet");
    const [now, notYet] = Array.from(item.querySelectorAll("p"));
    expect(now).toHaveTextContent(/^지금 돼요\./);
    expect(now).toHaveTextContent("‘수정 완료’ 기준 횟수 차감");
    expect(now).toHaveTextContent("시작 전 받을 자료 목록");
    expect(notYet).toHaveTextContent(/^아직 안 돼요\./);
    for (const planned of ["자동 수집", "자동 답장", "고객 확인과 연결된 차감", "웹에서 새 요청 알림", "결제"]) {
      expect(notYet).toHaveTextContent(planned);
      expect(now).not.toHaveTextContent(planned);
    }
  });
});

describe("그림 사용설명서(한 장씩 보기)", () => {
  beforeEach(() => window.history.replaceState(null, "", "/guide"));
  afterEach(() => window.history.replaceState(null, "", "/guide"));

  /** 첫 단계부터 '다음'을 눌러 가며 단계마다 fn을 부른다. */
  const walk = (fn: (index: number) => void) => {
    render(<UserGuide />);
    GUIDE_STEPS.forEach((_, index) => {
      fn(index);
      if (index < GUIDE_STEPS.length - 1) fireEvent.click(screen.getByTestId("guide-next"));
    });
  };

  it("무기 3개 순서의 장 4개(장마다 그림 2장)가 가입 그림 뒤에 이어진다", () => {
    const chapters = GUIDE_STEPS.filter((step) => step.chapter).map((step) => step.chapter);
    expect(chapters).toEqual(["주문 30초 등록", "주문 30초 등록", "시작 안내 한 방", "시작 안내 한 방", "수정 범위 정리", "수정 범위 정리", "더 편하게", "더 편하게"]);
    expect(GUIDE_STEPS.filter((step) => step.image)).toHaveLength(9);
  });

  it("단계마다 그림(또는 흐름도)은 하나, 설명(alt)이 있고 '로그'를 쓰지 않는다", () => {
    walk((index) => {
      const stage = screen.getByTestId("guide-step");
      const images = stage.querySelectorAll("img");
      const step = GUIDE_STEPS[index];
      if (step.image) {
        expect(images).toHaveLength(1);
        expect(images[0].getAttribute("alt")?.trim()).toBeTruthy();
        expect(images[0].alt).not.toMatch(/로그(?!인|아웃)/);
      } else {
        expect(images).toHaveLength(0);
        expect(within(stage).getByTestId("work-flow-chart")).toBeInTheDocument();
      }
    });
  });

  it("제목 → 설명 → 그림 순서, 긴 글은 '자세히' 접기에만", () => {
    walk((index) => {
      const step = GUIDE_STEPS[index];
      const stage = screen.getByTestId("guide-step");
      expect(screen.getByTestId("guide-step-title")).toHaveTextContent(step.title);
      expect(stage.querySelector(".guideStageCaption")).toHaveTextContent(step.caption);
      const title = screen.getByTestId("guide-step-title");
      const media = stage.querySelector("img, [data-testid=work-flow-chart]")!;
      expect(title.compareDocumentPosition(media) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      const details = stage.querySelector("details");
      if (step.detail) {
        expect(details?.querySelector("summary")).toHaveTextContent("자세히");
        expect(details).toHaveTextContent(step.detail);
      } else {
        expect(details).toBeNull();
      }
    });
  });

  it("'자세히' 접기는 보이는 글은 그대로 두고, 낭독기에는 단계 제목을 붙여 읽힌다", () => {
    const withDetail = GUIDE_STEPS.filter((step) => step.detail);
    expect(withDetail).toHaveLength(7);
    expect(new Set(withDetail.map((step) => step.title)).size).toBe(withDetail.length);
    walk((index) => {
      const step = GUIDE_STEPS[index];
      const summary = screen.getByTestId("guide-step").querySelector(".guideDetail summary");
      if (!step.detail) return;
      expect(summary?.querySelector(".srOnly")).toHaveTextContent(step.title);
      const visible = summary!.cloneNode(true) as HTMLElement;
      visible.querySelectorAll(".srOnly").forEach((node) => node.remove());
      expect(visible.textContent?.trim()).toBe("자세히");
      expect(summary).toHaveAccessibleName(`자세히, ${step.title}`);
    });
  });

  it("설명서 글(단계 전부 더한 것)은 예전(1,094자)보다 짧다", () => {
    let total = 0;
    walk((index) => {
      if (index === 0) {
        // 머리·진행 표시·바닥글은 한 번만 센다(낭독 알림·단계 구획은 뺀다).
        const chrome = document.body.cloneNode(true) as HTMLElement;
        chrome.querySelectorAll('.srOnly, [data-testid="guide-step"]').forEach((node) => node.remove());
        total += (chrome.textContent ?? "").replace(/\s+/g, " ").trim().length;
      }
      // 화면에 보이는 단계 글만 센다. 낭독기 전용 숨김 글과 흐름도(따로 450자 아래로 묶음)는 뺀다.
      const shown = screen.getByTestId("guide-step").cloneNode(true) as HTMLElement;
      shown.querySelectorAll(".srOnly").forEach((node) => node.remove());
      const chart = shown.querySelector('[data-testid="work-flow-chart"]');
      if (chart) {
        expect((chart.textContent ?? "").replace(/\s+/g, " ").trim().length).toBeLessThan(450);
        chart.remove();
      }
      total += (shown.textContent ?? "").replace(/\s+/g, " ").trim().length;
    });
    expect(total).toBeLessThan(1094);
  });

  it("시작 안내 단계는 링크 없이 답해도 된다고, 수정 범위 단계는 확인 대기 → 수정 완료 때 1회를, 마지막은 아직 안 되는 것을 알려 준다", () => {
    const text = (id: string) => {
      const step = GUIDE_STEPS.find((item) => item.id === id)!;
      return [step.title, step.caption, step.detail ?? ""].join(" ");
    };
    expect(text("check-answers")).toContain("고객은 링크 없이 대화창으로 답해도 돼요");
    expect(text("send-message")).toContain("자동으로 보내지지는 않아요");
    expect(text("revisions")).toContain("요청은 확인 대기로 들어와요");
    expect(text("revisions")).toContain("고친 뒤 '수정 완료'를 누를 때 1회를 써요");
    expect(text("revisions")).toContain("질문·중복은 '반려', 범위 밖은 '추가 작업으로'를 눌러요. 둘 다 횟수를 안 써요.");
    expect(text("monthly")).toContain("세금 계산이나 신고는 하지 않아요");
    for (const step of GUIDE_STEPS) expect(text(step.id)).not.toContain("접수되는 즉시");
    window.history.replaceState(null, "", `/guide#step-${GUIDE_STEPS.length}`);
    render(<UserGuide />);
    const notYet = screen.getByTestId("guide-not-yet");
    expect(within(notYet).getByRole("heading", { name: "아직 안 되는 것" })).toBeInTheDocument();
    expect(notYet).toHaveTextContent("자동으로 가져오지 않아요");
    expect(notYet).toHaveTextContent("고객이 결과를 확인한 뒤에 차감하는 방식과 웹에서 새 요청 알림도 아직 준비 전이에요");
  });
});
