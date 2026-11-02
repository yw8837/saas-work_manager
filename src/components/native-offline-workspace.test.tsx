import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { NativeOfflineWorkspace } from "./native-offline-workspace";
vi.mock("@/lib/native/offline", () => ({
  loadNativeOfflineSnapshot: async () => ({
    confirmedAt: "2026-10-21T00:00:00Z", totalJobs: 1,
    jobs: [{ id: "a", clientLabel: "테스트 고객", title: "테스트 고객 · 디자인", dueDate: "2026-10-25",
      doneTasks: 2, totalTasks: 4, remainingRevisions: 1, tasks: ["시안 전달"] }],
  }),
}));
it("offers read-only last-confirmed data and reconnect, never write or success controls", async () => {
  render(<NativeOfflineWorkspace />);
  expect(await screen.findByText("테스트 고객")).toBeInTheDocument();
  expect(screen.getByText(/읽기 전용/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "연결 다시 확인" })).toBeInTheDocument();
  expect(screen.queryByText("저장됨")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "완료 처리" })).not.toBeInTheDocument();
});
it("고객 이름 아래에 같은 이름을 또 보여 주지 않는다", async () => {
  render(<NativeOfflineWorkspace />);
  expect(await screen.findByText("디자인")).toBeInTheDocument();
  expect(screen.queryByText("테스트 고객 · 디자인")).not.toBeInTheDocument();
});
