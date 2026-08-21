"use client";

import { ClipboardCopy, ExternalLink, ShieldCheck } from "lucide-react";
import { useState, type MouseEvent } from "react";
import { useWorkspace } from "./workspace-provider";

export type FeedbackMode = "general" | "exit";

export type FeedbackAnswers = {
  type: string;
  screen: string;
  detail: string;
  usage: string;
  email: string;
  shareScale: boolean;
  scaleBucket: string;
};

export type FeedbackEntryIds = {
  type: string;
  screen: string;
  usage: string;
  scale: string;
};

const MODE_COPY = {
  general: {
    eyebrow: "베타 사용자 의견",
    title: "쓰면서 느낀 점을 알려주세요",
    lead: "고르는 데 1분이면 충분해요. 개인정보는 하나도 받지 않아요.",
    typeLabel: "제보 유형",
    typeOptions: ["불편한 점", "안 되는 기능", "있었으면 하는 기능", "그냥 사용 후기", "기타"],
    detailHint: "어떤 상황이었는지 편하게 적어주세요",
    submitLabel: "의견 보내기",
  },
  exit: {
    eyebrow: "그만두기 전에 한 가지만",
    title: "왜 그만두시나요?",
    lead: "붙잡으려는 게 아니에요. 뭐가 안 맞았는지만 알려주시면 다음 사람에게 도움이 돼요.",
    typeLabel: "그만두는 이유",
    typeOptions: ["기대한 기능이 없어서", "쓰기 불편해서", "다른 도구를 쓰게 돼서", "지금은 맡은 일감이 없어서", "기타"],
    detailHint: "어떤 점이 아쉬웠는지 적어주세요",
    submitLabel: "이유 보내기",
  },
} as const;

const SCREEN_OPTIONS = ["오늘", "일감", "새 일감", "패키지·옵션", "설정", "고객 수정 링크", "기타"];
const USAGE_OPTIONS = ["오늘 처음", "일주일 미만", "한 달 미만", "한 달 이상"];

export function jobCountBucket(count: number): string {
  if (count <= 0) return "0건";
  if (count <= 5) return "1-5건";
  if (count <= 20) return "6-20건";
  return "21건+";
}

function normalizeEntryId(raw: string): string {
  return raw.trim().replace(/^entry\./, "");
}

/**
 * 구글 폼 공식 프리필 규칙(`?usp=pp_url&entry.XXXX=`)만 사용한다.
 * 자유 서술(자세한 내용)과 이메일은 개인정보가 섞일 수 있어 절대 URL에 넣지 않는다.
 */
export function buildFeedbackFormUrl(
  formUrl: string,
  entryIds: FeedbackEntryIds,
  answers: FeedbackAnswers,
): string | null {
  const trimmed = formUrl.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;

  url.searchParams.set("usp", "pp_url");

  const prefills: Array<[string, string]> = [
    [entryIds.type, answers.type],
    [entryIds.screen, answers.screen],
    [entryIds.usage, answers.usage],
    [entryIds.scale, answers.shareScale ? answers.scaleBucket : ""],
  ];
  for (const [rawId, value] of prefills) {
    const id = normalizeEntryId(rawId ?? "");
    if (!id || !value) continue;
    url.searchParams.set(`entry.${id}`, value);
  }

  return url.toString();
}

/** 사용자가 직접 고르고 적은 값만 담는다. 작업공간·일감 데이터는 담지 않는다. */
export function buildFeedbackPlainText(answers: FeedbackAnswers, mode: FeedbackMode): string {
  const lines = [
    `[일감체크 베타 · ${mode === "exit" ? "그만두는 이유" : "의견 보내기"}]`,
    `${MODE_COPY[mode].typeLabel}: ${answers.type}`,
  ];
  if (answers.screen) lines.push(`화면: ${answers.screen}`);
  lines.push(`자세한 내용: ${answers.detail.trim()}`);
  if (answers.usage) lines.push(`사용 기간: ${answers.usage}`);
  if (answers.email.trim()) lines.push(`회신 이메일: ${answers.email.trim()}`);
  if (answers.shareScale && answers.scaleBucket) {
    lines.push(`사용 규모(일감 수 구간): ${answers.scaleBucket}`);
  }
  return lines.join("\n");
}

function feedbackFormUrl(): string {
  return process.env.NEXT_PUBLIC_FEEDBACK_FORM_URL ?? "";
}

function feedbackEntryIds(): FeedbackEntryIds {
  return {
    type: process.env.NEXT_PUBLIC_FEEDBACK_ENTRY_TYPE ?? "",
    screen: process.env.NEXT_PUBLIC_FEEDBACK_ENTRY_SCREEN ?? "",
    usage: process.env.NEXT_PUBLIC_FEEDBACK_ENTRY_USAGE ?? "",
    scale: process.env.NEXT_PUBLIC_FEEDBACK_ENTRY_SCALE ?? "",
  };
}

