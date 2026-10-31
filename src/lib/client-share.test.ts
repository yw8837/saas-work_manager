import { describe, expect, it } from "vitest";

import { clientShareMessage, revisionPortalUrl } from "./client-share";

describe("고객에게 보낼 링크·문구", () => {
  it("주소 끝 슬래시를 정리하고 토큰을 인코딩한다", () => {
    expect(revisionPortalUrl("https://ilgam.studioyeolmae.com/", "a b")).toBe("https://ilgam.studioyeolmae.com/r/a%20b");
  });

  it("카톡 문구에는 고객 이름·일감명·남은 횟수 안내·링크만 넣고 금액은 넣지 않는다", () => {
    const message = clientShareMessage({ clientLabel: "모라스튜디오", title: "브랜드 사이트", included: 2, link: "https://x.test/r/token" });
    expect(message).toContain("안녕하세요, 모라스튜디오님.");
    expect(message).toContain("브랜드 사이트 작업의 수정 요청");
    expect(message).toContain("포함된 수정 2회");
    expect(message.trim().endsWith("https://x.test/r/token")).toBe(true);
    expect(message).not.toMatch(/원|₩|010-|@/);
  });

  it("이름·일감명이 비어도 어색한 공백 없이 만든다", () => {
    const message = clientShareMessage({ clientLabel: " ", title: "", included: 0, link: "https://x.test/r/t" });
    expect(message.split("\n")[0]).toBe("안녕하세요.");
    expect(message).toContain("\n작업의 수정 요청은");
    expect(message).toContain("접수 시각과 함께 기록돼요");
  });
});
