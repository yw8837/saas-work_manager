import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { applyIndustryStarter, createStarterState, type AppSettings } from "@/lib/store";
import { PackageManager } from "./package-manager";
import { useWorkspace } from "./workspace-provider";

vi.mock("./workspace-provider", async () => ({
  ...await vi.importActual("./workspace-provider"), useWorkspace: vi.fn(),
}));

const updateSettings = vi.fn();
const savePackage = vi.fn();
const saveOption = vi.fn();
const archivePackage = vi.fn();

function mockWorkspace(settings: Partial<AppSettings> = {}) {
  const state = createStarterState("2026-11-02");
  vi.mocked(useWorkspace).mockReturnValue({
    packages: state.packages,
    options: state.options,
    settings: { ...state.settings, ...settings },
    updateSettings,
    savePackage,
    archivePackage,
    saveOption,
    archiveOption: vi.fn(),
    canCreatePackage: true,
    canCreateOption: true,
    limits: { packages: 3, options: 3 },
  } as unknown as ReturnType<typeof useWorkspace>);
}

beforeEach(() => {
  updateSettings.mockReset();
  savePackage.mockReset();
  // 제공자는 실제로 목록에 반영했을 때만 true를 돌려준다.
  savePackage.mockReturnValue(true);
  saveOption.mockReset();
  archivePackage.mockReset();
  mockWorkspace();
});

describe("패키지 화면 쉬운 말", () => {
  it("패키지 편집에 '할 일 추가' 버튼과 '시작 며칠 뒤' 머리글이 있다", () => {
    const view = render(<PackageManager />);
    expect(screen.getByRole("button", { name: "할 일 추가" })).toBeInTheDocument();
    expect(screen.getByText("시작 며칠 뒤")).toBeInTheDocument();
    expect(screen.getByText("자동으로 만들 할 일")).toBeInTheDocument();
    expect(screen.getByLabelText("할 일 1 이름")).toBeInTheDocument();
    expect(screen.getByText(/새 일감에 자동으로 채워져요/)).toBeInTheDocument();
    expect(view.container).not.toHaveTextContent(/Todo|합성|상대 기한/);
    // 화면 낭독기가 읽는 이름도 쉬운 말로 쓴다('카탈로그' 대신).
    expect(screen.getByRole("tablist", { name: "패키지·옵션" })).toBeInTheDocument();
  });

  it("옵션 편집도 할 일 말로 보인다", () => {
    const view = render(<PackageManager />);
    fireEvent.click(screen.getByRole("tab", { name: /옵션/ }));
    expect(screen.getByText("할 일 변화")).toBeInTheDocument();
    expect(view.container).not.toHaveTextContent(/Todo|합성|상대 기한/);
  });

  it("옵션의 '할 일 제거'는 개발용 키를 적는 칸 대신 패키지 할 일 이름 목록에서 뺄 할 일을 고른다", () => {
    const view = render(<PackageManager />);
    fireEvent.click(screen.getByRole("tab", { name: /옵션/ }));
    fireEvent.click(screen.getByRole("button", { name: /고객 디자인 제공/ }));
    const select = screen.getByLabelText("뺄 할 일") as HTMLSelectElement;
    expect(select.tagName).toBe("SELECT");
    // 예시 옵션은 디자인 할 일을 뺀다. 웹 예시 세 패키지의 디자인 할 일 이름이 보인다.
    expect(select.selectedOptions[0].textContent).toContain("메인 디자인 공유");
    expect(view.container).not.toHaveTextContent(/할 일 키|`design`/);
    fireEvent.change(select, { target: { value: "launch" } });
    fireEvent.click(screen.getByTestId("save-option"));
    expect(saveOption).toHaveBeenCalledWith(expect.objectContaining({ taskDeltas: [{ kind: "remove", taskKey: "launch" }] }));
  });
});

