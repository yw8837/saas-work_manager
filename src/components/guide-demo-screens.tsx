"use client";

import type { ReactNode } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  Circle,
  Copy,
  Download,
  Eye,
  MessageCircle,
  Plus,
  Save,
  Send,
  ShieldCheck,
  Undo2,
  User,
} from "lucide-react";

import { defineDemo, markTarget, type DemoScreenProps, type GuideDemoSpec } from "./guide-demo";
import { WorkFlowChart } from "./work-flow-chart";

/*
 * 설명서 단계별 시연(장면 목록 + 화면 모형). 화면 모형은 실제 화면(job-detail·new-job-form·send-to-client-banner·
 * client-messages·monthly-summary·workspace-auth-gate·public-revision-view)의 문구와 예시 값(sample-order.ts:
 * STANDARD 로고 250,000원·7일·수정 3회, 원본 파일 옵션 +50,000원·+1일, 명함 추가요청 +80,000원·+2일)을 그대로 쓴다.
 * 지킬 사실: 요청만 남기면 횟수가 그대로이고 '확인 대기'로 들어온다 / '수정 완료'를 눌러야 1회 준다 / 반려하면 그대로 /
 * 카톡은 저절로 안 가고 복사해 붙인다 / 고객은 가입 없이 링크로 본다 / 추가요청은 초안 → 고객 동의 → 확정 / 플랫폼과 연동하지 않는다.
 * 시간 숫자('몇 초')는 쓰지 않는다.
 */

const LINK = "https://ilgam.studioyeolmae.com/r/예시";
const INTAKE = ["로고에 넣을 상호명·영문 표기", "로고를 쓸 곳(간판·명함 등)", "꼭 쓰고 싶은 색이나 피하고 싶은 색"];
const QUESTION = "이 작업으로 가장 하고 싶은 일은 무엇인가요?";

function Toast({ children }: { children: ReactNode }) {
  return <span className="gdToast">{children}</span>;
}

/** 값이 바뀌면 다시 그려 잠깐 반짝이게 한다(key가 바뀌면 새로 그려져 애니메이션이 다시 돈다). */
function Pop({ value }: { value: string | number }) {
  return <b key={String(value)} className="gdPop">{value}</b>;
}

/* 1. 흐름도: 장면마다 차례인 칸에 불이 들어온다(누르는 곳 없음). */
type FlowState = { on: string };
function FlowScreen({ state }: DemoScreenProps<FlowState>) {
  return (
    <div className="gdFlow" data-flow-on={state.on}>
      <WorkFlowChart headingId="guide-step-title" showHeading={false} compact />
    </div>
  );
}

/* 2. 가입: Google로 계속하기 → 첫 사용 동의 → 작업공간. */
type SignupState = { view: "login" | "consent" | "workspace"; agreed: boolean };
function SignupScreen({ state, hit }: DemoScreenProps<SignupState>) {
  if (state.view === "workspace") {
    return (
      <div className="gdView gdApp" key="workspace">
        <div className="gdTop"><strong>오늘</strong></div>
        <div className="gdCard">
          <strong>첫 고객 링크까지 세 단계</strong>
          <ol className="gdSteps">
            <li>내 일에 맞는 예시 패키지 고르기</li>
            <li>첫 일감 만들기</li>
            <li>고객에게 수정 요청 링크 보내기</li>
          </ol>
        </div>
        <span className="gdTabs"><b>오늘</b><span>일감</span><span>패키지</span><span>설정</span></span>
      </div>
    );
  }
  if (state.view === "consent") {
    return (
      <div className="gdView gdAuth" key="consent">
        <span className="gdAuthIcon"><ShieldCheck size={18} /></span>
        <strong className="gdAuthTitle">첫 사용 전 동의가 필요해요</strong>
        <p className="gdMuted">현재 정책을 확인하고 동의하면 작업공간을 바로 열 수 있어요.</p>
        <span className="gdConsent" {...markTarget("agree", hit)}>
          <span className="gdBox" data-on={state.agreed}>{state.agreed && <Check size={13} strokeWidth={3} />}</span>
          <span>이용약관과 개인정보처리방침을 읽었으며 두 문서에 모두 동의합니다. (필수)</span>
        </span>
        <span className="gdBtn gdPrimary gdWide" {...markTarget("open", hit)}>동의하고 작업공간 열기 <ArrowRight size={15} /></span>
      </div>
    );
  }
  return (
    <div className="gdView gdAuth" key="login">
      <span className="gdAuthIcon"><ShieldCheck size={18} /></span>
      <strong className="gdAuthTitle">Google 계정으로 시작하기</strong>
      <p className="gdMuted">한 번 로그인하면 내 고객·금액·수정 기록만 따로 저장돼요.</p>
      <span className="gdBtn gdPrimary gdWide" {...markTarget("google", hit)}>Google로 계속하기 <ArrowRight size={15} /></span>
    </div>
  );
}

