import { describe, expect, it } from "vitest";

import { SETUP_HELP_BODY, SETUP_HELP_SUBJECT, setupHelpEmail, setupHelpMailto } from "./setup-help";

describe("첫 일감 같이 등록 신청 메일", () => {
  it("제목과 적을 것 세 가지를 미리 채운 mailto 주소를 만든다", () => {
    const href = setupHelpMailto("help@example.com");
    expect(href.startsWith("mailto:help@example.com?subject=")).toBe(true);
    const query = new URLSearchParams(href.slice(href.indexOf("?") + 1));
    expect(query.get("subject")).toBe(SETUP_HELP_SUBJECT);
    expect(query.get("body")).toBe(SETUP_HELP_BODY);
    expect(SETUP_HELP_BODY).toContain("1. 하시는 일");
    expect(SETUP_HELP_BODY).toContain("2. 지금 진행 중이거나 곧 시작할 주문");
    // 띄어쓰기를 +로 바꾸는 인코딩은 메일 앱에 +가 그대로 찍힐 수 있다.
    expect(href).not.toContain("+");
    expect(href).toContain("%0D%0A");
    expect(SETUP_HELP_BODY).toContain("3. 편한 시간과 방법");
    expect(SETUP_HELP_BODY).toContain("쓰던 견적서나 패키지 표가 있으면 붙여 주세요. 고객 이름은 지우고 보내 주세요.");
  });

  it("고객 이름·연락처는 받지 않는다고 본문 첫 줄에 적는다", () => {
    expect(SETUP_HELP_BODY.split("\r\n")[0]).toContain("고객 이름이나 연락처는 적지 않으셔도 돼요");
  });

  it("주소는 문의 메일, 없으면 사업자 메일이라 항상 메일 주소 모양이다", () => {
    expect(setupHelpEmail()).toMatch(/^\S+@\S+\.\S+$/);
  });
});