describe("한 건에 최소 남길 돈", () => {
  it("기준이 없으면 경고가 없고, 맨 위 한 줄의 '정하기'로 칸을 열어 저장한다", () => {
    render(<PackageManager />);
    expect(screen.queryByTestId(/margin-warning/)).not.toBeInTheDocument();
    expect(screen.getByTestId("min-margin-row")).toHaveTextContent("한 건에 최소 남길 돈");
    expect(screen.queryByTestId("min-margin-input")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("min-margin-open"));
    const input = screen.getByTestId("min-margin-input");
    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(screen.getByText("비우면 알리지 않아요")).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "700000" } });
    expect(input).toHaveValue("700,000");
    fireEvent.click(screen.getByTestId("min-margin-save"));
    expect(updateSettings).toHaveBeenCalledWith({ minMarginPerJob: 700000 });
    expect(screen.queryByTestId("min-margin-input")).not.toBeInTheDocument();
  });

  it("기준이 700,000원이면 덜 남는 패키지에만 한 줄로 알리고, 저장은 막지 않는다", () => {
    mockWorkspace({ minMarginPerJob: 700000 });
    render(<PackageManager />);
    expect(screen.getByTestId("min-margin-row")).toHaveTextContent("한 건에 최소 남길 돈 700,000원");
    // 참고 예시는 기본 질문이 묻으니 받을 자료 예시 글에는 넣지 않는다.
    expect(screen.getByTestId("package-intake-items").getAttribute("placeholder")).toBe("예: 로고에 넣을 상호명·영문 표기\n로고 원본 파일(있으면)");
    // Basic 홈페이지: 790,000원 − 예상 원가 95,000원 = 695,000원
    // 편집 중인 패키지는 '예상 원가' 칸 바로 아래에만 알린다(화면마다 한 줄).
    expect(screen.getByTestId("package-edit-margin-warning")).toHaveTextContent("남는 돈 695,000원 · 내 기준보다 5,000원 적어요");
    expect(screen.queryByTestId("package-margin-warning-pkg_basic_homepage")).not.toBeInTheDocument();
    expect(screen.queryByTestId("package-margin-warning-pkg_standard_homepage")).not.toBeInTheDocument();
    expect(screen.queryByTestId("package-margin-warning-pkg_deluxe_homepage")).not.toBeInTheDocument();
    // 다른 패키지를 고르면 덜 남는 패키지는 목록에서 알린다.
    fireEvent.click(screen.getByRole("button", { name: /Standard 홈페이지/ }));
    expect(screen.getByTestId("package-margin-warning-pkg_basic_homepage")).toHaveTextContent("남는 돈 695,000원 · 내 기준보다 5,000원 적어요");
    expect(screen.queryByTestId("package-edit-margin-warning")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Basic 홈페이지/ }));
    fireEvent.click(screen.getByTestId("save-package"));
    expect(savePackage).toHaveBeenCalledTimes(1);
    expect(document.body).not.toHaveTextContent(/시세|권장|받으세요/);
  });

  it("칸을 비우고 저장하면 기준을 지운다", () => {
    mockWorkspace({ minMarginPerJob: 700000 });
    render(<PackageManager />);
    fireEvent.click(screen.getByTestId("min-margin-open"));
    const input = screen.getByTestId("min-margin-input");
    expect(input).toHaveValue("700,000");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.click(screen.getByTestId("min-margin-save"));
    expect(updateSettings).toHaveBeenCalledWith({ minMarginPerJob: undefined });
  });

  it("'예상 원가' 칸은 0원이면 비워 두고 흐린 예시 글 '예: 플랫폼 수수료, 외주비'를 보인다", () => {
    render(<PackageManager />);
    const cost = screen.getByLabelText("예상 원가 (원)");
    expect(cost).toHaveAttribute("placeholder", "예: 플랫폼 수수료, 외주비");
    // 예시 Basic 홈페이지는 원가 95,000원이 쉼표를 넣어 그대로 보인다.
    expect(cost).toHaveValue("95,000");
    // 새 패키지(원가 0원)는 숫자 0 대신 예시 글이 보이게 칸을 비운다. 비운 칸은 0원으로 저장한다.
    fireEvent.click(screen.getByRole("button", { name: "새 패키지" }));
    const fresh = screen.getByLabelText("예상 원가 (원)");
    expect(fresh).toHaveValue("");
    fireEvent.click(screen.getByTestId("save-package"));
    expect(savePackage).toHaveBeenCalledWith(expect.objectContaining({ estimatedCost: 0 }));
  });
});

describe("패키지 삭제", () => {
  it("'보관' 대신 '패키지 삭제' 버튼이 보이고, 확인하면 목록에서 뺀다", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<PackageManager />);
    expect(screen.queryByRole("button", { name: "보관" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "패키지 삭제" }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("이미 만든 일감"));
    expect(archivePackage).toHaveBeenCalledTimes(1);
    confirm.mockRestore();
  });
});