/* 3. 패키지: 받을 자료·질문을 적고 저장. */
type PackagesState = { intake: boolean; question: boolean; saved: boolean };
function PackagesScreen({ state, hit }: DemoScreenProps<PackagesState>) {
  return (
    <div className="gdView gdApp">
      <div className="gdTop"><span>패키지</span></div>
      <div className="gdPkgHead">
        <strong>STANDARD 로고</strong>
        <span>250,000원 · 7일 · 수정 3회</span>
      </div>
      <span className="gdLabel">시작 전 받을 자료 <small>고객 링크에 보여요</small></span>
      <span className="gdField gdArea" data-filled={state.intake} {...markTarget("intake", hit)}>
        {state.intake && INTAKE.map((line) => <span key={line} className="gdLine">{line}</span>)}
      </span>
      <span className="gdLabel">착수 전 질문 <small>카톡 문구에 들어가요</small></span>
      <span className="gdField" data-filled={state.question} {...markTarget("question", hit)}>
        {state.question && <span className="gdLine">{QUESTION}</span>}
      </span>
      {/* 실제 화면처럼 저장 알림은 버튼 옆에 붙는다(package-manager.tsx catalogSaved). */}
      <span className="gdActions">
        <span className="gdBtn gdPrimary" {...markTarget("save", hit)}><Save size={15} /> 패키지 저장</span>
        {state.saved && <span className="gdSaved"><Check size={14} /> 패키지 조건을 저장했어요. 새 일감부터 적용돼요.</span>}
      </span>
    </div>
  );
}

/* 4. 새 일감: 고객·시작일 → 패키지 → 옵션 → 일감 만들기. 아래 띠의 금액·마감은 고른 것으로 다시 계산된다. */
type NewJobState = { client: boolean; pkg: boolean; option: boolean; created: boolean };
function NewJobScreen({ state, hit }: DemoScreenProps<NewJobState>) {
  const amount = state.option ? "300,000원" : "250,000원";
  const tasks = state.option ? 5 : 4;
  const due = state.option ? "11월 7일" : "11월 6일";
  if (state.created) {
    // 저장하면 일감 화면으로 넘어가 '이제 고객에게 보내세요' 띠가 뜬다(다음 단계가 이 띠에서 시작한다).
    return (
      <div className="gdView gdApp" key="created">
        <div className="gdTop"><span>일감</span></div>
        <span className="gdBannerHead">
          <span className="gdIconBox"><Send size={15} /></span>
          <strong>일감을 저장했어요. 이제 고객에게 보내세요</strong>
        </span>
        <div className="gdJobStrip">
          <strong>예시 고객 · STANDARD 로고</strong>
          <span>300,000원 · 11월 7일 마감 · 수정 3회 · 할 일 5개</span>
        </div>
        <span className="gdBtn gdPrimary gdWide"><MessageCircle size={15} /> 카톡 문구 복사</span>
      </div>
    );
  }
  return (
    <div className="gdView gdApp gdNewJob" key="form">
      <div className="gdTop"><span>새 일감</span></div>
      <div className="gdPair">
        <span className="gdField gdInline" data-filled={state.client} {...markTarget("client", hit)}>
          <User size={15} aria-hidden="true" />{state.client ? "예시 고객" : "고객"}
        </span>
        <span className="gdField gdInline" data-filled={state.client}>
          <CalendarDays size={15} aria-hidden="true" />{state.client ? "2026-10-30" : "시작일"}
        </span>
      </div>
      <span className="gdChoice" data-on={state.pkg} {...markTarget("package", hit)}>
        <span className="gdTick">{state.pkg && <Check size={12} strokeWidth={3} />}</span>
        <span><strong>STANDARD 로고</strong><small>250,000원 · 7일 · 수정 3회</small></span>
      </span>
      <span className="gdChoice" data-on={state.option} {...markTarget("option", hit)}>
        <span className="gdTick">{state.option && <Check size={12} strokeWidth={3} />}</span>
        <span><strong>원본 파일(AI·PDF) 제공</strong><small>+50,000원 · +1일</small></span>
      </span>
      <div className="gdDarkBar">
        <span>
          <small>{state.pkg ? <><Pop value={amount} /> · 할 일 <Pop value={tasks} />개</> : "금액과 할 일을 자동 계산해요"}</small>
          <strong>{state.pkg ? <><Pop value={due} /> 마감 · 수정 3회</> : "패키지를 골라주세요"}</strong>
        </span>
        <span className="gdBtn gdLight" {...markTarget("create", hit)}>일감 만들기 <ArrowRight size={14} /></span>
      </div>
    </div>
  );
}

