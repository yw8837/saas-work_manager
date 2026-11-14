import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import HomePage from "@/app/page";
import TryPage from "@/app/try/page";
import { ClarityNotice } from "./clarity";
import { MarketingHome } from "./marketing-home";
import { TryTour } from "./try-tour";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("방문 기록 도구 안내 한 줄", () => {
  it("프로젝트 ID가 있으면 해요체 한 줄과 개인정보처리방침 링크를 보인다", () => {
    vi.stubEnv("NEXT_PUBLIC_CLARITY_PROJECT_ID", "testproject1");
    render(<ClarityNotice />);
    const notice = screen.getByTestId("clarity-notice");
    expect(notice).toHaveTextContent("이 화면은 개선을 위해 방문 기록 도구(Microsoft Clarity)를 써요. 브라우저에서 추적 거부(GPC·DNT)를 켜면 쓰지 않아요. 개인정보처리방침");
    expect(within(notice).getByRole("link", { name: "개인정보처리방침" })).toHaveAttribute("href", "/privacy");
  });

  it.each(["", "Bad-ID"])("프로젝트 ID가 없거나 형식이 틀리면(%j) 그리지 않는다", (value) => {
    vi.stubEnv("NEXT_PUBLIC_CLARITY_PROJECT_ID", value);
    const { container } = render(<ClarityNotice />);
    expect(container).toBeEmptyDOMElement();
  });

  it("메인 화면 바닥글 안에 들어간다", () => {
    vi.stubEnv("NEXT_PUBLIC_CLARITY_PROJECT_ID", "testproject1");
    const { container } = render(<HomePage />);
    const footer = container.querySelector("footer.marketingFooter");
    expect(footer).not.toBeNull();
    expect(within(footer as HTMLElement).getByTestId("clarity-notice")).toBeInTheDocument();
  });

  it("둘러보기 화면 바닥글 안에 들어간다", () => {
    vi.stubEnv("NEXT_PUBLIC_CLARITY_PROJECT_ID", "testproject1");
    const { container } = render(<TryPage />);
    const footer = container.querySelector("footer.guideFooter");
    expect(footer).not.toBeNull();
    expect(within(footer as HTMLElement).getByTestId("clarity-notice")).toBeInTheDocument();
  });

  it("Sites·앱 경로처럼 안내를 넘기지 않으면 메인·둘러보기 컴포넌트에도 없다", () => {
    vi.stubEnv("NEXT_PUBLIC_CLARITY_PROJECT_ID", "testproject1");
    render(<><MarketingHome /><TryTour /></>);
    expect(screen.queryByTestId("clarity-notice")).not.toBeInTheDocument();
  });
});

describe("Clarity를 붙이는 곳은 메인·둘러보기 두 페이지뿐이다", () => {
  const SRC = resolve(process.cwd(), "src");
  const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });

  it("ClarityLoader·불러오기 코드를 쓰는 소스 파일이 정해진 곳 밖에 없다", () => {
    const users = files(SRC)
      .filter((path) => /\.(ts|tsx)$/.test(path) && !/\.test\.(ts|tsx)$/.test(path))
      .filter((path) => /ClarityLoader|startClarityOnPage|@\/lib\/clarity"|\.\/clarity"/.test(readFileSync(path, "utf8")))
      .map((path) => relative(SRC, path).replace(/\\/g, "/"))
      .sort();
    expect(users).toEqual(["app/page.tsx", "app/try/page.tsx", "components/clarity.tsx", "lib/clarity.ts"]);
  });
});
