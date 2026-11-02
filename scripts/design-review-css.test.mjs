import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// 디자인 감사(2026-11-02) '꼭 고칠 것' 중 화면 규칙(CSS)으로만 고치는 부분을 지킨다.
const root = resolve(import.meta.dirname, "..");
const theme = readFileSync(resolve(root, "src/styles/theme.css"), "utf8");
const workspace = readFileSync(resolve(root, "src/styles/workspace.css"), "utf8");

/** `@media 조건 { … }` 블록 안의 글만 모은다(중괄호 짝을 맞춘다). */
function mediaBlocks(css, condition) {
  const head = `@media ${condition}`;
  const blocks = [];
  let from = css.indexOf(head);
  while (from !== -1) {
    const open = css.indexOf("{", from);
    let depth = 0;
    let index = open;
    for (; index < css.length; index += 1) {
      if (css[index] === "{") depth += 1;
      else if (css[index] === "}" && --depth === 0) break;
    }
    blocks.push(css.slice(open + 1, index));
    from = css.indexOf(head, index);
  }
  return blocks.join("\n");
}

/** 선택자에 `selector`가 들어 있는 규칙(선택자 글·본문). */
function rulesMentioning(css, selector) {
  const needle = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`);
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((match) => needle.test(match[1]))
    .map((match) => ({ selector: match[1].trim(), body: match[2] }));
}

/** `@media` 블록을 모두 뺀 기본(데스크톱) 규칙만. */
function outsideMedia(css) {
  let result = "";
  let from = 0;
  let start = css.indexOf("@media", from);
  while (start !== -1) {
    result += css.slice(from, start);
    let depth = 0;
    let index = css.indexOf("{", start);
    for (; index < css.length; index += 1) {
      if (css[index] === "{") depth += 1;
      else if (css[index] === "}" && --depth === 0) break;
    }
    from = index + 1;
    start = css.indexOf("@media", from);
  }
  return result + css.slice(from);
}

const bodies = (css, selector) => rulesMentioning(css, selector).map((rule) => rule.body).join("\n");
const baseTheme = outsideMedia(theme);
const mobileTheme = mediaBlocks(theme, "(max-width: 760px)");
const mobileWorkspace = mediaBlocks(workspace, "(max-width: 760px)");

describe("첫 실행 체크리스트(감사 4번)", () => {
  it("휴대폰에서는 단계 그림을 숨겨 '첫 일감 만들기'가 첫 화면에 들어오게 한다", () => {
    expect(bodies(mobileTheme, ".firstRunShot")).toMatch(/display:\s*none/);
  });
});

describe("데스크톱 새 일감 '일감 만들기'(감사 9번)", () => {
  it("넓은 화면에서는 미리보기 패널이 상단 바 아래에 붙어 따라 내려온다", () => {
    const wide = bodies(mediaBlocks(theme, "(min-width: 1051px)"), ".jobPreview");
    expect(wide).toMatch(/position:\s*sticky/);
    expect(wide).toMatch(/top:\s*84px/);
  });
});

describe("휴대폰 일감 첫 화면에 '문구 복사'가 들어오게(감사 2·3번)", () => {
  it("'더보기'는 따로 한 줄을 쓰지 않고 제목 묶음 오른쪽 위로 올린다", () => {
    expect(bodies(mobileTheme, ".detailHeader")).toMatch(/position:\s*relative/);
    expect(bodies(mobileTheme, ".detailHeader .detailMore")).toMatch(/position:\s*absolute/);
  });

  it("핵심 정보는 휴대폰에서만 한 줄 요약이고, 금액 칸 셋은 '금액 보기'를 펼쳤을 때만 보인다", () => {
    expect(bodies(baseTheme, ".jobFactLine")).toMatch(/display:\s*none/);
    expect(bodies(mobileTheme, ".jobFactLine")).toMatch(/display:\s*flex/);
    expect(bodies(mobileTheme, '.jobFactRail[data-money-open="false"]')).toMatch(/display:\s*none/);
    expect(bodies(mobileTheme, '.jobFactRail[data-money-open="true"] > div:not(.jobFactMoney)')).toMatch(/display:\s*none/);
    expect(bodies(mobileWorkspace, '.appFrame .jobFactRail[data-money-open="true"]')).toMatch(/grid-template-columns:\s*repeat\(3/);
  });

  it("말풍선은 휴대폰에서 160px까지만 쓰고 안에서 스크롤한다", () => {
    expect(bodies(mobileTheme, ".clientMessageBubble")).toMatch(/max-height:\s*160px/);
    expect(bodies(mobileTheme, ".sendToClientMessage")).toMatch(/max-height:\s*160px/);
  });

  it("'문구 복사'는 구획 머리 버튼이라 휴대폰에서 줄 전체로 늘이지 않는다", () => {
    expect(bodies(mobileTheme, ".clientMessageCopy")).not.toMatch(/width:\s*100%/);
  });

  it("저장 직후 띠의 '링크만 복사'·'고객 화면 미리보기'는 휴대폰에서 한 줄 두 칸", () => {
    expect(bodies(mobileTheme, ".sendToClientActions > .secondaryButton")).toMatch(/flex:\s*1 1 0/);
  });
});

describe("어두운 면 위 키보드 포커스(감사 6번)", () => {
  it("일감 하단 바·새 일감 하단 바·알림 위에서는 흰 포커스 링을 쓴다", () => {
    for (const selector of [".jobActionBar :focus-visible", ".mobileSubmitBar :focus-visible", ".actionToast :focus-visible"]) {
      expect(bodies(theme, selector), selector).toMatch(/outline-color:\s*var\(--paper\)/);
    }
    // 작업 화면의 --paper는 흰색이다(어두운 바 #242426 위 대비 15.49:1).
    expect(workspace).toMatch(/--paper:\s*#fff;/);
  });
});

describe("휴대폰 터치 44px(감사 10번)", () => {
  it("'반려·되돌리기' 같은 글 버튼도 휴대폰에서 44px이고 옆 버튼과 8px 띄운다", () => {
    expect(rulesMentioning(mobileTheme, ".textOnlyButton").some((rule) => /min-height:\s*44px/.test(rule.body))).toBe(true);
    const revert = bodies(mobileTheme, ".revisionRevertButton");
    expect(revert).toMatch(/min-height:\s*44px/);
    expect(revert).toMatch(/min-width:\s*44px/);
    expect(revert).toMatch(/padding-inline:\s*\d+px/);
    expect(bodies(mobileTheme, ".revisionRowActions")).toMatch(/gap:\s*8px/);
  });

  it("프로필 버튼은 보이는 원(33px)은 그대로 두고 누르는 영역만 44px 이상으로 넓힌다", () => {
    expect(bodies(mobileTheme, ".avatar")).toMatch(/width:\s*33px/);
    expect(bodies(mobileTheme, ".avatarButton")).toMatch(/position:\s*relative/);
    const area = bodies(mobileTheme, ".avatarButton::after");
    expect(area).toMatch(/content:\s*""/);
    expect(area).toMatch(/position:\s*absolute/);
    // 33px + 6px × 2 = 45px
    expect(area).toMatch(/inset:\s*-6px/);
  });
});

describe("최소 남길 돈 경고는 화면마다 한 줄(시장조사 R7)", () => {
  it("새 일감: 아래 띠가 보이는 폭(1050px 이하)에서는 미리보기 패널의 경고를 숨겨 아래 띠 한 곳에만 보인다", () => {
    const tablet = mediaBlocks(theme, "(max-width: 1050px)");
    expect(bodies(tablet, ".mobileSubmitBar")).toMatch(/display:\s*flex/);
    expect(bodies(tablet, ".jobPreview .marginWarning")).toMatch(/display:\s*none/);
    expect(bodies(tablet, ".marginWarningPill")).not.toMatch(/display:\s*none/);
    // 데스크톱(기본)에서는 아래 띠가 없어 미리보기 패널의 경고 한 곳만 보인다.
    expect(rulesMentioning(baseTheme, ".mobileSubmitBar").some((rule) => rule.selector === ".mobileSubmitBar" && /display:\s*none/.test(rule.body))).toBe(true);
    expect(bodies(baseTheme, ".jobPreview .marginWarning")).not.toMatch(/display:\s*none/);
  });
});

describe("써 보며 다듬기(2026-11-02 돌아보기)", () => {
  it("첫 실행 접힌 줄의 가운뎃점은 앞 항목 끝에 붙어, 줄이 바뀌어도 줄 맨 앞에 혼자 남지 않는다", () => {
    expect(bodies(theme, ".firstRunDoneLine > :not(:last-child)::after")).toMatch(/content:\s*"·"/);
  });

  it("'금액 보기'에는 펼침 표시가 있고, 펼치면 뒤집힌다", () => {
    expect(bodies(theme, '.jobFactLine .textButton[aria-expanded="true"] svg')).toMatch(/rotate\(180deg\)/);
  });
});

describe("첫 실행 접힌 1단계의 업종 칩(리뷰 반영)", () => {
  it("접힌 줄 아래 칩은 작게 두되 휴대폰에서는 손가락 크기(44px)", () => {
    expect(bodies(baseTheme, ".firstRunIndustryChips .industryChip")).toMatch(/min-height:\s*36px/);
    expect(bodies(mobileTheme, ".firstRunIndustryChips .industryChip")).toMatch(/min-height:\s*44px/);
  });
});

describe("토큰 밖 색 정리(리뷰 표준)", () => {
  it("월별 정리 줄 호버는 다른 행 호버와 같은 canvas 토큰을 쓴다", () => {
    expect(bodies(theme, ".summaryRow:hover")).toMatch(/background:\s*var\(--canvas\)/);
  });

  it("일감 하단 행동 바는 토큰 색만 쓰고, 흰 반투명은 color-mix로 만든다(보이는 값은 그대로)", () => {
    expect(bodies(workspace, ".jobActionBar")).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
    expect(bodies(workspace, ".appFrame .jobActionBar")).toMatch(/background:\s*var\(--ink\)/);
    expect(bodies(workspace, ".appFrame .jobActionBar .quietButton")).toMatch(/border-color:\s*color-mix\(in srgb, var\(--paper\) 55%, transparent\)/);
    expect(bodies(workspace, ".appFrame .jobActionBar .quietButton:hover")).toMatch(/background:\s*color-mix\(in srgb, var\(--paper\) 10%, transparent\)/);
    // 작업 화면의 --ink·--paper는 바꾸기 전 값(#242426·#fff)과 같다.
    expect(workspace).toMatch(/--ink:\s*#242426;/);
    expect(workspace).toMatch(/--paper:\s*#fff;/);
  });
});

describe("착수 전 질문 '답 받음'(작업 9가 찾음)", () => {
  it("긴 질문 옆 '답 받음'·'받음' 글은 줄어들지 않아 한 글자씩 세로로 찌그러지지 않는다", () => {
    expect(bodies(theme, ".intakeToggle small")).toMatch(/flex:\s*none/);
  });
});