/* 5. 카톡 문구: 복사 → 평소 대화창 → 붙여 넣기 → 내가 보내기. */
type SendState = { view: "app" | "chat"; copied: boolean; pasted: boolean; sent: boolean };
function KickoffMessage() {
  return (
    <>
      <span>안녕하세요, 예시 고객님.</span>
      <b>[보내 주실 자료]</b>
      {INTAKE.map((line) => <span key={line}>- {line}</span>)}
      <b>[알려 주실 것]</b>
      <span>1. {QUESTION}</span>
      <span>수정 요청은 아래 링크에 한 번에 남겨 주세요. 로그인 없이 열려요.</span>
      <span className="gdLink">{LINK}</span>
    </>
  );
}
function SendScreen({ state, hit }: DemoScreenProps<SendState>) {
  if (state.view === "chat") {
    return (
      <div className="gdView gdChat" key="chat">
        <div className="gdChatTop"><strong>예시 고객</strong><small>평소 쓰는 대화창</small></div>
        <div className="gdChatBody">
          <span className="gdBubble" data-side="them">로고 작업 부탁드려요.</span>
          {state.sent && <span className="gdBubble gdMessage" data-side="me"><KickoffMessage /></span>}
        </div>
        <div className="gdChatInput">
          <span className="gdChatField" data-filled={state.pasted && !state.sent} {...markTarget("chat-input", hit)}>
            {state.pasted && !state.sent ? "안녕하세요, 예시 고객님. [보내 주실 자료] - 로고에 넣을…" : ""}
          </span>
          <span className="gdChatSend" {...markTarget("chat-send", hit)}><Send size={15} /></span>
        </div>
      </div>
    );
  }
  return (
    <div className="gdView gdApp gdSendBanner" key="app">
      <span className="gdBannerHead">
        <span className="gdIconBox"><Send size={15} /></span>
        <strong>일감을 저장했어요. 이제 고객에게 보내세요</strong>
      </span>
      <span className="gdBtn gdPrimary gdWide" data-done={state.copied} {...markTarget("copy", hit)}>
        {state.copied ? <><Check size={15} /> 문구를 복사했어요</> : <><MessageCircle size={15} /> 카톡 문구 복사</>}
      </span>
      <span className="gdPair">
        <span className="gdBtn gdGray"><Copy size={14} /> 링크만 복사</span>
        <span className="gdBtn gdGray"><Eye size={14} /> 고객 화면 미리보기</span>
      </span>
      <span className="gdMessage gdMessageBox"><KickoffMessage /></span>
    </div>
  );
}

