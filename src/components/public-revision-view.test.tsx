import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PublicRevisionCompleted, PublicRevisionUnavailable, PublicRevisionView } from "./public-revision-view";

const revision = { included: 3, used: 1, remaining: 2 };

describe("고객 링크 화면", () => {
  it("맨 위에 입력칸으로 바로 가는 링크가 있고, 입력 폼과 연결된다", () => {
    render(<PublicRevisionView title="브랜드 사이트" packageName="Standard" revision={revision} badgeLabel="보안 링크" footnote="안내" onSubmit={vi.fn()} />);
    const jump = screen.getByRole("link", { name: "수정 요청 바로 남기기" });
    const target = jump.getAttribute("href")?.replace("#", "") ?? "";
    expect(target).not.toBe("");
    expect(document.getElementById(target)?.tagName).toBe("FORM");
  });

  it("실제 링크(서버가 주는 값만): 남은 수정을 큰 숫자로, 작업자 이름·마감·단계는 그리지 않는다", () => {
    render(<PublicRevisionView title="브랜드 사이트" packageName="Standard" revision={revision} badgeLabel="보안 링크" footnote="안내" onSubmit={vi.fn()} />);
    expect(screen.getByTestId("revision-remaining")).toHaveTextContent("2");
    expect(screen.getByText("전체 3회 중 1회 사용")).toBeInTheDocument();
    expect(screen.queryByTestId("revision-worker")).not.toBeInTheDocument();
    expect(screen.queryByTestId("revision-due")).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "진행 단계" })).not.toBeInTheDocument();
    // 금액·연락처는 이 화면에 들어올 자리가 없다.
    expect(document.body.textContent).not.toMatch(/₩|\d원|010-/);
  });

  // 서버가 주는 기본 제목은 이미 "고객 · 패키지" 모양이라, 맨 위 줄에 패키지 이름이 두 번 붙으면 안 된다.
  it("제목이 패키지 이름으로 끝나면 맨 위 줄에 패키지 이름을 한 번만 보여 준다", () => {
    const { unmount } = render(<PublicRevisionView title="카페 모라 · Basic 홈페이지" packageName="Basic 홈페이지" revision={revision} badgeLabel="보안 링크" footnote="안내" onSubmit={vi.fn()} />);
    expect(screen.getByText("카페 모라 · Basic 홈페이지")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("Basic 홈페이지 · Basic 홈페이지");
    unmount();

    // 제목이 패키지 이름과 같아도 한 번만.
    const same = render(<PublicRevisionView title="Basic 홈페이지" packageName="Basic 홈페이지" revision={revision} badgeLabel="보안 링크" footnote="안내" onSubmit={vi.fn()} />);
    expect(screen.getByText("Basic 홈페이지")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("Basic 홈페이지 · Basic 홈페이지");
    same.unmount();

    // 제목이 패키지 이름으로 안 끝나면 지금처럼 "제목 · 패키지".
    render(<PublicRevisionView title="브랜드 사이트" packageName="Standard" revision={revision} badgeLabel="보안 링크" footnote="안내" onSubmit={vi.fn()} />);
    expect(screen.getByText("브랜드 사이트 · Standard")).toBeInTheDocument();
  });

  it("값을 받으면 작업자 이름·마감·진행 단계 칩(지금 단계 글자 표시)을 그린다", () => {
    render(<PublicRevisionView title="로고" packageName="Standard" revision={revision} workerName="샘플 스튜디오" dueLabel="5일 남음" stage={2} badgeLabel="체험" footnote="안내" onSubmit={vi.fn()} />);
    expect(screen.getByTestId("revision-worker")).toHaveTextContent("샘플 스튜디오");
    expect(screen.getByTestId("revision-due")).toHaveTextContent("5일 남음");
    const steps = within(screen.getByRole("list", { name: "진행 단계" })).getAllByRole("listitem");
    expect(steps.map((item) => item.getAttribute("data-state"))).toEqual(["done", "done", "current", "todo", "todo"]);
    expect(steps[2]).toHaveAttribute("aria-current", "step");
    expect(steps[2]).toHaveTextContent("시안 확인지금");
  });

  // 5번: 'Standard 홈페이지'가 대문자 변환 CSS(.pageEyebrow) 때문에 'STANDARD 홈페이지'로 보였다.
  it("맨 위 '고객 · 패키지' 줄은 대문자로 바꾸는 꾸밈 글자 클래스를 쓰지 않고, 그 줄 CSS도 대문자 변환이 없다", () => {
    render(<PublicRevisionView title="카페 모라" packageName="Standard 홈페이지" revision={revision} badgeLabel="보안 링크" footnote="안내" onSubmit={vi.fn()} />);
    const line = screen.getByText("카페 모라 · Standard 홈페이지");
    expect(line).not.toHaveClass("pageEyebrow");
    expect(line).toHaveClass("publicRevisionTitleLine");
    const css = readFileSync(resolve(process.cwd(), "src/styles/theme.css"), "utf8");
    const rule = /\.publicRevisionTitleLine\s*\{([^}]*)\}/.exec(css);
    expect(rule).not.toBeNull();
    expect(rule![1]).not.toMatch(/uppercase/);
  });

  // 3번: 시안을 보기 전(자료 받는 중·작업 중)에는 수정 요청을 서두르지 않게 안내한다.
  it.each([
    [0, true],
    [1, true],
    [2, false],
    [3, false],
  ])("단계 %i에서 시안 전 안내 표시 = %s", (stage, shown) => {
    render(<PublicRevisionView title="로고" packageName="Standard" revision={revision} stage={stage as 0 | 1 | 2 | 3} badgeLabel="체험" footnote="안내" onSubmit={vi.fn()} />);
    const notice = screen.queryByTestId("revision-before-draft");
    if (shown) expect(notice).toHaveTextContent("수정은 시안을 보신 뒤 남겨 주세요");
    else expect(notice).not.toBeInTheDocument();
  });

  it("단계를 모르면(옛 서버) 시안 전 안내를 그리지 않는다", () => {
    render(<PublicRevisionView title="로고" packageName="Standard" revision={revision} badgeLabel="체험" footnote="안내" onSubmit={vi.fn()} />);
    expect(screen.queryByTestId("revision-before-draft")).not.toBeInTheDocument();
  });

  it("받을 자료가 남은 단계(자료 받는 중)를 첫 칩으로 보여 준다", () => {
    render(<PublicRevisionView title="로고" packageName="Standard" revision={revision} stage={0} badgeLabel="체험" footnote="안내" onSubmit={vi.fn()} />);
    const current = within(screen.getByRole("list", { name: "진행 단계" })).getAllByRole("listitem")[0];
    expect(current).toHaveAttribute("aria-current", "step");
    expect(current).toHaveTextContent("자료 받는 중지금");
  });

  // 4번: 확인 대기가 남은 포함 수정보다 많으면, 넘는 건수는 추가 작업이 될 수 있다고 미리 알린다.
  it("확인 대기가 남은 수정보다 많으면 한 줄로 알리고, 같거나 적으면 그리지 않는다", () => {
    const { unmount } = render(<PublicRevisionView title="로고" packageName="Standard" revision={{ included: 1, used: 0, remaining: 1, pending: 2 }} badgeLabel="체험" footnote="안내" onSubmit={vi.fn()} />);
    expect(screen.getByTestId("revision-pending-over")).toHaveTextContent("확인 대기 2건 · 남은 포함 수정 1회라 1건은 추가 작업이 될 수 있어요");
    unmount();
    render(<PublicRevisionView title="로고" packageName="Standard" revision={{ included: 3, used: 0, remaining: 3, pending: 2 }} badgeLabel="체험" footnote="안내" onSubmit={vi.fn()} />);
    expect(screen.queryByTestId("revision-pending-over")).not.toBeInTheDocument();
  });

  it("접수 뒤 화면에도 확인 대기가 남은 수정보다 많다는 한 줄을 보여 준다", async () => {
    const view = render(<PublicRevisionView title="로고" packageName="Standard" revision={{ included: 1, used: 0, remaining: 1, pending: 1 }} badgeLabel="체험" footnote="안내" onSubmit={vi.fn().mockResolvedValue("pending")} />);
    fireEvent.change(screen.getByLabelText("수정 요청 내용"), { target: { value: "두 번째 요청" } });
    fireEvent.click(screen.getByRole("button", { name: /요청 남기기/ }));
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    // 넘겨주는 쪽이 접수 뒤 숫자를 새로 넘긴다(대기 2건).
    view.rerender(<PublicRevisionView title="로고" packageName="Standard" revision={{ included: 1, used: 0, remaining: 1, pending: 2 }} badgeLabel="체험" footnote="안내" onSubmit={vi.fn()} />);
    expect(within(screen.getByTestId("revision-next-step")).getByTestId("revision-pending-over")).toHaveTextContent("1건은 추가 작업이 될 수 있어요");
  });

  // 2번: 고객이 남긴 요청이 어떻게 처리됐는지 보여 준다. 원문만, 작업자 메모·내부 분류명은 없다.
  it("남긴 요청 목록을 상태와 함께 보여 준다", () => {
    render(<PublicRevisionView title="로고" packageName="Standard" revision={revision} badgeLabel="체험" footnote="안내" onSubmit={vi.fn()} requests={[
      { status: "pending", submittedAt: "2026-11-03T05:00:00.000Z", body: "메인 문구를 바꿔 주세요" },
      { status: "done", sequence: 2, submittedAt: "2026-11-02T05:00:00.000Z", body: "사진을 밝게" },
      { status: "extra", submittedAt: "2026-11-01T05:00:00.000Z", body: "페이지를 하나 더" },
      { status: "rejected", submittedAt: "2026-10-31T05:00:00.000Z", body: "가격이 얼마예요?" },
    ]} />);
    const list = screen.getByRole("list", { name: "남기신 요청" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent("접수됨");
    expect(items[0]).toHaveTextContent("확인 대기");
    expect(items[0]).toHaveTextContent("11월 3일");
    expect(items[0]).toHaveTextContent("메인 문구를 바꿔 주세요");
    expect(items[1]).toHaveTextContent("반영됨");
    expect(items[1]).toHaveTextContent("수정 완료 2회차");
    expect(items[2]).toHaveTextContent("추가 작업 검토");
    expect(items[3]).toHaveTextContent("반려");
    expect(document.body).not.toHaveTextContent(/extra_scope|pending|rejected/);
  });

  it("남긴 요청이 없거나 모르면 목록을 그리지 않는다", () => {
    const { unmount } = render(<PublicRevisionView title="로고" packageName="Standard" revision={revision} badgeLabel="체험" footnote="안내" onSubmit={vi.fn()} requests={[]} />);
    expect(screen.queryByRole("list", { name: "남기신 요청" })).not.toBeInTheDocument();
    unmount();
    render(<PublicRevisionView title="로고" packageName="Standard" revision={revision} badgeLabel="체험" footnote="안내" onSubmit={vi.fn()} />);
    expect(screen.queryByRole("list", { name: "남기신 요청" })).not.toBeInTheDocument();
  });

  it("접수 뒤 다음에 일어나는 일을 한 줄로 알려 준다", async () => {
    render(<PublicRevisionView title="로고" packageName="Standard" revision={{ included: 3, used: 2, remaining: 1 }} badgeLabel="체험" footnote="안내" onSubmit={vi.fn().mockResolvedValue("used")} />);
    fireEvent.change(screen.getByLabelText("수정 요청 내용"), { target: { value: "글자를 키워주세요" } });
    fireEvent.click(screen.getByRole("button", { name: /요청 남기기/ }));
    await waitFor(() => expect(screen.getByTestId("revision-next-step")).toHaveTextContent("평소 연락하던 방법으로 답해 드려요"));
    expect(screen.getByTestId("revision-next-step")).toHaveTextContent("남은 포함 수정은 1회예요");
    expect(screen.getByRole("status")).toHaveTextContent("포함 수정 1회로 접수됐어요.");
  });

  // 수정 횟수는 접수가 아니라 작업자가 수정을 마칠 때 쓴다. 질문만 하려는 고객이 횟수를 걱정하지 않게 제출 전에 알린다.
  it("제출 전에 '먼저 접수되고 수정을 마치면 1회', 질문·답은 평소 대화창이라고 알려 준다", () => {
    render(<PublicRevisionView title="로고" packageName="Standard" revision={revision} badgeLabel="체험" footnote="안내" onSubmit={vi.fn()} />);
    const notice = screen.getByTestId("revision-how-it-counts");
    expect(notice).toHaveTextContent("먼저 접수되고, 작업자가 수정을 마치면 그때 포함 수정 1회로 세요.");
    expect(notice).toHaveTextContent("질문은 평소 대화창으로 해 주시고, 답도 평소 연락하던 방법으로 드려요.");
    expect(notice).not.toHaveTextContent("접수되는 즉시");
    // 안내는 입력란보다 먼저 나온다.
    expect(notice.compareDocumentPosition(screen.getByLabelText("수정 요청 내용")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each([
    ["포함 수정을 다 쓴 링크", { included: 2, used: 2, remaining: 0 }],
    ["처음부터 포함 수정이 0회인 링크", { included: 0, used: 0, remaining: 0 }],
  ])("%s에서는 제출 전에 추가 작업으로 따로 협의한다고 알려 준다", (_, counts) => {
    render(<PublicRevisionView title="로고" packageName="Standard" revision={counts} badgeLabel="체험" footnote="안내" onSubmit={vi.fn()} />);
    const notice = screen.getByTestId("revision-how-it-counts");
    expect(notice).toHaveTextContent("남은 포함 수정이 없어서, 새 요청은 작업자가 추가 작업으로 따로 협의해요.");
    expect(notice).not.toHaveTextContent("포함 수정 1회로 세요");
  });

  it("확인 대기 건수가 있으면 남은 수정 아래에 보여 주고, 없으면 그리지 않는다", () => {
    const { unmount } = render(<PublicRevisionView title="로고" packageName="Standard" revision={{ ...revision, pending: 2 }} badgeLabel="체험" footnote="안내" onSubmit={vi.fn()} />);
    expect(screen.getByTestId("revision-pending")).toHaveTextContent("확인 대기 2건");
    unmount();
    render(<PublicRevisionView title="로고" packageName="Standard" revision={{ ...revision, pending: 0 }} badgeLabel="체험" footnote="안내" onSubmit={vi.fn()} />);
    expect(screen.queryByTestId("revision-pending")).not.toBeInTheDocument();
  });

  it("아직 받지 못한 시작 전 자료를 이름만 목록으로 보여 주고, 비어 있으면 그리지 않는다", () => {
    const { unmount } = render(<PublicRevisionView title="로고" packageName="Standard" revision={revision} intakePending={["참고 이미지 2~3장", "원하는 색"]} badgeLabel="체험" footnote="안내" onSubmit={vi.fn()} />);
    const intake = screen.getByTestId("revision-intake-pending");
    expect(within(intake).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["참고 이미지 2~3장", "원하는 색"]);
    expect(intake).toHaveTextContent("평소 대화창으로 보내 주세요.");
    unmount();
    render(<PublicRevisionView title="로고" packageName="Standard" revision={revision} intakePending={[]} badgeLabel="체험" footnote="안내" onSubmit={vi.fn()} />);
    expect(screen.queryByTestId("revision-intake-pending")).not.toBeInTheDocument();
  });

  it("지금 서버(확인 대기 영수증)면 '접수했고 수정을 마치면 1회'라고 알려 준다", async () => {
    render(<PublicRevisionView title="로고" packageName="Standard" revision={{ included: 3, used: 1, remaining: 2 }} badgeLabel="체험" footnote="안내" onSubmit={vi.fn().mockResolvedValue("pending")} />);
    fireEvent.change(screen.getByLabelText("수정 요청 내용"), { target: { value: "글자를 키워주세요" } });
    fireEvent.click(screen.getByRole("button", { name: /요청 남기기/ }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("요청을 접수했어요. 작업자가 수정을 마치면 그때 포함 수정 1회로 세요."));
    expect(screen.getByTestId("revision-next-step")).toHaveTextContent("작업자가 요청을 확인하고 평소 연락하던 방법으로 답해 드려요. 남은 포함 수정은 2회예요.");
  });

  it("남은 수정이 없을 때 확인 대기로 접수되면 '1회로 센다'고 약속하지 않고 추가 작업 확인을 먼저 알려 준다", async () => {
    render(<PublicRevisionView title="로고" packageName="Standard" revision={{ included: 1, used: 1, remaining: 0 }} badgeLabel="체험" footnote="안내" onSubmit={vi.fn().mockResolvedValue("pending")} />);
    fireEvent.change(screen.getByLabelText("수정 요청 내용"), { target: { value: "한 번 더 고쳐 주세요" } });
    fireEvent.click(screen.getByRole("button", { name: /요청 남기기/ }));
    await waitFor(() => expect(screen.getByTestId("revision-next-step")).toHaveTextContent("추가 작업으로 진행할지 작업자가 먼저 확인하고 알려 드려요."));
    expect(screen.getByRole("status")).toHaveTextContent("요청을 접수했어요. 남은 포함 수정이 없어서, 추가 작업으로 진행할지 작업자가 먼저 알려 드려요.");
    expect(screen.getByRole("status")).not.toHaveTextContent("포함 수정 1회로 세요");
  });

  it("개인정보 안내는 접어 두되 문구는 그대로 있고, 방침 링크는 늘 보인다", () => {
    render(<PublicRevisionView title="로고" packageName="Standard" revision={revision} badgeLabel="체험" footnote="안내" onSubmit={vi.fn()} />);
    const notice = screen.getByRole("complementary", { name: "개인정보 처리 안내" });
    const details = notice.querySelector("details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");
    expect(details).toHaveTextContent("이름·담당자명(선택), 수정 요청 원문과 접수 시각을 요청 전달·처리 기록 목적으로 저장하며");
    expect(details).toHaveTextContent("민감한 내용은 적지 마세요.");
    expect(screen.getByRole("link", { name: "개인정보처리방침" })).toHaveAttribute("href", "/privacy");
    expect(details?.contains(screen.getByRole("link", { name: "개인정보처리방침" }))).toBe(false);
  });

  // 1번: 납품 뒤 링크를 열면 '사용할 수 없는 링크' 대신 완료 화면.
  it("완료된 일감: 완료 날짜와 '추가 요청은 평소 대화창으로'를 보여 주고, 요청 입력란은 없다", () => {
    render(<PublicRevisionCompleted title="카페 모라 · Standard 홈페이지" packageName="Standard 홈페이지" completedLabel="11월 3일" workerName="열매 디자인" requests={[{ status: "done", sequence: 1, submittedAt: "2026-11-02T05:00:00.000Z", body: "사진을 밝게" }]} />);
    expect(screen.getByRole("heading", { name: "작업이 완료됐어요" })).toBeInTheDocument();
    expect(screen.getByTestId("completed-date")).toHaveTextContent("11월 3일 완료");
    expect(screen.getByTestId("completed-next-step")).toHaveTextContent("추가 요청은 평소 대화창으로");
    expect(screen.getByText("카페 모라 · Standard 홈페이지")).toBeInTheDocument();
    expect(screen.getByTestId("revision-worker")).toHaveTextContent("열매 디자인");
    expect(within(screen.getByRole("list", { name: "남기신 요청" })).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.queryByLabelText("수정 요청 내용")).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("사용할 수 없는 링크");
    expect(document.body).not.toHaveTextContent("새 수정 요청 링크");
  });

  it("완료 날짜를 모르면 날짜 없이 완료 화면을 그린다", () => {
    render(<PublicRevisionCompleted title="로고" packageName="Standard" />);
    expect(screen.getByRole("heading", { name: "작업이 완료됐어요" })).toBeInTheDocument();
    expect(screen.queryByTestId("completed-date")).not.toBeInTheDocument();
  });

  it("꺼진 링크: 다음 행동과 소개 링크를 주고, 자물쇠는 로고 줄과 떨어져 있다", () => {
    render(<PublicRevisionUnavailable message="링크가 꺼졌거나 작업이 완료됐어요." />);
    expect(screen.getByRole("heading", { name: "사용할 수 없는 링크예요" })).toBeInTheDocument();
    expect(screen.getByTestId("unavailable-next-step")).toHaveTextContent("새 수정 요청 링크를 보내 달라고");
    expect(screen.getByRole("link", { name: "일감체크가 무엇인지 보기" })).toHaveAttribute("href", "/");
    const header = document.querySelector(".publicRevisionEmpty > .publicRevisionHeader");
    expect(header?.querySelector("svg.lucide-lock-keyhole")).toBeNull();
    expect(document.querySelector(".publicRevisionEmptyIcon svg")).not.toBeNull();
  });
});
