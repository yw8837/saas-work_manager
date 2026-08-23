import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSeedState } from "@/lib/store";
import { FeedbackPanel, buildFeedbackFormUrl, buildFeedbackPlainText, jobCountBucket } from "./feedback-panel";
import { useWorkspace } from "./workspace-provider";

vi.mock("./workspace-provider", () => ({ useWorkspace: vi.fn() }));

const FORM_URL = "https://docs.google.com/forms/d/e/TEST_FORM_ID/viewform";
const seed = createSeedState("2026-08-16");
const workspace = { ...seed } as unknown as ReturnType<typeof useWorkspace>;

/** 시드 워크스페이스에 실제로 들어 있는 고객·일감 데이터. 어디에도 새어 나가면 안 된다. */
const WORKSPACE_SECRETS = [
  "모라스튜디오",
  "담다상점",
  "김담당",
  "demo-mora-revision",
  "demo-damda-revision",
  "Standard 홈페이지",
  "Deluxe 홈페이지",
  "1290000",
  "1890000",
  "example.com/reference",
];

const writeText = vi.fn<(text: string) => Promise<void>>();

function useForm() {
  vi.stubEnv("NEXT_PUBLIC_FEEDBACK_FORM_URL", FORM_URL);
  vi.stubEnv("NEXT_PUBLIC_FEEDBACK_ENTRY_TYPE", "111");
  vi.stubEnv("NEXT_PUBLIC_FEEDBACK_ENTRY_SCREEN", "222");
  vi.stubEnv("NEXT_PUBLIC_FEEDBACK_ENTRY_USAGE", "333");
  vi.stubEnv("NEXT_PUBLIC_FEEDBACK_ENTRY_SCALE", "444");
  vi.stubEnv("NEXT_PUBLIC_FEEDBACK_ENTRY_PRICE", "555");
  vi.stubEnv("NEXT_PUBLIC_FEEDBACK_ENTRY_FOUNDER", "666");
}

beforeEach(() => {
  vi.mocked(useWorkspace).mockReturnValue(workspace);
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("FeedbackPanel rendering", () => {
  it("renders the price questions with the no-personal-info warning", () => {
    render(<FeedbackPanel />);

    expect(screen.getByRole("heading", { level: 1, name: "쓰면서 느낀 점을 알려주세요" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /제보 유형/ })).toBeInTheDocument();
    expect(screen.getByLabelText(/어떤 화면인가요/)).toBeInTheDocument();
    expect(screen.getByLabelText(/자세한 내용/)).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /얼마나 쓰셨나요/ })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /가장 적절한 월 구독료/ })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /9,900원에 12개월/ })).toBeInTheDocument();
    expect(screen.getByLabelText(/연락받을 이메일/)).toBeInTheDocument();
    expect(screen.getByText("고객 이름이나 연락처 같은 개인정보는 적지 말아주세요.")).toBeInTheDocument();
  });

  it("switches to the exit-survey framing without becoming a second page", () => {
    render(<FeedbackPanel mode="exit" />);

    expect(screen.getByRole("heading", { level: 1, name: "왜 그만두시나요?" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "다른 도구를 쓰게 돼서" })).toBeInTheDocument();
  });

  it("degrades gracefully with a copy button when no form URL is configured", () => {
    render(<FeedbackPanel />);

    expect(screen.getByTestId("feedback-form-missing")).toHaveTextContent("접수 폼을 아직 연결하지 않았어요");
    expect(screen.getByTestId("feedback-copy")).toBeInTheDocument();
    expect(screen.queryByTestId("feedback-open-form")).not.toBeInTheDocument();
  });

  it("opens the configured Google Form in a new tab with a safe rel", () => {
    useForm();
    render(<FeedbackPanel />);

    const link = screen.getByTestId("feedback-open-form");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link.getAttribute("href")).toContain("usp=pp_url");
  });
});

