import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { AppSettings } from "@/lib/store";
import { FeeRateSettings } from "./fee-rate-settings";
import { useWorkspace } from "./workspace-provider";

vi.mock("./workspace-provider", async () => ({
  ...await vi.importActual("./workspace-provider"), useWorkspace: vi.fn(),
}));

const updateSettings = vi.fn();
function mockSettings(settings: Partial<AppSettings> = {}) {
  vi.mocked(useWorkspace).mockReturnValue({ settings, updateSettings } as unknown as ReturnType<typeof useWorkspace>);
}

beforeEach(() => {
  updateSettings.mockReset();
  mockSettings();
});

it("받은 곳 다섯 칸이 전부 비어 있고, 내 계약 기준으로 적으라는 안내만 둔다(비율을 지어내 넣지 않음)", () => {
  render(<FeeRateSettings />);
  const labels = ["크몽", "숨고", "소개", "직접 문의", "기타"];
  for (const label of labels) expect(screen.getByLabelText(`${label} 떼이는 비율(%)`)).toHaveValue("");
  expect(screen.getByTestId("fee-rate-section")).toHaveTextContent("내 계약·정산 내역 기준으로 적어 주세요");
  // 세금(원천징수 등)은 다루지 않는다.
  expect(screen.getByTestId("fee-rate-section")).not.toHaveTextContent(/3\.3|원천|세금/);
  expect(updateSettings).not.toHaveBeenCalled();
});

it("소수점 한 자리까지 0~100을 받아 칸을 떠날 때 저장하고, 빈칸은 그 받은 곳의 비율을 지운다", () => {
  mockSettings({ feeRates: { soomgo: 10 } });
  render(<FeeRateSettings />);
  expect(screen.getByLabelText("숨고 떼이는 비율(%)")).toHaveValue("10");

  const kmong = screen.getByLabelText("크몽 떼이는 비율(%)");
  fireEvent.change(kmong, { target: { value: "15.5" } });
  fireEvent.blur(kmong);
  expect(updateSettings).toHaveBeenLastCalledWith({ feeRates: { soomgo: 10, kmong: 15.5 } });

  const soomgo = screen.getByLabelText("숨고 떼이는 비율(%)");
  fireEvent.change(soomgo, { target: { value: "" } });
  fireEvent.blur(soomgo);
  expect(updateSettings).toHaveBeenLastCalledWith({ feeRates: {} });
});

it.each(["101", "15.55", "-1", "abc", "20%"])("'%s'는 저장하지 않고 고칠 방법을 알린다", (value) => {
  render(<FeeRateSettings />);
  const kmong = screen.getByLabelText("크몽 떼이는 비율(%)");
  fireEvent.change(kmong, { target: { value } });
  fireEvent.blur(kmong);
  expect(updateSettings).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("0~100 사이 숫자로, 소수점 한 자리까지 적어 주세요.");
  expect(kmong).toHaveAttribute("aria-invalid", "true");
});

it("값이 그대로면 다시 저장하지 않는다", () => {
  mockSettings({ feeRates: { kmong: 20 } });
  render(<FeeRateSettings />);
  const kmong = screen.getByLabelText("크몽 떼이는 비율(%)");
  fireEvent.change(kmong, { target: { value: "20.0" } });
  fireEvent.blur(kmong);
  expect(updateSettings).not.toHaveBeenCalled();
});
