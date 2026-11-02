import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createStarterState, type AppSettings } from "@/lib/store";
import { PackageManager } from "./package-manager";
import { useWorkspace } from "./workspace-provider";

vi.mock("./workspace-provider", async () => ({
  ...await vi.importActual("./workspace-provider"), useWorkspace: vi.fn(),
}));

const updateSettings = vi.fn();
const savePackage = vi.fn();

function mockWorkspace(settings: Partial<AppSettings> = {}) {
  const state = createStarterState("2026-11-02");
  vi.mocked(useWorkspace).mockReturnValue({
    packages: state.packages,
    options: state.options,
    settings: { ...state.settings, ...settings },
    updateSettings,
    savePackage,
    archivePackage: vi.fn(),
    saveOption: vi.fn(),
    archiveOption: vi.fn(),
    canCreatePackage: true,
    canCreateOption: true,
    limits: { packages: 3, options: 3 },
  } as unknown as ReturnType<typeof useWorkspace>);
}

beforeEach(() => {
  updateSettings.mockReset();
  savePackage.mockReset();
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
    // Basic 홈페이지: 790,000원 − 예상 원가 95,000원 = 695,000원
    expect(screen.getByTestId("package-margin-warning-pkg_basic_homepage")).toHaveTextContent("남는 돈 695,000원 · 내 기준보다 5,000원 적어요");
    expect(screen.queryByTestId("package-margin-warning-pkg_standard_homepage")).not.toBeInTheDocument();
    expect(screen.queryByTestId("package-margin-warning-pkg_deluxe_homepage")).not.toBeInTheDocument();
    // 편집 중인 패키지는 '예상 원가' 칸 바로 아래에도 알린다.
    expect(screen.getByTestId("package-edit-margin-warning")).toHaveTextContent("남는 돈 695,000원 · 내 기준보다 5,000원 적어요");
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
});