describe("저장 안 한 변경", () => {
  it("금액을 바꾸고 다른 패키지를 누르면 확인을 받고, 취소하면 고치던 값이 그대로 남는다", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<PackageManager />);
    const price = screen.getByLabelText("기본 금액 (원)");
    fireEvent.change(price, { target: { value: "450000" } });
    expect(screen.getByTestId("package-unsaved")).toHaveTextContent("저장 안 한 변경이 있어요");
    // 고치는 중에도 제목은 고치는 패키지 이름이다('새 패키지 만들기'가 아니다).
    expect(screen.getByRole("heading", { level: 2, name: "Basic 홈페이지" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Standard 홈페이지/ }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("저장하지 않은 변경"));
    expect(screen.getByLabelText("기본 금액 (원)")).toHaveValue("450,000");
    confirm.mockRestore();
  });

  it("확인하면 변경을 버리고 다른 패키지로 간다", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<PackageManager />);
    fireEvent.change(screen.getByLabelText("기본 금액 (원)"), { target: { value: "450000" } });
    fireEvent.click(screen.getByRole("button", { name: /Standard 홈페이지/ }));
    expect(screen.getByLabelText("패키지 이름")).toHaveValue("Standard 홈페이지");
    expect(screen.queryByTestId("package-unsaved")).not.toBeInTheDocument();
    confirm.mockRestore();
  });

  it("바꾼 게 없으면 다른 패키지를 눌러도 묻지 않는다", () => {
    const confirm = vi.spyOn(window, "confirm");
    render(<PackageManager />);
    fireEvent.click(screen.getByRole("button", { name: /Standard 홈페이지/ }));
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it("변경이 있으면 다른 화면 링크를 누를 때 확인을 받고, 취소하면 이동을 막는다", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const link = document.createElement("a");
    link.href = "/today";
    link.textContent = "오늘";
    document.body.appendChild(link);
    render(<PackageManager />);
    fireEvent.change(screen.getByLabelText("기본 금액 (원)"), { target: { value: "450000" } });
    const allowed = fireEvent.click(link);
    expect(confirm).toHaveBeenCalled();
    expect(allowed).toBe(false);
    link.remove();
    confirm.mockRestore();
  });

  it("변경이 있으면 탭을 닫을 때 브라우저가 묻게 한다(beforeunload)", () => {
    render(<PackageManager />);
    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
    fireEvent.change(screen.getByLabelText("기본 금액 (원)"), { target: { value: "450000" } });
    const dirty = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });

  it("저장하면 '저장 안 한 변경'이 사라지고, 저장 알림은 저장 버튼 바로 옆에 뜬다", () => {
    render(<PackageManager />);
    fireEvent.change(screen.getByLabelText("기본 금액 (원)"), { target: { value: "450000" } });
    fireEvent.click(screen.getByTestId("save-package"));
    expect(savePackage).toHaveBeenCalledWith(expect.objectContaining({ price: 450000 }));
    expect(screen.queryByTestId("package-unsaved")).not.toBeInTheDocument();
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("패키지 조건을 저장했어요");
    // 맨 위 머리글이 아니라 저장 버튼과 같은 줄에 있어야 휴대폰에서도 보인다.
    expect(status.closest(".catalogActions")).toContainElement(screen.getByTestId("save-package"));
    expect(status.closest(".catalogHeader")).toBeNull();
  });
});

describe("금액 칸 쉼표", () => {
  it("기본 금액·예상 원가는 쉼표를 넣어 보이고 숫자로 저장한다", () => {
    render(<PackageManager />);
    const price = screen.getByLabelText("기본 금액 (원)");
    expect(price).toHaveValue("790,000");
    expect(price).toHaveAttribute("inputmode", "numeric");
    fireEvent.change(price, { target: { value: "1,234,567" } });
    expect(price).toHaveValue("1,234,567");
    fireEvent.click(screen.getByTestId("save-package"));
    expect(savePackage).toHaveBeenCalledWith(expect.objectContaining({ price: 1234567 }));
  });
});

