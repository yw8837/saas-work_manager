import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createSeedState } from "@/lib/store";
import { PublicRevisionForm } from "./public-revision-form";
import { useWorkspace } from "./workspace-provider";

vi.mock("./workspace-provider", async () => {
  const actual = await vi.importActual<typeof import("./workspace-provider")>("./workspace-provider");
  return { ...actual, useWorkspace: vi.fn() };
});

vi.mock("@/lib/supabase", async () => {
  const actual = await vi.importActual<typeof import("@/lib/supabase")>("@/lib/supabase");
  return {
    ...actual,
    getHostedRuntimeBoundary: () => ({ requestedMode: "local", configured: false }),
    getSupabaseBrowserClient: () => null,
  };
});

const seed = createSeedState("2026-08-16");

function mountWith(jobs: typeof seed.jobs, token: string) {
  vi.mocked(useWorkspace).mockReturnValue({
    jobs,
    hydrated: true,
    recordPublicRevision: vi.fn(),
  } as unknown as ReturnType<typeof useWorkspace>);
  return render(<PublicRevisionForm token={token} />);
}

describe("PublicRevisionForm 로컬 모드 안내", () => {
  it("이 브라우저에 없는 링크는 '꺼졌다'가 아니라 기기 문제라고 말한다", () => {
    mountWith([], "token_from_another_device");

    // 고객에게 "링크가 꺼졌다"고 하면 작업자에게 헛된 확인 요청이 간다.
    expect(screen.getByText(/작업자 기기에 저장된 일감을 여는 주소/)).toBeInTheDocument();
    expect(screen.queryByText(/링크가 꺼졌거나/)).not.toBeInTheDocument();
  });

  it("링크를 실제로 끈 경우에는 꺼졌다고 말한다", () => {
    const job = { ...seed.jobs[0], revisionPortalToken: "token_off", revisionPortalEnabled: false };
    mountWith([job], "token_off");

    expect(screen.getByText(/링크가 꺼졌거나/)).toBeInTheDocument();
  });
});
