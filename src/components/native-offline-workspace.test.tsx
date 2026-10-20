import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { NativeOfflineWorkspace } from "./native-offline-workspace";
vi.mock("@/lib/native/offline", () => ({
  loadNativeOfflineSnapshot: async () => ({
    confirmedAt: "2026-10-21T00:00:00Z", totalJobs: 1,
    jobs: [{ id: "a", clientLabel: "테스트 고객", title: "디자인", dueDate: "2026-10-25",
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
