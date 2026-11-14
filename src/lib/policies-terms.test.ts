import { describe, expect, it } from "vitest";

import { POLICY_CHANGE_NOTICE, POLICY_PUBLICATION_MANIFEST } from "./policies";

describe("beta terms responsibility boundary", () => {
  it("describes ordinary account creation while keeping beta access codes separate", () => {
    const text = JSON.stringify(POLICY_PUBLICATION_MANIFEST);

    expect(text).toContain("Google 계정으로 가입하고 로그인할 수 있습니다");
    expect(text).toContain("14일 Pro 이용 코드");
    expect(text).not.toContain("초대 계정");
    expect(text).not.toContain("초대를 받은 테스트 계정만");
  });

  it("베타 이용 코드 기간은 정책 어디서나 14일이다(2026-11-03 결정)", () => {
    const { privacy, terms } = POLICY_PUBLICATION_MANIFEST.documents;
    const strings = (value: unknown): string[] => typeof value === "string"
      ? [value]
      : Array.isArray(value) ? value.flatMap(strings) : value && typeof value === "object" ? Object.values(value).flatMap(strings) : [];

    expect(POLICY_PUBLICATION_MANIFEST.shared.draftNoticeBody).toContain("가입 후 14일 Pro 권한");
    expect(JSON.stringify({ shared: POLICY_PUBLICATION_MANIFEST.shared, terms })).not.toContain("30일");
    // 개인정보처리방침의 '30일'은 방문 기록 도구 보관 기간 한 문장뿐이다(이용 코드 기간이 아니다).
    expect(strings(privacy).filter((text) => text.includes("30일"))).toEqual([
      expect.stringMatching(/^방문 기록\(Microsoft Clarity\): 화면 재생용 기록은 30일,/),
    ]);
  });

  it("수집 항목이 바뀌면 새 버전으로 올려 기존 계정도 다시 동의하게 한다(방문 기록 도구 항목, 2026-11-13)", () => {
    expect(POLICY_PUBLICATION_MANIFEST.documents.terms.version).toBe("2026-11-13-beta.6");
    expect(POLICY_PUBLICATION_MANIFEST.documents.privacy.version).toBe("2026-11-13-beta.6");
    expect(POLICY_PUBLICATION_MANIFEST.effectiveDate).toBe("2026-11-13");
    expect(POLICY_PUBLICATION_MANIFEST.effectiveDateLabel).toBe("2026년 11월 13일");
    expect(POLICY_PUBLICATION_MANIFEST.finalized).toBe(false);
  });

  it("개인정보처리방침의 호스팅 처리자는 실제 호스팅인 Cloudflare다(2026-11-01 전환)", () => {
    const transfer = POLICY_PUBLICATION_MANIFEST.documents.privacy.sections
      .find((section) => section.heading.includes("처리 위탁"));
    const text = JSON.stringify(transfer);
    const table = transfer?.blocks.find((block) => block.type === "table");
    const links = transfer?.blocks.find((block) => block.type === "links");

    expect(table && table.type === "table" ? table.rows.map((row) => row[0]) : []).toEqual(["Supabase", "Cloudflare", "Microsoft Corporation"]);
    expect(text).toContain("Cloudflare Workers 웹 호스팅");
    expect(text).toContain("Supabase와 Cloudflare의 지원·보안·전송망");
    expect(links && links.type === "links" ? links.items : []).toEqual(expect.arrayContaining([
      { label: "Cloudflare 개인정보처리방침", href: "https://www.cloudflare.com/privacypolicy/" },
      { label: "Cloudflare DPA", href: "https://www.cloudflare.com/cloudflare-customer-dpa/" },
    ]));
    expect(JSON.stringify(POLICY_PUBLICATION_MANIFEST)).not.toMatch(/OpenAI|openai\.com/);
  });

  it("다시 동의 화면의 바뀐 점 안내는 지금 버전 것이다", () => {
    expect(POLICY_CHANGE_NOTICE.version).toBe(POLICY_PUBLICATION_MANIFEST.documents.terms.version);
    expect(POLICY_CHANGE_NOTICE.summary).toBe("메인·둘러보기 화면에서 쓰는 방문 기록 도구(Microsoft Clarity) 항목 추가");
  });

  it("방문 기록 도구(Microsoft Clarity): 쓰는 화면·항목·목적·처리자·국외 처리·보관 기간·거부 방법을 적는다", () => {
    const privacy = POLICY_PUBLICATION_MANIFEST.documents.privacy;
    const section = (word: string) => JSON.stringify(privacy.sections.find((item) => item.heading.includes(word)));
    const purposes = privacy.sections[0].blocks.find((block) => block.type === "table");
    const row = purposes && purposes.type === "table" ? purposes.rows.find((item) => item[0] === "화면 개선(방문 기록)") : undefined;

    expect(row?.[1]).toContain("메인(/)·둘러보기(/try) 화면");
    expect(row?.[1]).toContain("클릭·스크롤·마우스 이동");
    expect(row?.[1]).toContain("기기·브라우저·운영체제 정보");
    expect(row?.[1]).toContain("쿠키는 저장하지 않도록 설정해 쓰고 화면을 열 때마다 새 식별값을 씀");
    expect(row?.[1]).not.toContain("쿠키 값");
    expect(row?.[1]).toContain("유입 경로 표시(있을 때만)");
    expect(row?.[1]).toContain("입력 칸에 적은 글은 가려져 전송되지 않음");
    expect(row?.[2]).toBe("두 화면에 접속할 때 Microsoft Clarity가 자동 수집");
    expect(section("처리 목적")).toContain("로그인한 작업 화면, 고객 수정 요청 화면(/r/…)과 그 체험 화면, 사용설명서·예시·약관 화면에서는 쓰지 않으며");
    expect(section("보유")).toContain("화면 재생용 기록은 30일, 클릭·히트맵 집계 자료와 따로 표시해 둔 기록은 9개월");
    expect(section("처리 위탁")).toContain("미국 법인 Microsoft Corporation이 Microsoft Azure 클라우드에서 처리합니다(국외 이전)");
    expect(section("처리 위탁")).toContain("https://www.microsoft.com/ko-kr/privacy/privacystatement");
    expect(section("선택과 권리")).toContain("추적 거부 신호(Global Privacy Control 또는 Do Not Track)를 켜 주세요");
    // 쿠키 저장 거부로 쓴다(2026-11-13 사용자 결정): 쿠키를 저장한다고 읽히는 문장이 남지 않는다.
    expect(section("처리 목적")).toContain("Microsoft Clarity는 쿠키(이 사이트의 _clck·_clsk, Microsoft 주소의 MUID 등)를 저장하지 않도록 설정해 씁니다. 그래서 화면을 열 때마다 새 식별값을 쓰고, 같은 방문자가 다른 화면으로 옮기거나 다시 와도 이어 붙이지 않습니다.");
    expect(section("처리 위탁")).toContain("조작 기록·기기 정보·유입 경로 표시 / Microsoft Azure 클라우드, 국외 처리");
    expect(section("선택과 권리")).toContain("이 도구는 쿠키를 저장하지 않도록 설정해 씁니다.");
    expect(JSON.stringify(privacy)).not.toMatch(/쿠키 값|쿠키를 막으면|쿠키가 있습니다/);
    expect(section("처리 위탁")).toContain("개인정보를 광고 사업자에게 판매하거나 맞춤 광고에 제공하지 않습니다.");
    // 이용약관 본문은 바꾸지 않는다(버전 값만 함께 올린다).
    expect(JSON.stringify(POLICY_PUBLICATION_MANIFEST.documents.terms)).not.toContain("Clarity");
  });

  it("keeps the beta limitation clear without excluding mandatory liability", () => {
    const responsibility = POLICY_PUBLICATION_MANIFEST.documents.terms.sections
      .find((section) => section.heading.includes("책임"));
    const text = JSON.stringify(responsibility);

    expect(text).toContain("계약·납품·고객 분쟁");
    expect(text).toContain("고의 또는 중대한 과실");
    expect(text).toContain("최종 납기");
  });
});
