import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { composeJob, type PackageTemplate } from "@/lib/domain";
import { createStarterState, loadState, saveState } from "@/lib/store";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/notifications", async () => ({
  ...await vi.importActual<typeof import("@/lib/notifications")>("@/lib/notifications"),
  registerIlgamcheckServiceWorker: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/supabase", async () => ({
  ...await vi.importActual<typeof import("@/lib/supabase")>("@/lib/supabase"),
  getHostedRuntimeBoundary: () => ({ requestedMode: "local", configured: false }),
  getSupabaseBrowserClient: () => null,
}));

import { WorkspaceProvider } from "./workspace-provider";
import { JobDetail } from "./job-detail";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const template: PackageTemplate = {
  id: "regression_package", name: "검증 패키지", price: 100_000,
  estimatedCost: 0, durationDays: 10, revisionLimit: 2,
  tasks: [{ taskKey: "brief", title: "브리프 확인", relativeDay: 0, order: 0 }],
};
const job = {
  ...composeJob({ jobId: "regression_job", revisionPortalToken: "regression_token",
    clientLabel: "회귀검증 고객", startDate: "2026-09-28", package: template,
    now: "2026-09-28T00:00:00Z" }),
  links: [{ id: "existing_link", label: "기존 문서", url: "https://example.com/old", kind: "work" as const }],
};
const detail = (id = job.id) => <WorkspaceProvider><JobDetail jobId={id} /></WorkspaceProvider>;

beforeEach(() => {
  Object.defineProperty(window, "localStorage", { configurable: true, value: new MemoryStorage() });
  saveState({ ...createStarterState("2026-09-28"), jobs: [job], jobsCreatedTotal: 1 }, window.localStorage);
});

async function editLinks() {
  render(detail());
  fireEvent.click(await screen.findByRole("button", { name: "편집" }));
  fireEvent.click(screen.getByRole("button", { name: "Figma" }));
}

describe("일감 상세 실제 저장·상태 회귀검사", () => {
  it.each(["figma.com", "not-a-url", "https://", "javascript:alert(1)"])("잘못된 주소 %s를 버리거나 저장 성공으로 안내하지 않는다", async (url) => {
    await editLinks();
    fireEvent.change(screen.getByLabelText("링크 2 주소"), { target: { value: url } });
    fireEvent.click(screen.getByRole("button", { name: "링크 저장" }));
    expect(screen.getByRole("alert")).toHaveTextContent("2번 링크");
    expect(screen.getByLabelText("링크 2 주소")).toHaveValue(url);
    expect(loadState(window.localStorage).jobs[0].links).toEqual(job.links);
    expect(screen.queryByText("작업 링크를 반영했어요. 저장 여부는 상단에서 확인해 주세요.")).not.toBeInTheDocument();
  });

  it("이름이 비어 있으면 기존 링크와 작성 중인 내용을 보존한다", async () => {
    await editLinks();
    fireEvent.change(screen.getByLabelText("링크 2 이름"), { target: { value: "   " } });
    fireEvent.change(screen.getByLabelText("링크 2 주소"), { target: { value: "https://example.com/new" } });
    fireEvent.click(screen.getByRole("button", { name: "링크 저장" }));
    expect(screen.getByRole("alert")).toHaveTextContent("이름");
    expect(screen.getByLabelText("링크 2 주소")).toHaveValue("https://example.com/new");
    expect(loadState(window.localStorage).jobs[0].links).toEqual(job.links);
  });

  it("올바른 링크는 공백을 정리해 저장하고 다시 열어도 유지한다", async () => {
    await editLinks();
    fireEvent.change(screen.getByLabelText("링크 2 이름"), { target: { value: " 새 문서 " } });
    fireEvent.change(screen.getByLabelText("링크 2 주소"), { target: { value: " https://example.com/new " } });
    fireEvent.click(screen.getByRole("button", { name: "링크 저장" }));
    await waitFor(() => expect(loadState(window.localStorage).jobs[0].links).toEqual([
      job.links[0], expect.objectContaining({ label: "새 문서", url: "https://example.com/new" }),
    ]));
    fireEvent.click(screen.getByRole("button", { name: "편집" }));
    expect(screen.getByLabelText("링크 2 주소")).toHaveValue("https://example.com/new");
  });

  it("할 일을 완료하거나 되돌리면 버튼 이름·상태와 저장 데이터가 함께 바뀐다", async () => {
    render(detail());
    fireEvent.click(await screen.findByRole("button", { name: "브리프 확인 완료 처리" }));
    const undo = screen.getByRole("button", { name: "브리프 확인 완료 취소", pressed: true });
    await waitFor(() => expect(loadState(window.localStorage).jobs[0].tasks[0].status).toBe("done"));
    fireEvent.click(undo);
    expect(screen.getByRole("button", { name: "브리프 확인 완료 처리", pressed: false })).toBeInTheDocument();
    await waitFor(() => expect(loadState(window.localStorage).jobs[0].tasks[0].status).toBe("todo"));
  });

  it("저장소를 읽기 전에는 잘못된 누락 안내 대신 로딩을 표시한다", async () => {
    const initial = renderToString(detail());
    expect(initial).not.toContain("일감을 찾을 수 없어요");
    expect(initial).toContain("일감을 불러오고 있어요");
    render(detail());
    expect(await screen.findByText("회귀검증 고객")).toBeInTheDocument();
    expect(screen.queryByText("일감을 찾을 수 없어요")).not.toBeInTheDocument();
  });

  it("저장소를 읽은 뒤에도 없는 일감은 누락 안내를 표시한다", async () => {
    render(detail("does_not_exist"));
    expect(await screen.findByRole("heading", { name: "일감을 찾을 수 없어요" })).toBeInTheDocument();
  });
});