async function copyToClipboard(text: string): Promise<boolean> {
  const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
  if (!clipboard?.writeText) return false;
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function FeedbackPanel({ mode = "general" }: { mode?: FeedbackMode }) {
  const { jobs } = useWorkspace();
  const copy = MODE_COPY[mode];

  const [type, setType] = useState<string>(copy.typeOptions[0]);
  const [screen, setScreen] = useState("");
  const [detail, setDetail] = useState("");
  const [usage, setUsage] = useState("");
  const [email, setEmail] = useState("");
  const [shareScale, setShareScale] = useState(false);
  const [status, setStatus] = useState<{ kind: "error" | "done"; message: string } | null>(null);

  const scaleBucket = jobCountBucket(jobs.length);
  const answers: FeedbackAnswers = { type, screen, detail, usage, email, shareScale, scaleBucket };
  const plainText = buildFeedbackPlainText(answers, mode);
  const formHref = buildFeedbackFormUrl(feedbackFormUrl(), feedbackEntryIds(), answers);

  const invalid = detail.trim().length === 0;

  const handleCopy = async () => {
    if (invalid) {
      setStatus({ kind: "error", message: "자세한 내용을 적어주세요. 이 항목만 필수예요." });
      return;
    }
    const copied = await copyToClipboard(plainText);
    setStatus(
      copied
        ? { kind: "done", message: "적어주신 내용을 복사했어요. 접수 폼이나 메일에 그대로 붙여넣으면 돼요." }
        : { kind: "error", message: "복사하지 못했어요. 아래 미리보기에서 직접 선택해 복사해주세요." },
    );
  };

  const handleOpenForm = async (event: MouseEvent<HTMLAnchorElement>) => {
    if (invalid) {
      event.preventDefault();
      setStatus({ kind: "error", message: "자세한 내용을 적어주세요. 이 항목만 필수예요." });
      return;
    }
    // 복사 성공을 단정하면 붙여넣을 게 없는 채로 탭만 옮기게 된다. 결과를 확인하고 말한다.
    const copied = await copyToClipboard(plainText);
    setStatus(
      copied
        ? {
            kind: "done",
            message: "새 탭에서 접수 폼을 열었어요. 적어주신 내용은 복사해뒀으니 붙여넣기만 하면 돼요.",
          }
        : {
            kind: "error",
            message:
              "새 탭에서 접수 폼을 열었지만 복사는 못 했어요. 적어주신 내용은 이 페이지에 그대로 있으니, 탭을 옮기기 전에 아래 미리보기에서 직접 선택해 복사해주세요.",
          },
    );
  };

  return (
    <div className="pageSurface feedbackPage">
      <header className="pageHeader">
        <div>
          <span className="pageEyebrow">{copy.eyebrow}</span>
          <h1>{copy.title}</h1>
          <p>{copy.lead}</p>
        </div>
      </header>

      <aside className="feedbackPrivacySection" aria-label="수집 범위 안내">
        <span className="feedbackPrivacyIcon"><ShieldCheck size={20} /></span>
        <div>
          <span className="sectionMiniLabel">우리가 받는 것</span>
          <h2>개인정보는 받지 않아요</h2>
          <p>
            이름·전화번호·주소는 묻지 않아요. 작업 중인 고객명·금액·수정 요청 내용·링크는 자동으로 붙지 않고,
            아래에서 직접 고르고 적으신 답변만 전달돼요. 추적 스크립트나 분석 도구도 쓰지 않아요.
          </p>
        </div>
      </aside>

      <div className="feedbackForm">
        <section className="contentSection feedbackSection">
          <fieldset>
            <legend className="fieldLabel">
              1. {copy.typeLabel}
              <span>가장 가까운 것 하나만 골라주세요</span>
            </legend>
            <div className="feedbackChoices">
              {copy.typeOptions.map((option) => (
                <label className="feedbackChoice" key={option} data-selected={type === option}>
                  <input
                    type="radio"
                    name="feedbackType"
                    value={option}
                    checked={type === option}
                    onChange={() => setType(option)}
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </section>

        <section className="contentSection feedbackSection">
          <label className="fieldLabel" htmlFor="feedback-screen">
            2. 어떤 화면인가요 <em>선택</em>
            <span>화면이 특정되지 않으면 비워두셔도 돼요</span>
          </label>
          <select id="feedback-screen" value={screen} onChange={(event) => setScreen(event.target.value)}>
            <option value="">고르지 않음</option>
            {SCREEN_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </section>

        <section className="contentSection feedbackSection">
          <label className="fieldLabel" htmlFor="feedback-detail">
            3. 자세한 내용
            <span>{copy.detailHint}</span>
          </label>
          <textarea
            id="feedback-detail"
            rows={7}
            maxLength={2000}
            value={detail}
            aria-required="true"
            aria-invalid={invalid && status?.kind === "error" ? true : undefined}
            aria-describedby="feedback-detail-warning"
            placeholder={"예: 마감이 지난 일감이 목록 위로 올라오지 않아서 놓쳤어요.\n고객 이름이나 연락처 같은 개인정보는 적지 말아주세요."}
            onChange={(event) => setDetail(event.target.value)}
          />
          <p className="feedbackWarning" id="feedback-detail-warning">
            <ShieldCheck size={14} /> 고객 이름이나 연락처 같은 개인정보는 적지 말아주세요.
          </p>
        </section>

        <section className="contentSection feedbackSection">
          <fieldset>
            <legend className="fieldLabel">
              4. 얼마나 쓰셨나요 <em>선택</em>
              <span>답하지 않으셔도 보낼 수 있어요</span>
            </legend>
            <div className="feedbackChoices">
              {USAGE_OPTIONS.map((option) => (
                <label className="feedbackChoice" key={option} data-selected={usage === option}>
                  <input
                    type="radio"
                    name="feedbackUsage"
                    value={option}
                    checked={usage === option}
                    onChange={() => setUsage(option)}
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </section>

        <section className="contentSection feedbackSection">
          <label className="fieldLabel" htmlFor="feedback-email">
            5. 연락받을 이메일 <em>선택</em>
            <span>답변을 받고 싶으면 적어주세요. 안 적으셔도 접수돼요</span>
          </label>
          <input
            id="feedback-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            maxLength={160}
            value={email}
            placeholder="비워두셔도 괜찮아요"
            onChange={(event) => setEmail(event.target.value)}
          />
        </section>

        <section className="contentSection feedbackSection">
          <label className="settingRow feedbackOptIn">
            <span>
              <strong>제품 개선을 위해 사용 규모(일감 수 구간)를 함께 보낼게요</strong>
              <small>기본값은 꺼짐이에요. 켜야만 아래 값 하나가 추가돼요.</small>
            </span>
            <input
              type="checkbox"
              checked={shareScale}
              data-testid="feedback-share-scale"
              onChange={(event) => setShareScale(event.target.checked)}
            />
          </label>
          <p className="feedbackOptInValue" data-testid="feedback-scale-preview">
            보낼 값: <b>일감 수 구간 = {scaleBucket}</b>
            <span>{shareScale ? " (이 값만 추가돼요)" : " · 지금은 보내지 않아요"}</span>
          </p>
        </section>
      </div>

      <details className="feedbackPreview">
        <summary>보낼 내용 그대로 보기</summary>
        <pre data-testid="feedback-preview">{plainText}</pre>
      </details>

      <section className="feedbackActionsSection" aria-label="보내기">
        {formHref ? (
          <>
            <p className="feedbackTransmitNote">
              링크에는 고르신 항목(제보 유형·화면·사용 기간{shareScale ? "·일감 수 구간" : ""})만 담겨요.
              적으신 내용과 이메일은 링크에 넣지 않고 복사해 드릴 테니, 열린 폼에 붙여넣어 주세요.
            </p>
            <div className="feedbackActions">
              <a
                className="primaryButton"
                href={formHref}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="feedback-open-form"
                onClick={(event) => void handleOpenForm(event)}
              >
                <ExternalLink size={17} /> {copy.submitLabel}
              </a>
              <button type="button" className="quietButton" onClick={() => void handleCopy()} data-testid="feedback-copy">
                <ClipboardCopy size={16} /> 내용 복사하기
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="feedbackTransmitNote" data-testid="feedback-form-missing">
              접수 폼을 아직 연결하지 않았어요. 준비가 끝나면 이 자리에서 바로 보낼 수 있어요.
              그때까지는 아래 버튼으로 내용을 복사해두시면 하나도 잃어버리지 않아요.
            </p>
            <div className="feedbackActions">
              <button type="button" className="primaryButton" onClick={() => void handleCopy()} data-testid="feedback-copy">
                <ClipboardCopy size={16} /> 내용 복사하기
              </button>
            </div>
          </>
        )}
        {status && (
          <p
            className={status.kind === "error" ? "feedbackStatus error" : "feedbackStatus"}
            role={status.kind === "error" ? "alert" : "status"}
          >
            {status.message}
          </p>
        )}
      </section>
    </div>
  );
}
