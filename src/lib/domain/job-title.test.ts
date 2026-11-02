import { describe, expect, it } from "vitest";

import { displayJobTitle } from "./job-title";

describe("고객 이름이 바로 옆에 보이는 곳의 일감 제목", () => {
  it("기본 제목 앞의 '고객 이름 · '을 뗀다", () => {
    expect(displayJobTitle({ clientLabel: "카페 모라", title: "카페 모라 · Basic 홈페이지" })).toBe("Basic 홈페이지");
  });

  it("앞뒤 공백이 있는 고객 이름도 뗀다", () => {
    expect(displayJobTitle({ clientLabel: " 카페 모라 ", title: "카페 모라 · Basic 홈페이지" })).toBe("Basic 홈페이지");
  });

  it("사용자가 바꾼 제목은 그대로 둔다", () => {
    expect(displayJobTitle({ clientLabel: "카페 모라", title: "메뉴판 리뉴얼" })).toBe("메뉴판 리뉴얼");
  });

  it("떼면 비는 경우에는 원래 제목을 쓴다", () => {
    expect(displayJobTitle({ clientLabel: "카페 모라", title: "카페 모라 · " })).toBe("카페 모라 · ");
  });
});
