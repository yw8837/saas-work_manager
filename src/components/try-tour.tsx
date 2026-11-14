"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Check, CheckCircle2, MessageSquareText, RotateCcw, Send } from "lucide-react";

import { SAMPLE_PACKAGES } from "@/lib/demo/sample-order";
import { BUSINESS_IDENTITY, publicBusinessIdentity } from "@/lib/business-identity";
import { getPublicServiceConfig } from "@/lib/policies";
import { SIGNUP_START_HREF, START_INVITE_CODE } from "@/lib/signup-start";
import { Brand } from "./brand";
import { SignupOffer } from "./signup-offer";

const won = new Intl.NumberFormat("ko-KR");
/** 메일 받은 사람이 누르는 시작 버튼. 로그인·약관 동의 뒤 베타 코드가 자동으로 적용된다(invite-link.ts). 주소는 공용 시작 주소(signup-start.ts). */
export const TRY_INVITE_CODE = START_INVITE_CODE;
export const TRY_START_HREF = SIGNUP_START_HREF;
const SAMPLE_REQUEST = "로고 글자 색을 조금 더 진하게 해 주세요.";

const STEPS = ["패키지 고르기", "고객에게 링크 보내기", "고객이 수정 요청 남기기", "고친 뒤 수정 완료"] as const;

type Request = { body: string; status: "pending" | "done" };

/**
 * 콜드메일 받은 사람이 가입 전에 여는 소개+체험 한 페이지(/try).
 * 체험은 이 화면 안의 예시 데이터로만 움직인다. 서버·브라우저 저장소에 아무것도 쓰지 않는다.
 * 숫자는 예시 패키지(sample-order.ts)에서만 가져온다. 새 숫자를 여기 적지 않는다.
 * 방문 기록 도구(Microsoft Clarity)가 이 화면을 기록하므로, 방문자가 직접 적는 요청 글과 그 글을 다시 보여 주는 목록은
 * `data-clarity-mask`로 가린다(입력 칸은 Clarity가 기본으로 가리지만, 적은 글이 일반 글자로 다시 나오는 곳은 가리지 않는다).
 * footerNote: 바닥글 한 줄(웹 둘러보기 화면의 방문 기록 도구 안내). Sites·앱 경로는 넘기지 않는다.
 */
