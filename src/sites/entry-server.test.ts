import { describe, expect, it, vi } from "vitest";
import worker from "./entry-server";

describe("Sites Worker entry", () => {
  it("serves the app shell after an HTML route misses the asset path", async () => {
    const assets = {
      fetch: vi.fn(async (request: Request) => {
        const path = new URL(request.url).pathname;
        return path === "/index.html"
          ? new Response("<html>일감체크</html>", { status: 200 })
          : new Response("not found", { status: 404 });
      }),
    };

    const response = await worker.fetch(
      new Request("https://beta.example.test/jobs/new", { headers: { Accept: "text/html" } }),
      { ASSETS: assets },
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain("일감체크");
    expect(assets.fetch).toHaveBeenCalledTimes(2);
    expect(new URL(assets.fetch.mock.calls[1]?.[0].url).pathname).toBe("/index.html");
  });

  it("preserves a direct app route when the asset service redirects it to the root", async () => {
    const assets = {
      fetch: vi.fn(async (request: Request) => {
        const path = new URL(request.url).pathname;
        return path === "/"
          ? new Response("<html>일감체크</html>", { status: 200 })
          : new Response(null, { status: 307, headers: { Location: "/" } });
      }),
    };

    const response = await worker.fetch(
      new Request("https://beta.example.test/jobs/new", { headers: { Accept: "text/html" } }),
      { ASSETS: assets },
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain("일감체크");
    expect(new URL(assets.fetch.mock.calls[1]?.[0].url).pathname).toBe("/");
  });

  it("fails closed when the health endpoint has no server configuration", async () => {
    const assets = { fetch: vi.fn() };

    const response = await worker.fetch(
      new Request("https://beta.example.test/api/health"),
      { ASSETS: assets },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ status: "misconfigured", ready: false });
    expect(assets.fetch).not.toHaveBeenCalled();
  });

  it("keeps account deletion inside the Worker instead of serving an asset", async () => {
    const assets = { fetch: vi.fn() };
    const response = await worker.fetch(
      new Request("https://beta.example.test/api/account/delete", { method: "POST" }),
      { ASSETS: assets },
    );

    expect(response.status).toBe(403);
    expect(assets.fetch).not.toHaveBeenCalled();
  });
});
