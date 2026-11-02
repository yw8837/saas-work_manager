import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PLAN_LIMITS } from "@/lib/domain";
import { MarketingHome } from "./marketing-home";
import { GUIDE_CHAPTERS, GUIDE_SIGNUP, UserGuide } from "./user-guide";

describe("랜딩 히어로", () => {
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

describe("그림 사용설명서", () => {
  const allShots = () => [GUIDE_SIGNUP, ...GUIDE_CHAPTERS.flatMap((chapter) => chapter.shots)];

  it("무기 3개 순서의 장 4개에 그림 8장, 맨 위에 가입 그림 1장", () => {
    expect(GUIDE_CHAPTERS.map((chapter) => chapter.title)).toEqual(["주문 30초 등록", "시작 안내 한 방", "수정 범위 정리", "더 편하게"]);
    expect(GUIDE_CHAPTERS.map((chapter) => chapter.shots.length)).toEqual([2, 2, 2, 2]);
    render(<UserGuide />);
    const strip = screen.getByRole("navigation", { name: "네 장 한눈에 보기" });
    for (const chapter of GUIDE_CHAPTERS) {
      const section = document.getElementById(chapter.id)!;
      expect(section.querySelectorAll("img")).toHaveLength(chapter.shots.length);
    }
    expect(within(screen.getByTestId("guide-signup")).getByRole("img")).toHaveAttribute("src", GUIDE_SIGNUP.image.src);
    // 목차 띠 밖의 그림 = 장 그림 8장 + 가입 1장
    expect(Array.from(document.images).filter((image) => !strip.contains(image))).toHaveLength(9);
  });

  it("모든 그림에 설명(alt)이 있고, 맨 위 목차 띠 그림만 장식이라 비워 둔다", () => {
    for (const shot of allShots()) expect(shot.image.alt.trim(), shot.id).not.toBe("");
    render(<UserGuide />);
    const strip = screen.getByRole("navigation", { name: "네 장 한눈에 보기" });
    for (const image of Array.from(document.images)) {
      if (strip.contains(image)) expect(image.getAttribute("alt")).toBe("");
      else expect(image.getAttribute("alt")?.trim()).toBeTruthy();
      // 일감 화면 구획 이름('수정 요청 기록')과 같은 말을 쓰고, 그림 설명에도 '로그'를 쓰지 않는다.
      expect(image.alt).not.toMatch(/로그(?!인|아웃)/);
    }
  });

  it("그림이 먼저, 그 아래 제목 한 줄(24자 이하)과 설명 한 줄(40자 이하), 긴 글은 '자세히' 접기에만", () => {
    for (const shot of allShots()) {
      expect(shot.title.length, shot.title).toBeLessThanOrEqual(24);
      expect(shot.caption.length, shot.caption).toBeLessThanOrEqual(40);
    }
    render(<UserGuide />);
    for (const shot of GUIDE_CHAPTERS.flatMap((chapter) => chapter.shots)) {
      const item = document.getElementById(shot.id)!;
      const [figure, title, caption] = Array.from(item.children);
      expect(figure.tagName).toBe("FIGURE");
      expect(title).toHaveTextContent(shot.title);
      expect(caption).toHaveTextContent(shot.caption);
      const details = item.querySelector("details");
      if (shot.detail) {
        expect(details?.querySelector("summary")).toHaveTextContent("자세히");
        expect(details).toHaveTextContent(shot.detail);
      } else {
        expect(details).toBeNull();
      }
    }
  });

  it("장마다 '직접 해 보기' 링크는 하나씩, 맨 위 목차 띠는 네 장으로 이어진다", () => {
    render(<UserGuide />);
    for (const chapter of GUIDE_CHAPTERS) {
      const links = within(document.getElementById(chapter.id)!).getAllByRole("link", { name: /직접 해 보기/ });
      expect(links).toHaveLength(1);
      expect(links[0]).toHaveAttribute("href", chapter.tryIt.href);
    }
    const strip = screen.getByRole("navigation", { name: "네 장 한눈에 보기" });
    expect(within(strip).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(GUIDE_CHAPTERS.map((chapter) => `#${chapter.id}`));
  });

  it("설명서 글은 예전(1,094자)보다 짧다", () => {
    render(<UserGuide />);
    const text = (document.body.textContent ?? "").replace(/\s+/g, " ").trim();
    expect(text.length).toBeLessThan(1094);
    // 돌아보기(화면 innerText)는 줄마다 띄어 세서 textContent보다 길게 나온다(예전 설명서 1,097 대 1,061).
    // 글 조각 사이를 한 칸씩 띄워 같은 기준으로도 잰다(접힌 '자세히' 글도 센다).
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const parts: string[] = [];
    while (walker.nextNode()) parts.push(walker.currentNode.textContent ?? "");
    expect(parts.join(" ").replace(/\s+/g, " ").trim().length).toBeLessThan(1094);
  });

  it("시작 안내 장은 링크 없이 답해도 된다고, 수정 범위 장은 확인 대기 → 수정 완료 때 1회를, 맨 아래는 아직 안 되는 것을 알려 준다", () => {
    render(<UserGuide />);
    const start = document.getElementById("start");
    expect(start).toHaveTextContent("고객은 링크 없이 대화창으로 답해도 돼요");
    expect(start).toHaveTextContent("자동으로 보내지지는 않아요");
    const scope = document.getElementById("scope");
    expect(scope).toHaveTextContent("요청은 확인 대기로 들어와요");
    expect(scope).toHaveTextContent("고친 뒤 '수정 완료'를 누를 때 1회를 써요");
    expect(scope).toHaveTextContent("질문·중복은 '반려', 범위 밖은 '추가 작업으로'를 눌러요. 둘 다 횟수를 안 써요.");
    expect(document.getElementById("more")).toHaveTextContent("세금 계산이나 신고는 하지 않아요");
    expect(document.body.textContent).not.toContain("접수되는 즉시");
    const notYet = screen.getByTestId("guide-not-yet");
    expect(within(notYet).getByRole("heading", { name: "아직 안 되는 것" })).toBeInTheDocument();
    expect(notYet).toHaveTextContent("자동으로 가져오지 않아요");
    expect(notYet).toHaveTextContent("고객이 결과를 확인한 뒤에 차감하는 방식과 웹에서 새 요청 알림도 아직 준비 전이에요");
  });
});
