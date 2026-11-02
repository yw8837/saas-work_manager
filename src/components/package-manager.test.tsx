import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createStarterState } from "@/lib/store";
import { PackageManager } from "./package-manager";
import { useWorkspace } from "./workspace-provider";

vi.mock("./workspace-provider", async () => ({
  ...await vi.importActual("./workspace-provider"), useWorkspace: vi.fn(),
}));

beforeEach(() => {
  const state = createStarterState("2026-11-02");
  vi.mocked(useWorkspace).mockReturnValue({
    packages: state.packages,
    options: state.options,
    savePackage: vi.fn(),
    archivePackage: vi.fn(),
    saveOption: vi.fn(),
    archiveOption: vi.fn(),
    canCreatePackage: true,
    canCreateOption: true,
    limits: { packages: 3, options: 3 },
  } as unknown as ReturnType<typeof useWorkspace>);
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
