import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BETA_GRANT_DAYS, PLAN_LIMITS, PLAN_PRICES } from "@/lib/domain";
import { signupStartHref } from "@/lib/signup-start";
import { isStandaloneRoutePath } from "@/lib/standalone-routes";
import { INDUSTRY_LABELS, INDUSTRY_ORDER, INDUSTRY_STARTERS } from "@/lib/store/industry-starters";
import { IndustryExamples, INDUSTRY_PAGE_LEAD } from "./industry-examples";
import { MarketingHome } from "./marketing-home";

describe("소개 화면: 업종 카드", () => {
  it("업종 네 개가 각자 전용 페이지로 가고, 카드에는 그 업종 예시 패키지 이름이 그대로 보인다", () => {
    render(<MarketingHome />);
    for (const industry of INDUSTRY_ORDER) {
      const card = screen.getByTestId(`landing-industry-${industry}`);
      expect(card).toHaveAttribute("href", `/examples/${industry}`);
      // 화면 읽기 프로그램에는 업종 이름만 링크 이름으로 읽힌다.
      expect(card).toHaveAccessibleName(`${INDUSTRY_LABELS[industry]} 예시 보기`);
      expect(card).toHaveTextContent(INDUSTRY_LABELS[industry]);
      for (const item of INDUSTRY_STARTERS[industry].packages) expect(card).toHaveTextContent(item.name);
    }
  });
});

describe("소개 화면: 요금 표", () => {
  it("세 요금제의 금액과 한도를 entitlements 값 그대로 보여 준다", () => {
    render(<MarketingHome />);
    const free = screen.getByTestId("landing-plan-free");
    expect(free).toHaveTextContent("0원");
    expect(free).toHaveTextContent(`동시 진행${PLAN_LIMITS.free.activeJobs}건`);
    expect(free).toHaveTextContent(`누적 일감${PLAN_LIMITS.free.totalJobs}건`);
    expect(free).toHaveTextContent(`패키지${PLAN_LIMITS.free.packages}개`);
    expect(free).toHaveTextContent(`옵션${PLAN_LIMITS.free.options}개`);
    const basic = screen.getByTestId("landing-plan-basic");
    expect(basic).toHaveTextContent(PLAN_PRICES.basic.label);
    expect(basic).toHaveTextContent(`동시 진행${PLAN_LIMITS.basic.activeJobs}건`);
    expect(basic).toHaveTextContent("누적 일감무제한");
    const pro = screen.getByTestId("landing-plan-pro");
    expect(pro).toHaveTextContent(PLAN_PRICES.pro.label);
    expect(pro).toHaveTextContent("동시 진행무제한");
  });

  it("결제가 아직 없다는 사실과 베타 기간을 표 아래에 적는다", () => {
    render(<MarketingHome />);
    const note = screen.getByTestId("landing-pricing-note");
    expect(note).toHaveTextContent("결제는 아직 준비 중이라 지금은 어떤 금액도 청구되지 않아요.");
    expect(note).toHaveTextContent(`Pro를 ${BETA_GRANT_DAYS}일 동안 무료로 써요(계정당 한 번).`);
    // 히어로가 이미 말한 카드 등록 얘기를 여기서 되풀이하지 않는다.
    expect(note).not.toHaveTextContent("카드");
  });
});

describe("소개 화면: 맨 아래 세 칸", () => {
  it("둘러보기, 세팅 신청(메일), 사용설명서로 간다", () => {
    render(<MarketingHome />);
    expect(screen.getByTestId("landing-help-try")).toHaveAttribute("href", "/try");
    expect(screen.getByTestId("landing-help-guide")).toHaveAttribute("href", "/guide");
    const setup = screen.getByTestId("landing-setup-help");
    // 세 칸 중 세팅 신청이 맨 앞이다(먼저 할 일 하나를 앞세운다).
    expect(setup.parentElement?.firstElementChild).toBe(setup);
    expect(setup).toHaveTextContent("쓰던 견적서나 패키지 표를 보내 주시면 운영자가 패키지로 넣어 드려요");
    expect(within(setup).getByRole("link", { name: "메일로 세팅 신청하기" }).getAttribute("href")).toMatch(/^mailto:\S+@\S+\?subject=/);
    // 재 본 적 없는 시간 숫자는 쓰지 않는다.
    expect(setup.textContent).not.toMatch(/\d+\s*(분|초)/);
  });
});

describe("업종 전용 예시 페이지", () => {
  it.each(INDUSTRY_ORDER)("/examples/%s 는 그 업종만 보여 주고, 작업공간 없이 그리는 공개 경로다", (industry) => {
    expect(isStandaloneRoutePath(`/examples/${industry}`)).toBe(true);
    render(<IndustryExamples only={industry} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(`${INDUSTRY_LABELS[industry]} 예시 패키지`);
    expect(screen.getByTestId("examples-lead")).toHaveTextContent(INDUSTRY_PAGE_LEAD[industry]);
    for (const other of INDUSTRY_ORDER) {
      if (other === industry) expect(screen.getByTestId(`examples-${other}`)).toBeInTheDocument();
      else expect(screen.queryByTestId(`examples-${other}`)).not.toBeInTheDocument();
    }
    const nav = screen.getByTestId("examples-other-industries");
    expect(within(nav).getByRole("link", { name: INDUSTRY_LABELS[industry] })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "전체 보기" })).toHaveAttribute("href", "/examples");
    // 머리글 시작 버튼도 이 업종 예시로 시작한다.
    expect(screen.getByTestId("examples-header-start")).toHaveAttribute("href", signupStartHref(industry));
    // 예시를 본 뒤 세팅 신청으로 이어진다.
    expect(within(screen.getByTestId("examples-setup-help")).getByRole("link", { name: "메일로 세팅 신청하기" })).toBeInTheDocument();
  });

  it("전체 예시 페이지는 그대로 네 업종을 다 보여 준다", () => {
    render(<IndustryExamples />);
    for (const industry of INDUSTRY_ORDER) expect(screen.getByTestId(`examples-${industry}`)).toBeInTheDocument();
    expect(screen.queryByTestId("examples-other-industries")).not.toBeInTheDocument();
  });
});
