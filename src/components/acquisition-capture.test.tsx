import { render } from "@testing-library/react";
import { usePathname } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PENDING_ACQUISITION_KEY } from "@/lib/acquisition-link";

import { AcquisitionCapture } from "./acquisition-capture";

vi.mock("next/navigation", () => ({ usePathname: vi.fn(() => "/") }));

const mockedPathname = vi.mocked(usePathname);

describe("AcquisitionCapture", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState(null, "", "/");
    mockedPathname.mockReturnValue("/");
  });

  it("처음 열 때 주소의 유입 표시를 받아 두고 주소에서 지운다", () => {
    window.history.replaceState(null, "", "/try?utm_source=mail&utm_medium=email&utm_campaign=cold-w1");
    mockedPathname.mockReturnValue("/try");
    render(<AcquisitionCapture />);
    expect(JSON.parse(window.sessionStorage.getItem(PENDING_ACQUISITION_KEY) ?? "null")).toEqual({ source: "mail", medium: "email", campaign: "cold-w1" });
    expect(window.location.search).toBe("");
  });

  it("화면 안에서 다른 화면으로 넘어온 뒤에도 유입 표시를 받는다(고객 화면의 소개 링크)", () => {
    window.history.replaceState(null, "", "/r/some-link");
    mockedPathname.mockReturnValue("/r/some-link");
    const view = render(<AcquisitionCapture />);
    expect(window.sessionStorage.getItem(PENDING_ACQUISITION_KEY)).toBeNull();

    // 새로 여는 것이 아니라 같은 문서 안에서 주소만 바뀐다.
    window.history.pushState(null, "", "/?utm_source=client-link&utm_medium=referral&utm_campaign=revision-page");
    mockedPathname.mockReturnValue("/");
    view.rerender(<AcquisitionCapture />);

    expect(JSON.parse(window.sessionStorage.getItem(PENDING_ACQUISITION_KEY) ?? "null")).toEqual({ source: "client-link", medium: "referral", campaign: "revision-page" });
    expect(window.location.search).toBe("");
  });
});
