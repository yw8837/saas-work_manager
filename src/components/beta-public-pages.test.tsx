import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BETA_APPLY_COPY_VERSION } from "@/lib/beta/apply-copy";
import { getHostedRuntimeBoundary, getSupabaseBrowserClient } from "@/lib/supabase";
import { BetaApplyForm } from "./beta-apply-form";
import { BetaConfirmView } from "./beta-confirm-view";
import { BetaUnsubscribeView } from "./beta-unsubscribe-view";

vi.mock("@/lib/supabase", async () => {
  const actual = await vi.importActual<typeof import("@/lib/supabase")>("@/lib/supabase");
  return { ...actual, getHostedRuntimeBoundary: vi.fn(actual.getHostedRuntimeBoundary), getSupabaseBrowserClient: vi.fn(() => null) };
});

const TOKEN = "t".repeat(43);
const rpc = vi.fn();

function useHosted() {
  vi.mocked(getHostedRuntimeBoundary).mockReturnValue({ requestedMode: "hosted" } as ReturnType<typeof getHostedRuntimeBoundary>);
  vi.mocked(getSupabaseBrowserClient).mockReturnValue({ rpc } as unknown as ReturnType<typeof getSupabaseBrowserClient>);
}

function useLocal() {
  vi.mocked(getHostedRuntimeBoundary).mockReturnValue({ requestedMode: "local" } as ReturnType<typeof getHostedRuntimeBoundary>);
  vi.mocked(getSupabaseBrowserClient).mockReturnValue(null);
}

function fillRequired() {
  fireEvent.change(screen.getByRole("textbox", { name: /이메일/ }), { target: { value: "Test01@Example.invalid " } });
  fireEvent.click(screen.getByRole("radio", { name: "웹" }));
  fireEvent.click(screen.getByRole("radio", { name: "예" }));
  fireEvent.click(screen.getByRole("radio", { name: "2~3건" }));
  fireEvent.click(screen.getByRole("radio", { name: "베타" }));
}

beforeEach(() => { rpc.mockReset(); });
afterEach(() => { vi.mocked(getHostedRuntimeBoundary).mockReset(); vi.mocked(getSupabaseBrowserClient).mockReset(); });