/* 6. 받을 자료 체크: 대화창으로 온 답을 보고 체크 → 남은 것만 다시 보낼 문구. */
type CheckState = { reply: boolean; got: boolean; copied: boolean };
function CheckScreen({ state, hit }: DemoScreenProps<CheckState>) {
  return (
    <div className="gdView gdApp">
      {state.reply && (
        <span className="gdNotice"><MessageCircle size={14} aria-hidden="true" /><span><b>대화창 · 예시 고객</b> 간판이랑 명함에 쓸 거예요.</span></span>
      )}
      <div className="gdSectionHead">
        <span><strong>시작 전 받을 자료</strong><small><Pop value={state.got ? "2/3" : "1/3"} /> 받음</small></span>
        <span className="gdBtn gdGray gdSmall" {...markTarget("copy-rest", hit)}>
          {state.copied ? <Check size={13} /> : <Copy size={13} />} 남은 것만 문구 복사
        </span>
      </div>
      <ul className="gdChecklist">
        <li data-on="true"><CheckCircle2 size={16} aria-hidden="true" /><span>{INTAKE[0]}</span><small>받음</small></li>
        <li data-on={state.got} {...markTarget("item-2", hit)}>
          {state.got ? <CheckCircle2 size={16} aria-hidden="true" /> : <Circle size={16} aria-hidden="true" />}<span>{INTAKE[1]}</span>{state.got && <small>받음</small>}
        </li>
        <li data-left={state.copied}><Circle size={16} aria-hidden="true" /><span>{INTAKE[2]}</span></li>
      </ul>
      <div className="gdSectionHead"><strong>착수 전 질문</strong></div>
      <ul className="gdChecklist">
        <li data-left={state.copied}><Circle size={16} aria-hidden="true" /><span>{QUESTION}</span></li>
      </ul>
      {state.copied && <Toast>남은 자료·질문만 복사했어요.</Toast>}
    </div>
  );
}

/* 7. 수정 요청: 고객이 링크에 남김(횟수 그대로) → 작업자 화면 확인 대기 → 수정 완료(3→2) → 질문은 반려(그대로). */
type RevisionState = { view: "customer" | "worker"; sent: boolean; first: "pending" | "done"; second: "pending" | "rejected" };
function RevisionScreen({ state, hit }: DemoScreenProps<RevisionState>) {
  const used = state.first === "done" ? 1 : 0;
  const remaining = 3 - used;
  const pending = (state.sent && state.first === "pending" ? 1 : 0) + (state.second === "pending" ? 1 : 0);
  if (state.view === "customer") {
    return (
      <div className="gdView gdCustomer" key="customer">
        <div className="gdTop"><span className="gdTag" data-tone="amber">고객 화면</span><small>가입·로그인 없이 열려요</small></div>
        <strong className="gdHeading">{state.sent ? "수정 요청을 남겼어요" : "수정할 내용을 한 번에 남겨주세요"}</strong>
        <div className="gdFacts">
          <span><small>남은 수정</small><b data-testid="gd-remaining">{remaining}</b>회</span>
          <span><small>전체 3회 중 {used}회 사용</small><small>확인 대기 <Pop value={pending} />건</small></span>
        </div>
        {state.sent ? (
          <p className="gdResult">요청을 접수했어요. 작업자가 수정을 마치면 그때 포함 수정 1회로 세요.</p>
        ) : (
          <>
            <span className="gdField gdArea" data-filled="true"><span className="gdLine">로고 글자 색을 조금 더 진하게 해 주세요.</span></span>
            <span className="gdBtn gdPrimary gdWide" {...markTarget("send", hit)}><Send size={15} /> 요청 남기기</span>
          </>
        )}
      </div>
    );
  }
  return (
    <div className="gdView gdApp" key="worker">
      <div className="gdTop"><span className="gdTag" data-tone="blue">작업자 화면</span></div>
      <div className="gdSectionHead">
        <strong>수정 요청 기록</strong>
        <span className="gdRemain">남은 수정 <b data-testid="gd-remaining" key={remaining} className="gdPop">{remaining}</b>회 <small>{used}/3 사용</small></span>
      </div>
      <article className="gdRev">
        <div>
          <small>고객 수정 링크 · 10월 30일 10:40</small>
          <p>로고 글자 색을 조금 더 진하게 해 주세요.</p>
          {state.first === "pending" ? (
            <span className="gdRevActions">
              <span className="gdBtn gdSoft gdSmall" {...markTarget("done", hit)}><CheckCircle2 size={13} /> 수정 완료</span>
              <span className="gdBtn gdGray gdSmall"><Plus size={13} /> 추가 작업으로</span>
              <span className="gdTextBtn"><Undo2 size={13} /> 반려</span>
            </span>
          ) : (
            <span className="gdRevActions"><span className="gdTextBtn"><Undo2 size={13} /> 되돌리기</span></span>
          )}
        </div>
        <span className="gdTag" data-tone={state.first === "done" ? "blue" : "amber"} data-testid="gd-first-badge">
          {state.first === "done" ? "1회차" : "확인 대기"}
        </span>
      </article>
      <article className="gdRev" data-off={state.second === "rejected"}>
        <div>
          <small>고객 수정 링크 · 10월 29일 15:20</small>
          <p>시안은 언제쯤 받을 수 있나요?</p>
          {state.second === "pending" ? (
            <span className="gdRevActions">
              {/* 남은 수정이 있으면 '수정 완료'도 있지만, 질문이라 반려를 보인다. */}
              <span className="gdBtn gdSoft gdSmall"><CheckCircle2 size={13} /> 수정 완료</span>
              <span className="gdTextBtn" {...markTarget("reject", hit)}><Undo2 size={13} /> 반려</span>
            </span>
          ) : (
            <span className="gdRevNote"><Undo2 size={13} /> 반려한 요청 · 사유 없음</span>
          )}
        </div>
        <span className="gdTag" data-tone={state.second === "rejected" ? "gray" : "amber"} data-testid="gd-second-badge">
          {state.second === "rejected" ? "반려" : "확인 대기"}
        </span>
      </article>
    </div>
  );
}

