import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PublicRevisionUnavailable, PublicRevisionView } from "./public-revision-view";

const revision = { included: 3, used: 1, remaining: 2 };

describe("고객 링크 화면", () => {
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

  it("값을 받으면 작업자 이름·마감·진행 단계 칩(지금 단계 글자 표시)을 그린다", () => {
    render(<PublicRevisionView title="로고" packageName="Standard" revision={revision} workerName="샘플 스튜디오" dueLabel="5일 남음" stage={1} badgeLabel="체험" footnote="안내" onSubmit={vi.fn()} />);
    expect(screen.getByTestId("revision-worker")).toHaveTextContent("샘플 스튜디오");
    expect(screen.getByTestId("revision-due")).toHaveTextContent("5일 남음");
    const steps = screen.getAllByRole("listitem");
    expect(steps.map((item) => item.getAttribute("data-state"))).toEqual(["done", "current", "todo", "todo"]);
    expect(steps[1]).toHaveAttribute("aria-current", "step");
    expect(steps[1]).toHaveTextContent("시안 확인지금");
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
