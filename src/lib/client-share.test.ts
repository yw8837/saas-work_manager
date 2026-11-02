import { describe, expect, it } from "vitest";

import { clientShareMessage, revisionPortalUrl, startReminderMessage } from "./client-share";

describe("고객에게 보낼 링크·문구", () => {
  it("주소 끝 슬래시를 정리하고 토큰을 인코딩한다", () => {
    expect(revisionPortalUrl("https://ilgam.studioyeolmae.com/", "a b")).toBe("https://ilgam.studioyeolmae.com/r/a%20b");
  });

  it("카톡 문구에는 고객 이름·일감명·남은 횟수 안내·링크만 넣고 금액은 넣지 않는다", () => {
    const message = clientShareMessage({ clientLabel: "모라스튜디오", title: "브랜드 사이트", included: 2, link: "https://x.test/r/token" });
    expect(message).toContain("안녕하세요, 모라스튜디오님.");
    expect(message).toContain("브랜드 사이트 작업의 수정 요청");
    expect(message).toContain("포함된 수정 2회");
    // 링크를 열 이유(남은 횟수·마감)와 지금 규칙(요청 1건 = 1회), 답은 원래 대화로 온다는 점.
    expect(message).toContain("남은 횟수와 마감을 링크에서 바로 볼 수 있어요.");
    expect(message).toContain("요청은 링크에 한 번에 남겨 주시면, 제가 수정을 마칠 때마다 1회씩 세요.");
    expect(message).toContain("질문은 이 대화로 편하게 주시고, 답도 여기로 드릴게요.");
    expect(message.trim().endsWith("https://x.test/r/token")).toBe(true);
    expect(message).not.toMatch(/원|₩|010-|@/);
  });

  // 지금 규칙: 수정을 마칠 때 1회를 쓰고, 다 쓴 뒤의 요청은 추가 작업으로 따로 협의한다(engine.ts completeRevision).
  it("포함 횟수는 있지만 남은 횟수가 0이면 '1회씩 세요' 대신 추가 작업으로 따로 말한다고 쓴다", () => {
    const message = clientShareMessage({ clientLabel: "모라스튜디오", title: "브랜드 사이트", included: 2, remaining: 0, link: "https://x.test/r/token" });
    expect(message).toContain("포함된 수정 2회를 모두 써서, 새 요청은 추가 작업으로 따로 말씀드릴게요.");
    expect(message).not.toContain("1회씩 세요");
    expect(message).not.toMatch(/원|₩|010-|@/);
  });

  it("이름·일감명이 비어도 어색한 공백 없이 만든다", () => {
    const message = clientShareMessage({ clientLabel: " ", title: "", included: 0, link: "https://x.test/r/t" });
    expect(message.split("\n")[0]).toBe("안녕하세요.");
    expect(message).toContain("\n작업의 수정 요청은");
    expect(message).toContain("접수 시각과 함께 기록돼요");
  });

  // 고객이 링크를 안 열어도 평소 대화창에서 바로 답할 수 있게, 받을 자료와 착수 전 질문을 문구 안에 넣는다.
  it("아직 못 받은 자료와 답 못 받은 질문을 링크 앞에 번호와 함께 넣는다", () => {
    const message = clientShareMessage({
      clientLabel: "모라스튜디오",
      title: "브랜드 사이트",
      included: 2,
      link: "https://x.test/r/token",
      pendingIntake: ["로고 원본 파일"],
      pendingQuestions: ["이 작업으로 가장 하고 싶은 일은 무엇인가요?", "꼭 들어가야 하는 것과 빼고 싶은 것이 있나요?"],
    });
    const lines = message.split("\n");
    const start = lines.indexOf("작업을 시작하기 전에 아래 내용만 이 대화로 보내 주세요. 모르는 건 '모름'이라고 적어 주셔도 괜찮아요.");
    expect(start).toBeGreaterThan(0);
    expect(lines.slice(start + 1, start + 6)).toEqual([
      "[보내 주실 자료]",
      "- 로고 원본 파일",
      "[알려 주실 것]",
      "1. 이 작업으로 가장 하고 싶은 일은 무엇인가요?",
      "2. 꼭 들어가야 하는 것과 빼고 싶은 것이 있나요?",
    ]);
    expect(message.trim().endsWith("https://x.test/r/token")).toBe(true);
  });

  it("남은 자료·질문이 없으면 예전 문구 그대로 둔다", () => {
    const base = { clientLabel: "모라스튜디오", title: "브랜드 사이트", included: 2, link: "https://x.test/r/token" };
    expect(clientShareMessage({ ...base, pendingIntake: [], pendingQuestions: [] })).toBe(clientShareMessage(base));
    expect(clientShareMessage(base)).not.toContain("작업을 시작하기 전에");
  });

  it("다시 보낼 문구는 인사와 남은 것만 담고, 남은 게 없으면 빈 문자열이다", () => {
    expect(startReminderMessage({ clientLabel: "모라스튜디오", pendingQuestions: ["참고 예시는?"] })).toBe(
      "안녕하세요, 모라스튜디오님.\n작업을 시작하기 전에 아래 내용만 이 대화로 보내 주세요. 모르는 건 '모름'이라고 적어 주셔도 괜찮아요.\n[알려 주실 것]\n1. 참고 예시는?",
    );
    expect(startReminderMessage({ clientLabel: "모라스튜디오", pendingIntake: [], pendingQuestions: [] })).toBe("");
  });
});