describe("/apply 신청 화면", () => {
  it("로컬 모드에서는 '미리보기: 실제로 저장되지 않음'을 보여 주고 이름·전화·업체명 칸이 없다", () => {
    useLocal();
    render(<BetaApplyForm />);
    expect(screen.getByRole("note")).toHaveTextContent("미리보기: 실제로 저장되지 않음");
    expect(screen.queryByLabelText(/이름|전화|업체/)).toBeNull();
    expect(screen.getByText(/스튜디오열매/)).toBeInTheDocument();
    expect(screen.getAllByText(/37@studioyeol.com/).length).toBeGreaterThan(0);
  });

  it("[시험표 3] 동의 두 개는 기본값 체크 안 됨, 필수 동의를 거부하면 제출되지 않는다", () => {
    useHosted();
    render(<BetaApplyForm />);
    const privacy = screen.getByRole("checkbox", { name: /개인정보 수집·이용에 동의합니다/ });
    const ad = screen.getByRole("checkbox", { name: /광고성 정보\(이메일\) 수신에 동의합니다/ });
    expect(privacy).not.toBeChecked();
    expect(ad).not.toBeChecked();
    // 보유기간 표 3줄과 거부 권리 안내가 있다.
    expect(screen.getByRole("table")).toHaveTextContent("결과 안내 후 1개월");
    expect(screen.getByRole("table")).toHaveTextContent("인터뷰 후 6개월");
    expect(screen.getByRole("table")).toHaveTextContent("베타 종료 후 6개월");
    expect(screen.getByText(/거부하시면 신청할 수 없습니다/)).toBeInTheDocument();
    fillRequired();
    fireEvent.click(screen.getByRole("button", { name: "신청하기" }));
    expect(screen.getByRole("alert")).toHaveTextContent("[필수] 개인정보 수집·이용에 동의해야 신청할 수 있어요.");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("[시험표 3] 선택 항목·광고 동의 없이도 신청되고, 완료 화면은 신청 내용을 다시 보여 주지 않는다", async () => {
    useHosted();
    rpc.mockResolvedValue({ data: [{ status: "received", ad_event_kind: null, ad_event_at: null, ad_notice_due_at: null }], error: null });
    render(<BetaApplyForm />);
    fillRequired();
    fireEvent.click(screen.getByRole("checkbox", { name: /개인정보 수집·이용에 동의합니다/ }));
    fireEvent.click(screen.getByRole("button", { name: "신청하기" }));
    expect(await screen.findByRole("heading", { name: "신청을 받았어요" })).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith("submit_beta_application", {
      p_email: "Test01@Example.invalid",
      p_work_type: "web",
      p_sells_packages: true,
      p_concurrent_jobs: "2-3",
      p_order_channels: [],
      p_participation: "beta",
      p_privacy_consent: true,
      p_ad_consent: false,
      p_copy_version: BETA_APPLY_COPY_VERSION,
    });
    expect(screen.getByTestId("beta-ad-none")).toHaveTextContent("새로 동의한 내용은 없어요");
    expect(document.body).not.toHaveTextContent(/2~3건|하는 일|웹/);
  });

  it("[시험표 5] 광고 동의 의사표시는 완료 화면에 통지 형식(전송자·의사표시·일자·결과)으로 보이고 '주소 확인 뒤 유효'라고 알린다", async () => {
    useHosted();
    rpc.mockResolvedValue({
      data: [{ status: "received", ad_event_kind: "consent", ad_event_at: "2026-10-31T16:00:00.000Z", ad_notice_due_at: "2026-11-14T16:00:00.000Z" }],
      error: null,
    });
    render(<BetaApplyForm />);
    fillRequired();
    fireEvent.click(screen.getByRole("checkbox", { name: /개인정보 수집·이용에 동의합니다/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /광고성 정보\(이메일\) 수신에 동의합니다/ }));
    fireEvent.click(screen.getByRole("button", { name: "신청하기" }));
    const notice = await screen.findByTestId("beta-ad-notice");
    expect(notice).toHaveTextContent("전송자스튜디오열매");
    expect(notice).toHaveTextContent("의사표시광고성 정보(이메일) 수신 동의");
    expect(notice).toHaveTextContent("일자2026-11-01");
    expect(notice).toHaveTextContent("주소 확인 뒤 유효합니다");
    expect(notice).toHaveTextContent("2026-11-15까지 이메일로도");
  });

  it("호출 제한에 걸리면 성공으로 보여 주지 않는다", async () => {
    useHosted();
    rpc.mockResolvedValue({ data: [{ status: "rate_limited" }], error: null });
    render(<BetaApplyForm />);
    fillRequired();
    fireEvent.click(screen.getByRole("checkbox", { name: /개인정보 수집·이용에 동의합니다/ }));
    fireEvent.click(screen.getByRole("button", { name: "신청하기" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("잠시 뒤 다시 시도해 주세요");
    expect(screen.queryByRole("heading", { name: "신청을 받았어요" })).toBeNull();
  });
});

describe("/u/[token] 수신거부 화면", () => {
  it("[시험표 9] 링크를 열기만 해서는 서버에 처리 요청을 보내지 않는다(보안 스캐너 대비)", () => {
    useHosted();
    render(<BetaUnsubscribeView token={TOKEN} />);
    expect(screen.getByRole("button", { name: "수신거부 / Unsubscribe" })).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("[시험표 6] 로그인 없이 버튼 한 번으로 처리되고, 한글·영문 안내와 처리 결과(전송자·일자)를 보여 준다", async () => {
    useHosted();
    rpc.mockResolvedValue({ data: [{ status: "withdrawn", event_kind: "withdraw", event_at: "2026-11-01T01:00:00.000Z" }], error: null });
    render(<BetaUnsubscribeView token={TOKEN} />);
    expect(screen.getByText(/No login or other information is required/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "수신거부 / Unsubscribe" }));
    const result = await screen.findByTestId("beta-unsubscribe-result");
    expect(rpc).toHaveBeenCalledWith("unsubscribe_beta_ads", { p_token: TOKEN });
    expect(result).toHaveTextContent("수신거부가 처리됐어요");
    expect(result).toHaveTextContent("You have been unsubscribed.");
    expect(result).toHaveTextContent("스튜디오열매");
    expect(result).toHaveTextContent("2026-11-01");
    expect(result).toHaveTextContent("철회가 처리되어 앞으로 광고성 이메일을 보내지 않습니다");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(document.body).not.toHaveTextContent(/@example\.invalid/);
  });

  it("[재검토 3] 화면의 처리 결과 안내는 통지 v1 항목(전송자·의사표시·일자·처리 결과·변경 방법)을 모두 담고, 메일로도 알린다고 말한다", async () => {
    useHosted();
    rpc.mockResolvedValue({ data: [{ status: "withdrawn", event_kind: "withdraw", event_at: "2026-11-01T01:00:00.000Z", email_notice: true }], error: null });
    render(<BetaUnsubscribeView token={TOKEN} />);
    fireEvent.click(screen.getByRole("button", { name: "수신거부 / Unsubscribe" }));
    const notice = await screen.findByRole("region", { name: "광고성 정보 수신거부 처리 결과" });
    for (const label of ["전송자", "의사표시", "일자", "처리 결과", "변경 방법"]) expect(notice).toHaveTextContent(label);
    expect(notice).toHaveTextContent("신청 페이지에서 광고 수신에 다시 체크");
    expect(screen.getByTestId("beta-unsubscribe-email-notice")).toHaveTextContent("이메일로도 알려 드려요");
  });

  it("[재검토 3] 주소가 이미 정리돼 메일을 보낼 수 없으면, 이 화면이 처리 결과 안내라고 정확히 알린다", async () => {
    useHosted();
    rpc.mockResolvedValue({ data: [{ status: "withdrawn", event_kind: "withdraw", event_at: "2026-11-01T01:00:00.000Z", email_notice: false }], error: null });
    render(<BetaUnsubscribeView token={TOKEN} />);
    fireEvent.click(screen.getByRole("button", { name: "수신거부 / Unsubscribe" }));
    const line = await screen.findByTestId("beta-unsubscribe-email-notice");
    expect(line).toHaveTextContent("이 화면이 처리 결과 안내예요");
    expect(line).not.toHaveTextContent("이메일로도 알려 드려요");
    expect(screen.getByRole("region", { name: "광고성 정보 수신거부 처리 결과" })).toHaveTextContent("철회가 처리되어");
  });

  it("[시험표 8] 다시 누른 링크는 '이미 처리됨'과 처음 날짜를 그대로 보여 준다", async () => {
    useHosted();
    rpc.mockResolvedValue({ data: [{ status: "already", event_kind: "withdraw", event_at: "2026-10-30T01:00:00.000Z" }], error: null });
    render(<BetaUnsubscribeView token={TOKEN} />);
    fireEvent.click(screen.getByRole("button", { name: "수신거부 / Unsubscribe" }));
    const result = await screen.findByTestId("beta-unsubscribe-result");
    expect(result).toHaveTextContent("이미 수신거부가 처리돼 있어요");
    expect(result).toHaveTextContent("2026-10-30");
  });

  it("[시험표 8] 무효 링크는 처리되지 않았다고 분명히 말하고 대체 창구(메일 회신)를 준다", async () => {
    useHosted();
    rpc.mockResolvedValue({ data: [{ status: "invalid", event_kind: null, event_at: null }], error: null });
    render(<BetaUnsubscribeView token={TOKEN} />);
    fireEvent.click(screen.getByRole("button", { name: "수신거부 / Unsubscribe" }));
    const result = await screen.findByTestId("beta-unsubscribe-result");
    expect(result).toHaveAttribute("data-status", "invalid");
    expect(result).toHaveTextContent("수신거부는 처리되지 않았어요");
    expect(result).toHaveTextContent("You have NOT been unsubscribed.");
    expect(screen.getByTestId("beta-unsubscribe-fallback")).toHaveTextContent("37@studioyeol.com");
    expect(result).not.toHaveTextContent("수신거부가 처리됐어요");
  });

  it("[시험표 8] 형식이 틀린 링크는 서버에 묻지 않고 바로 안내한다, 서버 오류도 성공으로 보이지 않는다", async () => {
    useHosted();
    render(<BetaUnsubscribeView token="short" />);
    expect(screen.getByTestId("beta-unsubscribe-result")).toHaveAttribute("data-status", "invalid");
    expect(rpc).not.toHaveBeenCalled();

    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    render(<BetaUnsubscribeView token={TOKEN} />);
    fireEvent.click(screen.getByRole("button", { name: "수신거부 / Unsubscribe" }));
    await waitFor(() => expect(screen.getAllByTestId("beta-unsubscribe-result")[1]).toHaveAttribute("data-status", "error"));
    expect(screen.getAllByTestId("beta-unsubscribe-result")[1]).toHaveTextContent("처리되지 않았어요");
  });
});

describe("/apply/confirm/[token] 주소 확인 화면", () => {
  it("[시험표 9][시험표 12] 열기만 해서는 확인되지 않고, 본인이 아니면 거부·삭제 방법을 안내한다", async () => {
    useHosted();
    rpc.mockResolvedValue({ data: [{ status: "confirmed", ad_active: true }], error: null });
    render(<BetaConfirmView token={TOKEN} />);
    expect(rpc).not.toHaveBeenCalled();
    expect(screen.getByRole("region", { name: "본인이 신청하지 않았다면" })).toHaveTextContent("수신거부 링크");
    fireEvent.click(screen.getByRole("button", { name: "주소 확인하기" }));
    expect(await screen.findByTestId("beta-confirm-result")).toHaveTextContent("광고성 정보(이메일) 수신 동의가 유효해졌어요");
    expect(rpc).toHaveBeenCalledWith("confirm_beta_email", { p_token: TOKEN });
  });

  it.each([
    ["네트워크 오류", { data: null, error: { message: "network" } }],
    ["호출 제한", { data: [{ status: "rate_limited", ad_active: false }], error: null }],
  ])("[리뷰 4] %s 뒤에도 새로고침 없이 다시 눌러 확인할 수 있다", async (_label, firstResponse) => {
    useHosted();
    rpc.mockResolvedValueOnce(firstResponse).mockResolvedValueOnce({ data: [{ status: "confirmed", ad_active: true }], error: null });
    render(<BetaConfirmView token={TOKEN} />);
    fireEvent.click(screen.getByRole("button", { name: "주소 확인하기" }));
    expect(await screen.findByTestId("beta-confirm-result")).toHaveTextContent("지금은 처리하지 못했어요");
    fireEvent.click(screen.getByRole("button", { name: "다시 확인하기" }));
    expect(await screen.findByText("광고성 정보(이메일) 수신 동의가 유효해졌어요. 언제든 메일의 수신거부 링크로 철회할 수 있어요.")).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("[시험표 8] 만료된 확인 링크는 처리하지 않았다고 알린다", async () => {
    useHosted();
    rpc.mockResolvedValue({ data: [{ status: "expired", ad_active: false }], error: null });
    render(<BetaConfirmView token={TOKEN} />);
    fireEvent.click(screen.getByRole("button", { name: "주소 확인하기" }));
    const result = await screen.findByTestId("beta-confirm-result");
    expect(result).toHaveTextContent("확인 기간이 지난 링크예요");
    expect(result).toHaveTextContent("처리하지 않았어요");
  });
});
