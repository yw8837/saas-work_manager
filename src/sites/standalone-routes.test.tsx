import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WorkspaceProvider } from "@/components/workspace-provider";
import { isStandaloneRoutePath } from "./routes";
import { SiteShell } from "./site-shell";

vi.mock("@/components/workspace-provider", async () => {
  const actual = await vi.importActual<typeof import("@/components/workspace-provider")>("@/components/workspace-provider");
  return { ...actual, WorkspaceProvider: vi.fn(() => null) };
});

describe("Sites 공개 단독 경로", () => {
  afterEach(() => {
    vi.mocked(WorkspaceProvider).mockClear();
    window.history.pushState({}, "", "/");
  });

  it("설명서와 체험 링크만 작업공간 없이 그린다", () => {
    expect(isStandaloneRoutePath("/guide")).toBe(true);
    expect(isStandaloneRoutePath("/demo/r")).toBe(true);
    expect(isStandaloneRoutePath("/demo/r/")).toBe(true);
    expect(isStandaloneRoutePath("/r/demo")).toBe(false);
    expect(isStandaloneRoutePath("/today")).toBe(false);
    expect(isStandaloneRoutePath("/")).toBe(false);
  });

  it("/demo/r 에서는 Supabase 세션·Realtime을 여는 WorkspaceProvider를 띄우지 않는다", () => {
    window.history.pushState({}, "", "/demo/r");
    render(<SiteShell />);
    expect(screen.getByRole("note")).toHaveTextContent("체험용 예시 화면이에요");
    expect(WorkspaceProvider).not.toHaveBeenCalled();
  });

  it("/guide 에서도 WorkspaceProvider를 띄우지 않는다", () => {
    window.history.pushState({}, "", "/guide");
    render(<SiteShell />);
    expect(screen.getByRole("heading", { level: 1, name: "그림으로 보는 일감체크" })).toBeInTheDocument();
    expect(screen.getAllByRole("img")).toHaveLength(6);
    expect(WorkspaceProvider).not.toHaveBeenCalled();
  });

  it("그 밖의 경로는 지금처럼 WorkspaceProvider 안에서 그린다", () => {
    window.history.pushState({}, "", "/today");
    render(<SiteShell />);
    expect(WorkspaceProvider).toHaveBeenCalled();
  });
});
