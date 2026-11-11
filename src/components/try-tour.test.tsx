import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TRY_START_HREF, TryTour } from "./try-tour";
import { SAMPLE_PACKAGES } from "@/lib/demo/sample-order";

describe("가입 없이 둘러보기(/try)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("네 단계를 끝까지 누르면 요청만으로는 안 줄고 수정 완료 때 1회 준다", () => {
    render(<TryTour />);
    const standard = SAMPLE_PACKAGES[1];
    // 1. 패키지 고르기: 기본은 두 번째(STANDARD) 예시 패키지
    expect(screen.getByRole("radio", { name: new RegExp(standard.name) })).toBeChecked();
    fireEvent.click(screen.getByTestId("try-next-1"));
    // 2. 카톡 문구에 포함 수정 횟수와 고객 링크가 들어간다
    expect(screen.getByTestId("try-message")).toHaveTextContent(`남은 포함 수정은 ${standard.revisionLimit}회예요.`);
    expect(screen.getByTestId("try-message")).toHaveTextContent("/r/");
    fireEvent.click(screen.getByTestId("try-next-2"));
    // 3. 고객이 요청을 남겨도 횟수는 그대로
    expect(screen.getByTestId("try-remaining-customer")).toHaveTextContent(String(standard.revisionLimit));
    fireEvent.click(screen.getByTestId("try-submit-request"));
    expect(screen.getByTestId("try-request-sent")).toHaveTextContent("확인 대기 1건");
    expect(screen.getByTestId("try-remaining-customer")).toHaveTextContent(String(standard.revisionLimit));
    fireEvent.click(screen.getByTestId("try-next-3"));
    // 4. 수정 완료를 눌러야 1회 준다
    expect(screen.getByTestId("try-result")).toHaveTextContent(`아직 ${standard.revisionLimit}회 남았어요`);
    fireEvent.click(screen.getByTestId("try-complete"));
    expect(screen.getByTestId("try-announcer")).toHaveTextContent("수정 완료");
    expect(screen.getByTestId("try-result")).toHaveTextContent(`포함 수정 ${standard.revisionLimit}회 중 1회 썼어요`);
    expect(screen.getByTestId("try-result")).toHaveTextContent(`남은 수정 ${standard.revisionLimit - 1}회`);
    // 처음부터 다시
    fireEvent.click(screen.getByTestId("try-restart"));
    expect(screen.getByTestId("try-step-1")).toBeInTheDocument();
  });

  it("고른 패키지의 포함 수정 횟수를 따라간다", () => {
    render(<TryTour />);
    const basic = SAMPLE_PACKAGES[0];
    fireEvent.click(screen.getByRole("radio", { name: new RegExp(basic.name) }));
    fireEvent.click(screen.getByTestId("try-next-1"));
    expect(screen.getByTestId("try-message")).toHaveTextContent(`남은 포함 수정은 ${basic.revisionLimit}회예요.`);
  });

  it("시작 버튼은 베타 코드가 자동 적용되는 초대 링크로 간다", () => {
    render(<TryTour />);
    expect(TRY_START_HREF).toBe("/today?invite=BETA2026");
    expect(within(screen.getByTestId("try-start")).getByTestId("try-start-button")).toHaveAttribute("href", TRY_START_HREF);
    expect(screen.getByTestId("try-start")).toHaveTextContent("BETA2026");
  });

  it("베타 코드 안내 문장의 조사가 코드 글자에 따라 틀리지 않는다(코드 뒤에 바로 조사를 붙이지 않음)", () => {
    render(<TryTour />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("베타 코드(BETA2026)가 자동으로 들어가요.");
    expect(text).not.toContain("BETA2026가");
  });

  it("체험을 눌러도 링크 안에 링크가 생기지 않는다(서버 화면과 브라우저 화면이 어긋나지 않게)", () => {
    const { container } = render(<TryTour />);
    fireEvent.click(screen.getByTestId("try-next-1"));
    fireEvent.click(screen.getByTestId("try-next-2"));
    fireEvent.click(screen.getByTestId("try-submit-request"));
    expect(container.querySelectorAll("a a")).toHaveLength(0);
  });

  it("체험을 끝까지 눌러도 브라우저 저장소와 서버를 쓰지 않는다", () => {
    const touched: string[] = [];
    const fakeStorage = (name: string) => ({
      getItem: () => { touched.push(`${name}.getItem`); return null; },
      setItem: () => { touched.push(`${name}.setItem`); },
      removeItem: () => { touched.push(`${name}.removeItem`); },
      clear: () => { touched.push(`${name}.clear`); },
      key: () => null,
      length: 0,
    });
    vi.stubGlobal("localStorage", fakeStorage("localStorage"));
    vi.stubGlobal("sessionStorage", fakeStorage("sessionStorage"));
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(<TryTour />);
    fireEvent.click(screen.getByTestId("try-next-1"));
    fireEvent.click(screen.getByTestId("try-next-2"));
    fireEvent.click(screen.getByTestId("try-submit-request"));
    fireEvent.click(screen.getByTestId("try-next-3"));
    fireEvent.click(screen.getByTestId("try-complete"));
    expect(touched).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("단계가 바뀌면 새 단계 제목으로 포커스가 간다", () => {
    render(<TryTour />);
    fireEvent.click(screen.getByTestId("try-next-1"));
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 3 }));
    expect(document.activeElement).toHaveTextContent("카톡 문구");
  });

  it("만든 곳에 상호·대표·사업자등록번호·문의 메일이 보인다", () => {
    render(<TryTour />);
    const maker = screen.getByTestId("try-maker");
    expect(maker).toHaveTextContent("열매스튜디오");
    expect(maker).toHaveTextContent("사업자등록번호");
    expect(maker).toHaveTextContent("통신판매업 신고번호");
    expect(maker).toHaveTextContent("주소");
    expect(within(maker).getByRole("link", { name: /@/ })).toHaveAttribute("href", expect.stringMatching(/^mailto:/));
    expect(within(maker).getByRole("link", { name: /010/ })).toHaveAttribute("href", expect.stringMatching(/^tel:\d+$/));
  });
});