describe("착수 전 질문", () => {
  it("질문마다 입력 칸 하나, '질문 추가'로 늘리고 5개면 더 못 늘린다. 저장은 지금 형식(글 목록) 그대로", () => {
    render(<PackageManager />);
    const box = screen.getByTestId("package-brief-questions");
    // 예시 Basic 홈페이지는 기본 질문 3개가 들어 있다.
    expect(within(box).getAllByRole("textbox")).toHaveLength(3);
    expect(within(box).getByLabelText("착수 전 질문 1")).toHaveValue("이 작업으로 가장 하고 싶은 일은 무엇인가요? (예: 예약 받기, 가게 소개)");
    const add = within(box).getByRole("button", { name: "질문 추가" });
    fireEvent.click(add);
    // 칸 하나 = 질문 하나라 줄바꿈 글자는 띄어쓰기로 바꾼다(두 질문처럼 보이지 않게).
    fireEvent.change(within(box).getByLabelText("착수 전 질문 4"), { target: { value: "오픈 날짜가\n정해져 있나요?" } });
    expect(within(box).getByLabelText("착수 전 질문 4")).toHaveValue("오픈 날짜가 정해져 있나요?");
    fireEvent.click(add);
    expect(within(box).getAllByRole("textbox")).toHaveLength(5);
    expect(add).toBeDisabled();
    fireEvent.click(within(box).getByRole("button", { name: "착수 전 질문 5 삭제" }));
    expect(within(box).getAllByRole("textbox")).toHaveLength(4);
    fireEvent.click(screen.getByTestId("save-package"));
    const saved = savePackage.mock.calls[0][0];
    expect(saved.briefQuestions).toHaveLength(4);
    expect(saved.briefQuestions[3]).toBe("오픈 날짜가 정해져 있나요?");
  });
});

describe("업종 예시를 바꾼 뒤 연 패키지 화면(2026-11-11 점검 문제 1)", () => {
  // 화면은 저장본을 불러오기 전(기본 예시)으로 먼저 그려지고, 불러온 뒤 업종 예시(앞 예시는 보관됨)로 바뀐다.
  function showDesignStarter(view: ReturnType<typeof render>) {
    const seed = createStarterState("2026-11-02");
    const design = { ...seed, ...applyIndustryStarter(seed, "design", { packages: 3, options: 3 }, "2026-11-02T00:00:00.000Z") };
    const current = vi.mocked(useWorkspace).mock.results.at(-1)!.value as ReturnType<typeof useWorkspace>;
    vi.mocked(useWorkspace).mockReturnValue({ ...current, packages: design.packages, options: design.options });
    view.rerender(<PackageManager />);
    return design;
  }

  it("목록에 없는(보관된) 예전 패키지를 편집 칸에 남기지 않고 목록 첫 패키지로 맞춘다", () => {
    const view = render(<PackageManager />);
    expect(screen.getByLabelText("패키지 이름")).toHaveValue("Basic 홈페이지");
    const design = showDesignStarter(view);
    const live = design.packages.filter((item) => !item.archivedAt);
    expect(live.map((item) => item.name)).not.toContain("Basic 홈페이지");
    expect(screen.getByLabelText("패키지 이름")).toHaveValue(live[0].name);
    expect(screen.getByRole("heading", { level: 2, name: live[0].name })).toBeInTheDocument();
  });

  it("그대로 '패키지 저장'을 누르면 목록에 있는 패키지를 저장하고, 보관된 패키지를 보내지 않는다", () => {
    const view = render(<PackageManager />);
    const design = showDesignStarter(view);
    fireEvent.click(screen.getByTestId("save-package"));
    const saved = savePackage.mock.calls[0][0];
    expect(design.packages.filter((item) => !item.archivedAt).map((item) => item.id)).toContain(saved.id);
    expect(saved.archivedAt).toBeUndefined();
  });

  it("옵션 편집 칸도 목록에 있는 옵션으로 맞춘다", () => {
    const view = render(<PackageManager />);
    const design = showDesignStarter(view);
    fireEvent.click(screen.getByRole("tab", { name: /옵션/ }));
    const liveOptions = design.options.filter((item) => !item.archivedAt);
    expect(screen.getByLabelText("옵션 이름")).toHaveValue(liveOptions[0].name);
  });

  it("실제로 저장되지 않으면 '저장했어요'를 띄우지 않고 저장하지 못했다고 알린다", () => {
    savePackage.mockReturnValue(false);
    render(<PackageManager />);
    fireEvent.change(screen.getByLabelText("기본 금액 (원)"), { target: { value: "450000" } });
    fireEvent.click(screen.getByTestId("save-package"));
    expect(screen.queryByText(/저장했어요/)).not.toBeInTheDocument();
    expect(screen.getByTestId("package-save-error")).toHaveTextContent("패키지를 저장하지 못했어요");
    // 고치던 내용은 그대로 남아 다시 저장할 수 있다.
    expect(screen.getByLabelText("기본 금액 (원)")).toHaveValue("450,000");
    expect(screen.getByTestId("package-unsaved")).toBeInTheDocument();
  });
});
