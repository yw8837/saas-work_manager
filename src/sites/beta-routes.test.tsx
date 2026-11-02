import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WorkspaceProvider } from "@/components/workspace-provider";
import { deploymentOrigin } from "@/lib/deployment-origin";
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
    // [리뷰 3] 끝에 / 가 붙어도 화면은 같은 경로로 열리므로 검색 차단도 같아야 한다.
    [`/apply/confirm/${TOKEN}/`, "noindex, nofollow, noarchive"],
    [`/u/${TOKEN}/`, "noindex, nofollow, noarchive"],
    [`/u/${TOKEN}//`, "noindex, nofollow, noarchive"],
    ["/ops/applications/", "noindex, nofollow, noarchive"],
    ["/r/customer-token/", "noindex, nofollow, noarchive"],
    ["/apply/", null],
  ])("Worker가 %s HTML에 검색 차단 헤더(%s)를 붙인다", async (path, robots) => {
    // 운영 주소 기준으로 본다. 운영 주소가 아닌 호스트는 공개 화면도 검색에서 뺀다(아래 시험).
    const response = await worker.fetch(
      new Request(`${deploymentOrigin()}${path}`, { headers: { Accept: "text/html" } }),
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

  it("운영 주소가 아닌 호스트(workers.dev·옛 주소)에서는 공개 화면 /apply도 검색에서 뺀다", async () => {
    const response = await worker.fetch(
      new Request("https://beta.example.test/apply", { headers: { Accept: "text/html" } }),
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
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });
});