/* 8. 추가요청: 초안 기록(합계 그대로) → 고객 동의 → 확정(금액·마감·할 일 반영). */
type AddonState = { draft: boolean; agreed: boolean; confirmed: boolean; toast: "" | "draft" };
function AddonScreen({ state, hit }: DemoScreenProps<AddonState>) {
  return (
    <div className="gdView gdApp">
      <div className="gdJobStrip">
        <strong>샘플 카페 로고 디자인</strong>
        <span>
          <Pop value={state.confirmed ? "380,000원" : "300,000원"} /> · <Pop value={state.confirmed ? "11월 9일" : "11월 7일"} /> 마감 · 할 일 <Pop value={state.confirmed ? 6 : 5} />개
        </span>
      </div>
      <div className="gdSectionHead">
        <strong>추가요청</strong>
        <span className="gdBtn gdSoft gdSmall" {...markTarget("record", hit)}><Plus size={13} /> 추가요청 기록</span>
      </div>
      <p className="gdMuted">초안으로 적어 두고, 고객이 동의하면 확정해요.</p>
      {state.draft && (
        <article className="gdAddon">
          <div>
            <small className="gdAddonState" data-tone={state.confirmed ? "green" : "amber"}>{state.confirmed ? "확정됨" : "초안"}</small>
            <strong>명함 디자인 추가</strong>
            <span>+80,000원 · 원가 10,000원 · +2일 · 할 일 1개</span>
          </div>
          {!state.confirmed && <span className="gdBtn gdSoft gdSmall" {...markTarget("confirm", hit)}><Check size={13} /> 확정</span>}
        </article>
      )}
      {state.agreed && (
        <div className="gdMiniChat">
          <span className="gdBubble" data-side="me">범위 밖이라 추가 작업으로 안내드려요. - 명함 디자인 추가 (추가 비용 80,000원, 기간 2일 추가)</span>
          <span className="gdBubble" data-side="them">네, 진행해 주세요.</span>
        </div>
      )}
      {/* 확정 뒤에는 알림 대신 위 금액·마감·할 일이 바뀌는 것으로 보인다(고객 동의 말풍선을 가리지 않게). */}
      {state.toast === "draft" && <Toast>추가요청 초안을 만들었어요. 확정 전에는 합계에 반영되지 않아요.</Toast>}
    </div>
  );
}

