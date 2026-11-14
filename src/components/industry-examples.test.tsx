import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BETA_OFFER_TEXT, FREE_PLAN_TEXT, SIGNUP_START_HREF, signupStartHref } from "@/lib/signup-start";
import { isStandaloneRoutePath } from "@/lib/standalone-routes";
import { INDUSTRY_LABELS, INDUSTRY_ORDER, INDUSTRY_STARTERS } from "@/lib/store/industry-starters";
import { IndustryExamples } from "./industry-examples";
import { MarketingHome } from "./marketing-home";
import { UserGuide } from "./user-guide";

const won = (value: number) => `${new Intl.NumberFormat("ko-KR").format(value)}원`;

describe("업종별 예시 패키지 공개 페이지", () => {
  it("로그인 없이 그린다: 작업공간 경계 밖이고, useWorkspace 없이 렌더된다", () => {
    expect(isStandaloneRoutePath("/examples")).toBe(true);
    render(<IndustryExamples />);
    expect(screen.getByRole("heading", { level: 1, name: "업종별 예시 패키지" })).toBeInTheDocument();
    // 같은 머리글·바닥글
    expect(document.querySelector(".guidePage .guideHeader")).not.toBeNull();
    expect(document.querySelector(".guidePage .guideFooter")).not.toBeNull();
    expect(screen.getByRole("link", { name: "개인정보처리방침" })).toHaveAttribute("href", "/privacy");
  });

  it("예시 금액·횟수가 평균이 아니라고 분명히 말한다", () => {
    render(<IndustryExamples />);
    expect(screen.getByTestId("examples-notice")).toHaveTextContent("금액과 횟수는 예시예요. 업계 평균이 아니에요. 가입 뒤 패키지 화면에서 고쳐 써요.");
  });

  it("업종 순서와 이름은 INDUSTRY_ORDER·INDUSTRY_LABELS 그대로다", () => {
    render(<IndustryExamples />);
    const headings = screen.getAllByRole("heading", { level: 2 }).map((item) => item.textContent);
    expect(headings).toEqual(INDUSTRY_ORDER.map((industry) => INDUSTRY_LABELS[industry]));
  });

  it.each(INDUSTRY_ORDER)("%s: 패키지 이름·설명·금액·기간·포함 수정·받을 자료가 INDUSTRY_STARTERS와 같다", (industry) => {
    render(<IndustryExamples />);
    const section = screen.getByTestId(`examples-${industry}`);
    const { packages } = INDUSTRY_STARTERS[industry];
    expect(within(section).getAllByTestId(/^examples-package-/)).toHaveLength(packages.length);
    for (const item of packages) {
      const card = within(section).getByTestId(`examples-package-${item.id}`);
      expect(within(card).getByRole("heading", { level: 3, name: item.name })).toBeInTheDocument();
      expect(card).toHaveTextContent(item.description ?? "");
      expect(card).toHaveTextContent(won(item.price));
      expect(card).toHaveTextContent(`기간${item.durationDays}일`);
      expect(card).toHaveTextContent(`포함 수정${item.revisionLimit}회`);
      const intake = within(card).getAllByRole("listitem").map((row) => row.textContent);
      expect(intake).toEqual(item.intakeItems);
    }
  });

  it.each(INDUSTRY_ORDER)("%s: 옵션 묶음이 INDUSTRY_STARTERS와 같다(이름·+금액·+기간)", (industry) => {
    render(<IndustryExamples />);
    const group = screen.getByTestId(`examples-options-${industry}`);
    expect(within(group).getByRole("heading", { level: 3, name: "범위 밖·추가 작업은 이렇게 더해요" })).toBeInTheDocument();
    const rows = within(group).getAllByRole("listitem");
    const options = INDUSTRY_STARTERS[industry].options.filter((option) => option.priceDelta !== 0 || option.durationDaysDelta !== 0 || option.revisionLimitDelta !== 0);
    expect(rows).toHaveLength(options.length);
    options.forEach((option, index) => {
      expect(rows[index]).toHaveTextContent(option.name);
      expect(rows[index]).toHaveTextContent(option.priceDelta === 0 ? "금액 그대로" : `+${won(option.priceDelta)}`);
      expect(rows[index]).toHaveTextContent(option.durationDaysDelta === 0 ? "기간 그대로" : `+${option.durationDaysDelta}일`);
    });
  });

  it("금액·기간·수정 횟수 중 더해지는 게 없는 옵션은 '범위 밖·추가 작업' 묶음에 안 보인다", () => {
    render(<IndustryExamples />);
    const group = screen.getByTestId("examples-options-web");
    expect(within(group).queryByText("고객 디자인 제공")).not.toBeInTheDocument();
    expect(within(group).getByText("문구 정리")).toBeInTheDocument();
  });

  it("화면의 원 단위 숫자는 모두 INDUSTRY_STARTERS에 있는 값이다(새 숫자·평균 없음)", () => {
    render(<IndustryExamples />);
    const allowed = new Set(INDUSTRY_ORDER.flatMap((industry) => [
      ...INDUSTRY_STARTERS[industry].packages.map((item) => won(item.price)),
      ...INDUSTRY_STARTERS[industry].options.map((item) => won(item.priceDelta)),
    ]));
    const shown = document.body.textContent?.match(/[\d,]+원/g) ?? [];
    expect(shown.length).toBeGreaterThan(0);
    for (const value of shown) expect(allowed.has(value)).toBe(true);
    expect(document.body.textContent).not.toMatch(/평균 [\d,]|시세/);
  });

  it.each(INDUSTRY_ORDER)("%s: '이 예시로 시작하기' 버튼은 업종과 베타 코드를 붙여(/today?starter=<업종>&invite=BETA2026) 간다", (industry) => {
    render(<IndustryExamples />);
    const link = screen.getByTestId(`examples-start-${industry}`);
    expect(link).toHaveAttribute("href", `/today?starter=${industry}&invite=BETA2026`);
    expect(link).toHaveAttribute("href", signupStartHref(industry));
    expect(link).toHaveTextContent("이 예시로 시작하기");
    // 버튼 이름이 넷 다 같으면 화면 읽기에서 구분이 안 된다.
    expect(link).toHaveAccessibleName(new RegExp(INDUSTRY_LABELS[industry]));
    // 버튼 바로 아래에 베타 코드·무료 범위 안내
    const offer = within(screen.getByTestId(`examples-${industry}`)).getByTestId(`examples-offer-${industry}`);
    expect(offer).toHaveTextContent(BETA_OFFER_TEXT);
    expect(offer).toHaveTextContent(FREE_PLAN_TEXT);
    expect(link.compareDocumentPosition(offer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each(INDUSTRY_ORDER)("%s: 블로그 글의 옛 구역 주소(#examples-<업종>)도 그 구역 맨 위로 이어지고, 기존 id·testid는 그대로다", (industry) => {
    render(<IndustryExamples />);
    const section = screen.getByTestId(`examples-${industry}`);
    expect(section).toHaveAttribute("id", industry);
    const anchor = document.getElementById(`examples-${industry}`);
    expect(anchor).not.toBeNull();
    expect(anchor).toBe(within(section).getByTestId(`examples-anchor-${industry}`));
    // 구역 첫 요소라 제목보다 위에 닿는다.
    expect(section.firstElementChild).toBe(anchor);
    expect(document.getElementById(`examples-${industry}-title`)).toHaveTextContent(INDUSTRY_LABELS[industry]);
    // 같은 id가 두 번 생기지 않는다.
    expect(document.querySelectorAll(`[id="examples-${industry}"]`)).toHaveLength(1);
  });

  it("머리글에 '무료로 시작하기'(베타 코드 주소)·'로그인'(글자 링크), 위쪽 안내 근처에 베타 코드 안내와 '가입 없이 둘러보기'가 있다", () => {
    render(<IndustryExamples />);
    const nav = screen.getByRole("navigation", { name: "예시 페이지 메뉴" });
    expect(within(nav).getByTestId("examples-header-start")).toHaveAttribute("href", SIGNUP_START_HREF);
    // 설명서 머리글과 같은 연한 파랑 버튼
    expect(within(nav).getByTestId("examples-header-start")).toHaveClass("guideHeaderStart");
    expect(within(nav).getByTestId("examples-header-login")).toHaveAttribute("href", "/today");
    expect(within(nav).getByTestId("examples-header-login")).toHaveTextContent("로그인");
    const offer = screen.getByTestId("examples-offer");
    expect(offer).toHaveTextContent(BETA_OFFER_TEXT);
    expect(offer).toHaveTextContent(FREE_PLAN_TEXT);
    const tryLink = screen.getByTestId("examples-try");
    expect(tryLink).toHaveTextContent("가입 없이 둘러보기");
    expect(tryLink).toHaveAttribute("href", "/try");
    // 첫 업종 구역보다 위에 있다.
    const first = screen.getByTestId(`examples-${INDUSTRY_ORDER[0]}`);
    for (const element of [offer, tryLink]) expect(element.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("업종 바로 가기는 각 구획으로 간다", () => {
    render(<IndustryExamples />);
    const nav = screen.getByRole("navigation", { name: "업종 바로 가기" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(INDUSTRY_ORDER.map((industry) => `#${industry}`));
    for (const industry of INDUSTRY_ORDER) expect(document.getElementById(industry)).not.toBeNull();
  });
});

describe("/examples로 가는 길", () => {
  it("첫 화면에 링크 1곳", () => {
    render(<MarketingHome />);
    expect(screen.getByTestId("landing-examples")).toHaveAttribute("href", "/examples");
    expect(document.querySelectorAll('a[href="/examples"]')).toHaveLength(1);
  });

  it("사용설명서에 링크 1곳", () => {
    render(<UserGuide />);
    expect(screen.getByTestId("guide-examples")).toHaveAttribute("href", "/examples");
    expect(document.querySelectorAll('a[href="/examples"]')).toHaveLength(1);
  });
});
