import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WorkspaceProvider } from "@/components/workspace-provider";
import worker from "./entry-server";
import { isStandaloneRoutePath } from "./routes";
import { SiteShell } from "./site-shell";

vi.mock("@/components/workspace-provider", async () => {
  const actual = await vi.importActual<typeof import("@/components/workspace-provider")>("@/components/workspace-provider");
  return { ...actual, WorkspaceProvider: vi.fn(() => null) };
});

const TOKEN = "t".repeat(43);

describe("Sites 셸: 베타 신청·확인·수신거부·운영자 경로", () => {
  afterEach(() => {
    vi.mocked(WorkspaceProvider).mockClear();
    window.history.pushState({}, "", "/");
  });

  it("네 경로는 단독 경로이고, 비슷한 다른 경로는 아니다", () => {
    for (const path of ["/apply", "/apply/", `/apply/confirm/${TOKEN}`, `/u/${TOKEN}`, "/ops/applications"]) {
      expect(isStandaloneRoutePath(path)).toBe(true);
    }
    for (const path of ["/apply/confirm", `/apply/confirm/${TOKEN}/x`, "/u", `/u/${TOKEN}/x`, "/ops", "/ops/other", "/r/abc"]) {
      expect(isStandaloneRoutePath(path)).toBe(false);
    }
  });

  it.each([
    ["/apply", "일감체크 인터뷰·베타 신청"],
    [`/apply/confirm/${TOKEN}`, "이메일 주소 확인"],
    [`/u/${TOKEN}`, "광고성 이메일 수신거부"],
  ])("%s 는 WorkspaceProvider 없이 그린다", (path, heading) => {
    window.history.pushState({}, "", path);
    render(<SiteShell />);
    expect(screen.getByRole("heading", { level: 1, name: heading })).toBeInTheDocument();
    expect(WorkspaceProvider).not.toHaveBeenCalled();
  });

  it("/ops/applications 도 WorkspaceProvider 없이 그린다", async () => {
    window.history.pushState({}, "", "/ops/applications");
    render(<SiteShell />);
    expect(await screen.findByRole("heading", { level: 1, name: "베타 신청 운영" })).toBeInTheDocument();
    expect(WorkspaceProvider).not.toHaveBeenCalled();
  });

  it.each([
    [`/apply/confirm/${TOKEN}`, "noindex, nofollow, noarchive"],
    [`/u/${TOKEN}`, "noindex, nofollow, noarchive"],
    ["/ops/applications", "noindex, nofollow, noarchive"],
    ["/apply", null],
  ])("Worker가 %s HTML에 검색 차단 헤더(%s)를 붙인다", async (path, robots) => {
    const response = await worker.fetch(
      new Request(`https://beta.example.test${path}`, { headers: { Accept: "text/html" } }),
      {
        ASSETS: {
          fetch: async (request) => new URL(request.url).pathname === "/app-shell.payload"
            ? new Response("<html><head></head><body>일감체크</body></html>")
            : new Response("not found", { status: 404 }),
        },
        NEXT_PUBLIC_STORAGE_MODE: "hosted",
      },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-robots-tag")).toBe(robots);
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await response.text()).not.toContain(TOKEN);
  });
});