/* 9. 상황별 문구: 칩을 고르면 문구가 바뀌고, 복사해 붙여 보낸다. */
type MessagesState = { chip: "remaining" | "review"; copied: boolean };
const MESSAGE_CHIPS = [
  { id: "remaining", label: "남은 것 요청" },
  { id: "review", label: "시안 확인 부탁" },
  { id: "start", label: "시작 안내" },
  { id: "delivery", label: "납품 안내" },
] as const;
const SITUATION_TEXT: Record<MessagesState["chip"], string[]> = {
  remaining: [
    "안녕하세요, 예시 고객님.",
    "작업을 시작하기 전에 아래 내용만 이 대화로 보내 주세요. 모르는 건 '모름'이라고 적어 주셔도 괜찮아요.",
    "[보내 주실 자료]",
    `- ${INTAKE[2]}`,
  ],
  review: [
    "안녕하세요, 예시 고객님.",
    "작업한 것을 보내 드려요.",
    "확인해 보시고 고칠 부분은 아래 링크에 한 번에 남겨 주세요.",
    "남은 포함 수정은 2회예요.",
    LINK,
  ],
};
function MessagesScreen({ state, hit }: DemoScreenProps<MessagesState>) {
  return (
    <div className="gdView gdApp">
      <div className="gdSectionHead">
        <strong>고객에게 보낼 말</strong>
        <span className="gdBtn gdSoft gdSmall" {...markTarget("copy", hit)}>
          {state.copied ? <><Check size={13} /> 복사했어요</> : <><Copy size={13} /> 문구 복사</>}
        </span>
      </div>
      <span className="gdChips">
        {MESSAGE_CHIPS.map((chip) => (
          <span key={chip.id} className="gdChip" data-on={chip.id === state.chip} {...markTarget(`chip-${chip.id}`, hit)}>
            {chip.id === state.chip && <Check size={12} strokeWidth={3} />}{chip.label}
          </span>
        ))}
      </span>
      <span className="gdMessage gdMessageBox" key={state.chip}>
        {SITUATION_TEXT[state.chip].map((line) => <span key={line} className={line === LINK ? "gdLink" : undefined}>{line}</span>)}
      </span>
    </div>
  );
}

/* 10. 월별 정리: 일감 완료 → 그 달 정리(받은 곳별) → 표 파일 내려받기. */
type MonthlyState = { view: "job" | "summary"; completed: boolean; downloaded: boolean };
function MonthlyScreen({ state, hit }: DemoScreenProps<MonthlyState>) {
  if (state.view === "summary") {
    return (
      <div className="gdView gdApp" key="summary">
        <div className="gdTop"><strong>월별 정리</strong><span>2026년 10월</span></div>
        <dl className="gdTotals">
          <div><dt>완료 주문</dt><dd>1건</dd></div>
          <div><dt>주문 금액 합계</dt><dd>150,000원</dd></div>
          <div><dt>예상 원가</dt><dd>20,000원</dd></div>
          <div><dt>남는 돈(예상)</dt><dd>130,000원</dd></div>
        </dl>
        <span className="gdBtn gdGray gdWide" {...markTarget("download", hit)}><Download size={15} /> 10월 내려받기</span>
        <div className="gdSource"><strong>받은 곳별</strong><span>숨고</span><span>1건</span><b>150,000원</b></div>
        {state.downloaded && <Toast>ilgamcheck-매출-2026-10.csv를 내려받았어요</Toast>}
      </div>
    );
  }
  return (
    <div className="gdView gdApp" key="job">
      <div className="gdTop"><span>일감</span></div>
      <div className="gdJobCard">
        <small>예시 고객 · 받은 곳 숨고</small>
        <strong>BASIC 로고 · 150,000원</strong>
        <ul className="gdChecklist">
          {["요청서와 참고 이미지 확인", "로고 시안 1종 공유", "최종 파일 전달"].map((task) => (
            <li key={task} data-on="true"><CheckCircle2 size={16} aria-hidden="true" /><span>{task}</span></li>
          ))}
        </ul>
      </div>
      <div className="gdDarkBar">
        <span><strong>{state.completed ? "일감 완료됨" : "다음: 모든 작업 처리됨"}</strong></span>
        {/* 완료하면 버튼이 '다시 진행'으로 바뀐다. 누를 곳 표시는 '일감 완료'에만 둔다. */}
        {state.completed
          ? <span className="gdBtn gdLight">다시 진행</span>
          : <span className="gdBtn gdLight" {...markTarget("complete", hit)}>일감 완료</span>}
      </div>
    </div>
  );
}