export function TryTour({ footerNote }: { footerNote?: ReactNode } = {}) {
  const [step, setStep] = useState(0);
  const [packageId, setPackageId] = useState(SAMPLE_PACKAGES[1].id);
  const [draft, setDraft] = useState(SAMPLE_REQUEST);
  const [requests, setRequests] = useState<Request[]>([]);
  const chosen = SAMPLE_PACKAGES.find((item) => item.id === packageId) ?? SAMPLE_PACKAGES[0];
  const used = requests.filter((request) => request.status === "done").length;
  const pending = requests.filter((request) => request.status === "pending").length;
  const remaining = chosen.revisionLimit - used;
  const service = getPublicServiceConfig();
  const contact = service.supportEmail ?? BUSINESS_IDENTITY.email;
  const business = publicBusinessIdentity();
  // 단계가 바뀌면 누른 버튼이 사라진다. 키보드·화면 읽기 사용자가 위치를 잃지 않게 새 단계 제목으로 포커스를 옮긴다.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);
  // 4단계 '수정 완료' 뒤 나타나는 완료 상자(가입 버튼 포함)가 휴대폰 화면 아래로 잘리지 않게 보이는 곳까지만 올린다.
  const doneRef = useRef<HTMLDivElement>(null);
  const finished = step === 3 && used > 0;
  useEffect(() => {
    if (!finished) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    doneRef.current?.scrollIntoView?.({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [finished]);
  // 처음부터 있는 빈 알림 칸의 글만 바꿔야 화면 읽기 프로그램이 읽어 준다.
  const announcement = step === 2 && pending > 0
    ? `요청을 남겼어요. 확인 대기 ${pending}건, 남은 수정은 그대로 ${remaining}회예요.`
    : step === 3 && used > 0
      ? `수정 완료. 포함 수정 ${chosen.revisionLimit}회 중 ${used}회 썼어요. 남은 수정 ${remaining}회.`
      : "";

  function restart() {
    setStep(0);
    setDraft(SAMPLE_REQUEST);
    setRequests([]);
  }

  return (
    <div className="guidePage tryPage">
      <header className="guideHeader">
        <Brand />
        <nav aria-label="둘러보기 메뉴">
          <Link href="/guide">사용설명서</Link>
          <Link href={TRY_START_HREF}>시작하기</Link>
        </nav>
      </header>

      <main className="guideMain tryMain">
        <section className="tryIntro" aria-labelledby="try-title">
          <h1 id="try-title">수정 몇 번 남았는지, 고객과 같은 화면으로 봐요</h1>
          <p className="tryLead">
            일감체크는 외주 제작자가 주문마다 정한 포함 수정 횟수와 고객 수정 요청을 한곳에 정리하는 도구예요.
            아래 네 단계를 직접 눌러 보세요.
          </p>
          <p className="tryNotice" data-testid="try-notice">예시 데이터라서 아무것도 저장되거나 보내지지 않아요.</p>
        </section>

        <section className="tryTour" aria-labelledby="try-tour-title" data-testid="try-tour">
          <h2 id="try-tour-title" className="srOnly">써 보기</h2>
          <ol className="trySteps">
            {STEPS.map((label, index) => (
              <li key={label} aria-current={index === step ? "step" : undefined} data-done={index < step}>
                <span className="tryStepNum" aria-hidden="true">{index < step ? <Check size={14} strokeWidth={3} /> : index + 1}</span>
                <span>{label}</span>
              </li>
            ))}
          </ol>

          <div className="tryPanel" data-testid={`try-step-${step + 1}`}>
            {step === 0 && (
              <>
                <h3 ref={headingRef} tabIndex={-1}>1. 주문이 오면 패키지를 골라요</h3>
                <p className="tryHint">패키지에 금액·기간·포함 수정 횟수를 한 번 적어 두면, 주문마다 고르기만 하면 돼요.</p>
                <fieldset className="tryPackages">
                  <legend className="srOnly">예시 패키지</legend>
                  {SAMPLE_PACKAGES.map((item) => (
                    <label key={item.id} className="tryPackage" data-selected={item.id === packageId}>
                      <input type="radio" name="try-package" value={item.id} checked={item.id === packageId} onChange={() => setPackageId(item.id)} />
                      <span className="tryPackageName">{item.name}</span>
                      <span className="tryPackageFacts">{won.format(item.price)}원 · {item.durationDays}일 · 수정 {item.revisionLimit}회</span>
                    </label>
                  ))}
                </fieldset>
                <button type="button" className="primaryButton tryNext" onClick={() => setStep(1)} data-testid="try-next-1">
                  이 패키지로 일감 만들기 <ArrowRight size={17} aria-hidden="true" />
                </button>
              </>
            )}

            {step === 1 && (
              <>
                <h3 ref={headingRef} tabIndex={-1}>2. 카톡 문구를 복사해 고객에게 보내요</h3>
                <p className="tryHint">일감을 만들면 고객 링크가 들어간 문구가 바로 나와요. 문구는 내가 복사해서 붙여 넣어요. 자동으로 보내지지 않아요.</p>
                <div className="tryMessage" data-testid="try-message">
                  안녕하세요, 예시 고객님.{"\n"}
                  작업을 시작해요. 수정 요청은 아래 링크에 번호를 붙여 한 번에 남겨 주세요.{"\n"}
                  남은 포함 수정은 {chosen.revisionLimit}회예요.{"\n"}
                  https://ilgam.studioyeolmae.com/r/예시
                </div>
                <button type="button" className="primaryButton tryNext" onClick={() => setStep(2)} data-testid="try-next-2">
                  <Send size={16} aria-hidden="true" /> 보냈다고 치고 고객 화면 보기
                </button>
              </>
            )}

            {step === 2 && (
              <>
                <h3 ref={headingRef} tabIndex={-1}>3. 고객은 가입 없이 링크에서 요청을 남겨요</h3>
                <div className="tryCustomer" aria-label="고객 화면">
                  <p className="tryCustomerTag">고객 화면</p>
                  <p className="tryRemaining">남은 수정 <strong data-testid="try-remaining-customer">{remaining}</strong>회</p>
                  {pending === 0 ? (
                    <>
                      <label className="tryField" data-clarity-mask="true">
                        <span>수정 요청 내용</span>
                        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={3} />
                      </label>
                      <button
                        type="button"
                        className="primaryButton tryNext"
                        disabled={!draft.trim()}
                        onClick={() => setRequests((list) => [...list, { body: draft.trim(), status: "pending" }])}
                        data-testid="try-submit-request"
                      >
                        요청 남기기
                      </button>
                    </>
                  ) : (
                    <p className="tryResult" data-testid="try-request-sent">
                      요청을 남겼어요. 작업자 화면에 &lsquo;확인 대기 {pending}건&rsquo;으로 들어가요. 아직 횟수는 그대로 {remaining}회예요.
                    </p>
                  )}
                </div>
                {pending > 0 && (
                  <button type="button" className="primaryButton tryNext" onClick={() => setStep(3)} data-testid="try-next-3">
                    작업자 화면으로 <ArrowRight size={17} aria-hidden="true" />
                  </button>
                )}
              </>
            )}

            {step === 3 && (
              <>
                <h3 ref={headingRef} tabIndex={-1}>4. 고친 뒤 &lsquo;수정 완료&rsquo;를 누르면 1회 줄어요</h3>
                <p className="tryHint">요청만 남겼을 때는 줄지 않아요. 질문이나 중복 요청은 반려하면 횟수가 그대로예요.</p>
                <div className="tryWorker" aria-label="작업자 화면">
                  <p className="tryCustomerTag">작업자 화면</p>
                  <ul className="tryRequests" data-clarity-mask="true">
                    {requests.map((request, index) => (
                      <li key={index}>
                        <MessageSquareText size={16} aria-hidden="true" />
                        <span className="tryRequestBody">{request.body}</span>
                        {request.status === "pending" ? (
                          <button
                            type="button"
                            className="compactButton emphasized"
                            onClick={() => setRequests((list) => list.map((item, at) => (at === index ? { ...item, status: "done" } : item)))}
                            data-testid="try-complete"
                          >
                            <CheckCircle2 size={15} aria-hidden="true" /> 수정 완료
                          </button>
                        ) : (
                          <span className="tryDone">수정 완료</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
                {finished ? (
                  // 체험을 끝낸 순간 다음 행동은 가입 하나. '처음부터 다시'는 옆의 글자 버튼으로 낮춘다.
                  <div className="tryDoneBox" ref={doneRef} data-testid="try-done">
                    <p className="tryResult" data-testid="try-result">
                      {`포함 수정 ${chosen.revisionLimit}회 중 ${used}회 썼어요. 고객 링크에도 남은 수정 ${remaining}회로 보여요.`}
                    </p>
                    <div className="tryDoneActions">
                      <Link href={TRY_START_HREF} className="primaryButton tryDoneStart" data-testid="try-done-start">
                        Google로 시작하기 <ArrowRight size={18} aria-hidden="true" />
                      </Link>
                      <button type="button" className="tryRestartLink" onClick={restart} data-testid="try-restart">
                        <RotateCcw size={15} aria-hidden="true" /> 처음부터 다시
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="tryResult" data-testid="try-result">
                      {`아직 ${remaining}회 남았어요. 고친 뒤 수정 완료를 눌러 보세요.`}
                    </p>
                    <button type="button" className="secondaryButton tryNext" onClick={restart} data-testid="try-restart">
                      <RotateCcw size={16} aria-hidden="true" /> 처음부터 다시
                    </button>
                  </>
                )}
              </>
            )}
          </div>
          <p className="srOnly" role="status" aria-live="polite" data-testid="try-announcer">{announcement}</p>
        </section>

        <section className="tryStart" aria-labelledby="try-start-title" data-testid="try-start">
          <h2 id="try-start-title">바로 써 보기</h2>
          {/* 혜택(Pro 14일)과 무료 범위는 버튼 아래 공용 안내 두 줄에 있다. 여기서 같은 말을 두 번 하지 않는다. */}
          <p>
            아래 버튼으로 들어가 Google로 가입하면 베타 코드(<strong>{TRY_INVITE_CODE}</strong>)가 자동으로 들어가요.
          </p>
          <Link href={TRY_START_HREF} className="primaryButton tryStartButton" data-testid="try-start-button">
            Google로 시작하기 <ArrowRight size={18} aria-hidden="true" />
          </Link>
          <SignupOffer testId="try-offer" className="tryOffer" />
          <ul className="tryFacts">
            <li>설치 없이 웹에서 바로 열려요</li>
            <li>카드 등록이 없어요</li>
            <li>설정에서 언제든 탈퇴할 수 있어요</li>
          </ul>
          <p className="tryMore">
            더 보기: <Link href="/guide">그림 설명서</Link> · <Link href="/demo/r">고객 화면 체험</Link> · <Link href="/examples">업종별 예시 패키지</Link>
          </p>
        </section>

        <section className="tryMaker" aria-labelledby="try-maker-title" data-testid="try-maker">
          <h2 id="try-maker-title">만든 곳</h2>
          <dl>
            <div><dt>상호</dt><dd>{business.businessName} ({business.brandName})</dd></div>
            <div><dt>대표</dt><dd>{business.representative}</dd></div>
            <div><dt>사업자등록번호</dt><dd>{business.regNo}</dd></div>
            <div><dt>통신판매업 신고번호</dt><dd>{business.mailOrderNo}</dd></div>
            <div><dt>전화</dt><dd><a href={`tel:${business.phone.replace(/[^0-9+]/g, "")}`}>{business.phone}</a></dd></div>
            <div><dt>문의 메일</dt><dd><a href={`mailto:${contact}`}>{contact}</a></dd></div>
            <div className="tryMakerWide"><dt>주소</dt><dd>{business.address}</dd></div>
          </dl>
        </section>
      </main>

      <footer className="guideFooter">
        <Link href="/">일감체크 소개</Link>
        <Link href="/guide">사용설명서</Link>
        <Link href="/terms">이용약관</Link>
        <Link href="/privacy">개인정보처리방침</Link>
        {footerNote}
      </footer>
    </div>
  );
}