describe("FeedbackPanel required-field validation", () => {
  it("blocks copying until 자세한 내용 is filled in", async () => {
    render(<FeedbackPanel />);

    fireEvent.click(screen.getByTestId("feedback-copy"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("자세한 내용을 적어주세요"));
    expect(writeText).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/자세한 내용/), { target: { value: "마감 지난 일감이 위로 안 올라와요." } });
    fireEvent.click(screen.getByTestId("feedback-copy"));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("blocks opening the form until 자세한 내용 is filled in", async () => {
    useForm();
    render(<FeedbackPanel />);

    fireEvent.click(screen.getByTestId("feedback-open-form"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("자세한 내용을 적어주세요"));
    expect(writeText).not.toHaveBeenCalled();
  });
});

describe("FeedbackPanel 접수 폼 복사 안내", () => {
  function fillDetail() {
    fireEvent.change(screen.getByLabelText(/자세한 내용/), { target: { value: "마감 알림이 안 와요." } });
  }

  it("복사가 실패하면 복사했다고 말하지 않고 페이지에 남아 있다고 알린다", async () => {
    useForm();
    // HTTPS가 아니거나 권한이 거절되면 실제로 이렇게 실패한다.
    writeText.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    render(<FeedbackPanel />);

    fillDetail();
    fireEvent.click(screen.getByTestId("feedback-open-form"));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("복사는 못 했어요");
    expect(alert).toHaveTextContent("이 페이지에 그대로 있으니");
    expect(alert.textContent ?? "").not.toContain("붙여넣기만 하면 돼요");
  });

  it("복사에 성공했을 때만 붙여넣으라고 안내한다", async () => {
    useForm();
    render(<FeedbackPanel />);

    fillDetail();
    fireEvent.click(screen.getByTestId("feedback-open-form"));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("status")).toHaveTextContent("붙여넣기만 하면 돼요");
  });
});

describe("FeedbackPanel usage-scale opt-in", () => {
  it("defaults the opt-in checkbox to OFF and states that nothing is sent", () => {
    render(<FeedbackPanel />);

    expect(screen.getByTestId("feedback-share-scale")).not.toBeChecked();
    expect(screen.getByTestId("feedback-scale-preview")).toHaveTextContent("지금은 보내지 않아요");
  });

  it("shows the exact bucket value and only adds it to the link once opted in", () => {
    useForm();
    render(<FeedbackPanel />);

    const bucket = jobCountBucket(seed.jobs.length);
    expect(screen.getByTestId("feedback-scale-preview")).toHaveTextContent(`일감 수 구간 = ${bucket}`);
    expect(screen.getByTestId("feedback-open-form").getAttribute("href")).not.toContain("entry.444");

    fireEvent.click(screen.getByTestId("feedback-share-scale"));

    expect(screen.getByTestId("feedback-share-scale")).toBeChecked();
    expect(screen.getByTestId("feedback-open-form").getAttribute("href")).toContain(
      `entry.444=${encodeURIComponent(bucket)}`,
    );
  });
});

describe("FeedbackPanel data boundary", () => {
  it("keeps every workspace and job value out of the generated link and copied text", async () => {
    useForm();
    render(<FeedbackPanel />);

    fireEvent.click(screen.getByRole("radio", { name: "안 되는 기능" }));
    fireEvent.change(screen.getByLabelText(/어떤 화면인가요/), { target: { value: "일감" } });
    fireEvent.change(screen.getByLabelText(/자세한 내용/), { target: { value: "목록 정렬이 이상해요." } });
    fireEvent.click(screen.getByRole("radio", { name: "한 달 미만" }));
    fireEvent.change(screen.getByLabelText(/연락받을 이메일/), { target: { value: "me@example.test" } });
    fireEvent.click(screen.getByTestId("feedback-share-scale"));
    fireEvent.click(screen.getByTestId("feedback-open-form"));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const href = screen.getByTestId("feedback-open-form").getAttribute("href") ?? "";
    const copied = writeText.mock.calls[0][0];

    for (const secret of WORKSPACE_SECRETS) {
      expect(href).not.toContain(secret);
      expect(copied).not.toContain(secret);
    }

    // 자유 서술과 이메일은 링크에 절대 실리지 않는다.
    expect(href).not.toContain("목록 정렬이 이상해요");
    expect(href).not.toContain("me%40example.test");
    expect(href).not.toContain("me@example.test");

    // 링크에 실리는 것은 고른 항목 네 가지뿐이다.
    const params = new URL(href).searchParams;
    expect([...params.keys()].sort()).toEqual(["entry.111", "entry.222", "entry.333", "entry.444", "usp"]);

    // 복사되는 텍스트는 사용자가 직접 고르고 적은 값뿐이다.
    expect(copied).toContain("목록 정렬이 이상해요.");
    expect(copied).toContain("me@example.test");
  });
});

describe("feedback link and text builders", () => {
  const base = {
    type: "불편한 점",
    screen: "일감",
    detail: "정렬이 이상해요",
    usage: "한 달 미만",
    email: "me@example.test",
    shareScale: false,
    scaleBucket: "6-20건",
    priceFit: "",
    founderIntent: "",
  };

  it("returns null when no form URL is configured", () => {
    expect(buildFeedbackFormUrl("", { type: "1", screen: "2", usage: "3", scale: "4", price: "", founder: "" }, base)).toBeNull();
    expect(buildFeedbackFormUrl("   ", { type: "1", screen: "2", usage: "3", scale: "4", price: "", founder: "" }, base)).toBeNull();
  });

  it("refuses non-https destinations", () => {
    expect(
      buildFeedbackFormUrl("http://docs.google.com/forms/x", { type: "1", screen: "2", usage: "3", scale: "4", price: "", founder: "" }, base),
    ).toBeNull();
  });

  it("accepts entry ids written with or without the entry. prefix", () => {
    const href = buildFeedbackFormUrl(FORM_URL, { type: "entry.111", screen: "222", usage: "", scale: "", price: "", founder: "" }, base) ?? "";
    const params = new URL(href).searchParams;
    expect(params.get("entry.111")).toBe("불편한 점");
    expect(params.get("entry.222")).toBe("일감");
    expect([...params.keys()]).not.toContain("entry.entry.111");
  });

  it("buckets job counts without revealing the exact number", () => {
    expect(jobCountBucket(0)).toBe("0건");
    expect(jobCountBucket(5)).toBe("1-5건");
    expect(jobCountBucket(6)).toBe("6-20건");
    expect(jobCountBucket(21)).toBe("21건+");
  });

  it("omits optional answers from the plain text when they are empty", () => {
    const text = buildFeedbackPlainText({ ...base, screen: "", usage: "", email: "" }, "general");
    expect(text).not.toContain("화면:");
    expect(text).not.toContain("사용 기간:");
    expect(text).not.toContain("회신 이메일:");
    expect(text).not.toContain("사용 규모");
    expect(text).toContain("자세한 내용: 정렬이 이상해요");
  });

  it("prefills price answers but keeps free text and email out of the link", () => {
    const answers = {
      ...base,
      priceFit: "14,900원",
      founderIntent: "계속 사용",
    };
    const href = buildFeedbackFormUrl(
      FORM_URL,
      { type: "1", screen: "2", usage: "3", scale: "4", price: "555", founder: "666" },
      answers,
    ) ?? "";
    const params = new URL(href).searchParams;

    expect(params.get("entry.555")).toBe("14,900원");
    expect(params.get("entry.666")).toBe("계속 사용");
    expect(href).not.toContain(encodeURIComponent(answers.detail));
    expect(href).not.toContain(encodeURIComponent(answers.email));
    expect(buildFeedbackPlainText(answers, "general")).toContain("가격 적정성: 14,900원");
  });
});