/** 단계 id → 시연. 단계 순서·문구는 user-guide.tsx의 GUIDE_STEPS가 정한다. */
export const GUIDE_DEMOS = {
  flow: defineDemo<FlowState>({
    initial: { on: "" },
    scenes: [
      { caption: "주문이 오면 직접 등록해요. 금액·마감은 자동으로 채워져요", state: { on: "order register" } },
      { caption: "카톡 문구를 보내면 고객은 대화창으로 자료·답을 보내요", state: { on: "kickoff materials" } },
      { caption: "고객 요청은 확인 대기로 오고, '수정 완료' 때 1회 줄어요", state: { on: "work revision revision-done" } },
      { caption: "'일감 완료'를 누르면 월별 정리에 매출이 모여요", state: { on: "complete" } },
    ],
    Screen: FlowScreen,
  }),
  signup: defineDemo<SignupState>({
    alt: "로그인 화면에서 Google로 계속하기를 누르고, 첫 사용 동의에 체크한 뒤 동의하고 작업공간 열기를 누르면 오늘 화면이 열리는 시연",
    initial: { view: "login", agreed: false },
    scenes: [
      { caption: "'Google로 계속하기'를 누르고 내 Google 계정을 골라요", target: "google", state: { view: "consent", agreed: false } },
      { caption: "처음 한 번은 약관·개인정보처리방침에 동의해요", target: "agree", state: { view: "consent", agreed: true } },
      { caption: "'동의하고 작업공간 열기'를 누르면 내 작업공간이 열려요", target: "open", state: { view: "workspace", agreed: true } },
    ],
    Screen: SignupScreen,
  }),
  packages: defineDemo<PackagesState>({
    alt: "STANDARD 로고 패키지에 시작 전 받을 자료 세 줄과 착수 전 질문을 적고 패키지 저장을 누르는 시연",
    initial: { intake: false, question: false, saved: false },
    scenes: [
      { caption: "시작 전 받을 자료를 한 줄에 하나씩 적어요", target: "intake", state: { intake: true, question: false, saved: false } },
      { caption: "착수 전 질문도 적어 두면 카톡 문구에 들어가요", target: "question", state: { intake: true, question: true, saved: false } },
      { caption: "'패키지 저장'을 누르면 새 일감부터 이 조건으로 채워져요", target: "save", state: { intake: true, question: true, saved: true } },
    ],
    Screen: PackagesScreen,
  }),
  "new-job": defineDemo<NewJobState>({
    alt: "새 일감 화면에서 고객·시작일, STANDARD 로고 패키지, 원본 파일 옵션을 차례로 고르면 아래 띠의 금액·마감이 바뀌고 일감 만들기를 누르는 시연",
    initial: { client: false, pkg: false, option: false, created: false },
    scenes: [
      { caption: "고객 이름과 시작일을 골라요", target: "client", state: { client: true, pkg: false, option: false, created: false } },
      { caption: "패키지를 고르면 금액·마감·할 일·수정 횟수가 채워져요", target: "package", state: { client: true, pkg: true, option: false, created: false } },
      { caption: "옵션을 더하면 금액과 마감이 다시 계산돼요", target: "option", state: { client: true, pkg: true, option: true, created: false } },
      { caption: "'일감 만들기'를 누르면 저장돼요", target: "create", state: { client: true, pkg: true, option: true, created: true } },
    ],
    Screen: NewJobScreen,
  }),
  "send-message": defineDemo<SendState>({
    alt: "일감 저장 직후 카톡 문구 복사를 누르고, 평소 쓰는 대화창에 붙여 넣은 뒤 직접 보내기를 누르는 시연",
    initial: { view: "app", copied: false, pasted: false, sent: false },
    scenes: [
      { caption: "'카톡 문구 복사'를 누르면 링크·자료·질문이 든 문구가 복사돼요", target: "copy", state: { view: "app", copied: true, pasted: false, sent: false } },
      { caption: "평소 쓰는 대화창을 열어요", state: { view: "chat", copied: true, pasted: false, sent: false } },
      { caption: "복사한 문구를 붙여 넣어요", target: "chat-input", state: { view: "chat", copied: true, pasted: true, sent: false } },
      { caption: "보내기는 내가 눌러요. 자동으로 보내지지 않아요", target: "chat-send", state: { view: "chat", copied: true, pasted: true, sent: true } },
    ],
    Screen: SendScreen,
  }),
  "check-answers": defineDemo<CheckState>({
    alt: "고객이 대화창으로 보낸 답을 보고 받을 자료를 체크하면 1/3 받음이 2/3 받음으로 바뀌고, 남은 것만 문구 복사를 누르는 시연",
    initial: { reply: false, got: false, copied: false },
    scenes: [
      { caption: "고객은 링크 없이 대화창으로 답해도 돼요", state: { reply: true, got: false, copied: false } },
      { caption: "받은 자료를 눌러 체크해요", target: "item-2", state: { reply: true, got: true, copied: false } },
      { caption: "'남은 것만 문구 복사'에는 아직 못 받은 것만 들어가요", target: "copy-rest", state: { reply: true, got: true, copied: true } },
    ],
    Screen: CheckScreen,
  }),
  revisions: defineDemo<RevisionState>({
    alt: "고객이 링크에서 요청을 남겨도 남은 수정은 3회 그대로이고 작업자 화면에 확인 대기로 들어온 뒤, 수정 완료를 누르면 2회로 줄고, 질문을 반려하면 2회 그대로인 시연",
    initial: { view: "customer", sent: false, first: "pending", second: "pending" },
    scenes: [
      { caption: "고객은 가입 없이 링크에서 요청을 남겨요. 횟수는 그대로예요", target: "send", state: { view: "customer", sent: true, first: "pending", second: "pending" } },
      { caption: "작업자 화면엔 '확인 대기'로 들어와요. 아직 3회 그대로예요", state: { view: "worker", sent: true, first: "pending", second: "pending" } },
      { caption: "고친 뒤 '수정 완료'를 누르면 남은 수정이 3회에서 2회로 줄어요", target: "done", state: { view: "worker", sent: true, first: "done", second: "pending" } },
      { caption: "질문·중복은 '반려'해요. 남은 수정은 그대로 2회예요", target: "reject", state: { view: "worker", sent: true, first: "done", second: "rejected" } },
    ],
    Screen: RevisionScreen,
  }),
  addon: defineDemo<AddonState>({
    alt: "추가요청 기록으로 명함 디자인 추가 초안을 만들고, 고객 동의를 받은 뒤 확정을 누르면 금액 300,000원이 380,000원으로, 마감과 할 일이 바뀌는 시연",
    initial: { draft: false, agreed: false, confirmed: false, toast: "" },
    scenes: [
      { caption: "범위 밖 요청은 초안으로 적어요. 합계는 아직 그대로예요", target: "record", state: { draft: true, agreed: false, confirmed: false, toast: "draft" } },
      { caption: "금액·기간을 대화창으로 보내 고객 동의를 받아요", state: { draft: true, agreed: true, confirmed: false, toast: "" } },
      { caption: "'확정'을 누르면 금액·마감·할 일에 반영돼요", target: "confirm", state: { draft: true, agreed: true, confirmed: true, toast: "" } },
    ],
    Screen: AddonScreen,
  }),
  messages: defineDemo<MessagesState>({
    alt: "고객에게 보낼 말에서 시안 확인 부탁 칩을 고르면 문구가 바뀌고, 문구 복사를 누르는 시연",
    initial: { chip: "remaining", copied: false },
    scenes: [
      { caption: "보낼 상황을 고르면 문구가 그 상황에 맞게 바뀌어요", target: "chip-review", state: { chip: "review", copied: false } },
      { caption: "'문구 복사'를 눌러 대화창에 붙여 보내요", target: "copy", state: { chip: "review", copied: true } },
    ],
    Screen: MessagesScreen,
  }),
  monthly: defineDemo<MonthlyState>({
    alt: "일감 완료를 누르면 그 달 월별 정리에 완료 주문 1건 150,000원이 받은 곳별로 모이고, 10월 내려받기를 누르는 시연",
    initial: { view: "job", completed: false, downloaded: false },
    scenes: [
      { caption: "납품한 주문은 '일감 완료'를 눌러요", target: "complete", state: { view: "job", completed: true, downloaded: false } },
      { caption: "완료한 주문이 그 달 정리에 받은 곳별로 모여요", state: { view: "summary", completed: true, downloaded: false } },
      { caption: "'10월 내려받기'를 누르면 표 파일(CSV)로 받아요", target: "download", state: { view: "summary", completed: true, downloaded: true } },
    ],
    Screen: MonthlyScreen,
  }),
} satisfies Record<string, GuideDemoSpec>;
