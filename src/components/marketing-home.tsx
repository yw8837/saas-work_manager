import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  Check,
  CheckCircle2,
  ChevronRight,
  Coffee,
  MousePointer2,
  MousePointerClick,
  PackageCheck,
} from "lucide-react";
import { Brand } from "./brand";
import { ProductPreview } from "./product-preview";
import { getPublicServiceConfig } from "@/lib/policies";
import { PLAN_LIMITS, PLAN_PRICES } from "@/lib/domain";
import { BUSINESS_IDENTITY } from "@/lib/business-identity";
import { getPublicEnvironmentValue } from "@/lib/public-environment";

export function MarketingHome() {
  const service = getPublicServiceConfig();
  // 전자상거래법 사업자 정보 고지 — 배포 시 NEXT_PUBLIC_* 가 있으면 그 값, 없으면 사업자등록 기준 값
  const legal = {
    businessName: getPublicEnvironmentValue("NEXT_PUBLIC_BUSINESS_NAME")?.trim() || BUSINESS_IDENTITY.businessName,
    representative: BUSINESS_IDENTITY.representative,
    regNo: getPublicEnvironmentValue("NEXT_PUBLIC_BUSINESS_NUMBER")?.trim() || BUSINESS_IDENTITY.registrationNumber,
    mailOrderNo: getPublicEnvironmentValue("NEXT_PUBLIC_MAIL_ORDER_NUMBER")?.trim() || BUSINESS_IDENTITY.mailOrderNumber,
    address: getPublicEnvironmentValue("NEXT_PUBLIC_BUSINESS_ADDRESS")?.trim() || BUSINESS_IDENTITY.address,
    phone: getPublicEnvironmentValue("NEXT_PUBLIC_BUSINESS_PHONE")?.trim() || BUSINESS_IDENTITY.phone,
  };
  const supportEmail = service.supportEmail ?? BUSINESS_IDENTITY.email;

  return (
    <div className="marketingPage">
      <header className="marketingHeader">
        <Brand />
        <nav className="marketingNav" aria-label="소개 메뉴">
          <a href="#workflow">사용 방식</a>
          <a href="#revision">수정 관리</a>
          <a href="#faq">자주 묻는 질문</a>
          <Link href="/guide">사용설명서</Link>
        </nav>
        <Link href="/today" className="headerDemoLink">
          로그인
          <ChevronRight size={16} />
        </Link>
      </header>

      <main>
        <section className="heroSection">
          <div className="heroCopy">
            <h1>
              <span className="heroLine">혼자 일해도,</span>
              <span className="heroLine heroAccent">운영까지 혼자 할</span>
              <span className="heroLine heroAccent">필요는 없어요.</span>
            </h1>
            <p className="heroLead">
              주문을 등록하면 할 일, 마감, 수정 요청이 한곳에 정리돼요. 당신은 작업에 집중하세요.
            </p>
            <div className="heroActions">
              <Link href="/today" className="primaryButton heroPrimary" data-testid="landing-demo">
                무료로 시작하기
                <ArrowRight size={18} />
              </Link>
              <Link href="/demo/r" className="secondaryButton" data-testid="landing-customer-demo">
                <MousePointerClick size={18} aria-hidden="true" />
                가입 없이 고객 화면 체험
              </Link>
            </div>
            {/* 사실만 적는다: 로그인은 Google만, 결제 기능이 아직 없어 카드를 받지 않는다, 무료 한도는 entitlements 값. */}
            <ul className="heroReassure" aria-label="시작 조건" data-testid="landing-reassure">
              <li><Check size={15} aria-hidden="true" /> Google 계정으로 가입</li>
              <li><Check size={15} aria-hidden="true" /> 카드 등록 없음</li>
              <li><Check size={15} aria-hidden="true" /> 무료로 동시 {PLAN_LIMITS.free.activeJobs}건 · 누적 {PLAN_LIMITS.free.totalJobs}건</li>
            </ul>
            <p className="heroGuideLinks">
              <a href="#workflow">어떻게 편해지나요?</a>
              <span aria-hidden="true">·</span>
              <Link href="/guide" data-testid="landing-guide">그림 사용설명서</Link>
            </p>
          </div>

          <ProductPreview />
        </section>

        <section className="promiseBand" aria-label="핵심 가치">
          <p data-tone="peach"><Coffee size={19} /><span>하루 커피 한 잔 값에</span><strong>잡일 담당 한 명</strong></p>
          <p data-tone="forest"><PackageCheck size={19} /><span>주문마다 조건을 다시 적지 않고</span><strong>패키지로 자동 조립</strong></p>
          <p data-tone="cream"><BellRing size={19} /><span>마감과 고객 대기를</span><strong>앱을 열면 먼저 정리</strong></p>
        </section>

        <section className="workflowSection" id="workflow">
          <div className="workflowInner">
            <div className="workflowIntro">
              <h2>처음 한 번만 정리하면,<br />다음 주문부터는 고르기만.</h2>
              <p>패키지를 한 번 저장해두면, 주문마다 반복되던 할 일과 마감이 바로 펼쳐져요.</p>
            </div>
            <ol className="workflowRail">
              <li>
                <span>처음 한 번</span>
                <div><PackageCheck size={21} /><strong>내 패키지 저장</strong><p>금액, 기간, 수정 횟수와 기본 Todo를 등록해요.</p></div>
              </li>
              <li>
                <span>주문이 오면</span>
                <div><MousePointer2 size={21} /><strong>네 가지만 선택</strong><p>고객, 시작일, 패키지, 옵션만 고르면 계산이 끝나요.</p></div>
              </li>
              <li>
                <span>매일 아침</span>
                <div><CheckCircle2 size={21} /><strong>오늘 화면에서 처리</strong><p>완료, 대기, 수정 사용을 한두 번의 탭으로 남겨요.</p></div>
              </li>
            </ol>
          </div>
        </section>

        <section className="revisionSection" id="revision">
          <div className="revisionCopy">
            <h2>수정 요청은 말이 아니라<br />기록과 횟수로 남겨요.</h2>
            <p>
              고객이 링크로 남긴 요청은 먼저 확인 대기로 들어오고, 작업자가 수정을 마치면 그때 1회로 세요.
              메신저·이메일·전화로 온 요청도 직접 기록해서 같은 타임라인에 남아요.
            </p>
            <ul>
              <li><CheckCircle2 size={18} /> 링크 요청은 확인 대기로 접수</li>
              <li><CheckCircle2 size={18} /> &lsquo;수정 완료&rsquo;를 누를 때 1회 차감</li>
              <li><CheckCircle2 size={18} /> 질문·중복은 반려, 횟수를 쓰지 않음</li>
              <li><CheckCircle2 size={18} /> 남은 수정을 다 쓰면 추가 작업으로 분리</li>
            </ul>
            {/* 작업자 '수정 완료' 기준으로 센다. 고객 확인 뒤 차감은 아직 없어서 현재 기능처럼 쓰지 않는다(docs/design/revision-count-and-customer-link.md). */}
            <p className="revisionNote" data-testid="landing-revision-note">고객이 결과를 확인한 뒤에 차감하는 방식은 아직 준비 전이에요.</p>
          </div>

          <div className="revisionPanel">
            <header>
              <div><span>오로라 스튜디오</span><strong>수정 요청 기록</strong></div>
              <span className="revisionCounter"><b>2</b> / 3회</span>
            </header>
            <div className="revisionEntries">
              <article>
                <span className="entryDot" />
                <div><small>고객 링크 · 어제 오후 4:12</small><p>메인 비주얼을 조금 더 밝게 부탁드립니다.</p></div>
                <span>수정 완료 −1</span>
              </article>
              <article>
                <span className="entryDot manual" />
                <div><small>카카오톡 · 오늘 오전 9:40</small><p>회사소개 문구 교체</p></div>
                <span>확인 대기</span>
              </article>
            </div>
            <footer><span>남은 수정</span><strong>1회</strong><span>초과하면 추가 작업 검토</span></footer>
          </div>
        </section>

        <section className="faqSection" id="faq">
          <div className="faqInner">
            <div className="faqIntro">
              <h2>궁금한 걸 먼저 짚어봤어요.</h2>
            </div>
            <div className="faqList">
              <details className="faqItem">
                <summary>크몽·숨고 같은 플랫폼이랑 뭐가 달라요?<span className="faqChevron"><ChevronRight size={16} /></span></summary>
                <p>판매·상담·결제는 플랫폼이 해줘요. 일감체크는 받은 주문을 직접 등록한 뒤 반복되는 납품 관리(마감·할 일·수정 횟수)를 챙겨요. 플랫폼의 주문이나 메시지를 자동으로 가져오지는 않아요. 다시 등록해서 파는 곳도 아니에요. 크몽·숨고에서 받든 인스타 DM이나 소개로 받든, 패키지를 정해두고 일하는 분이면 똑같이 기록할 수 있어요. 다만 플랫폼 안에서 진행하는 거래라면, 고객에게 외부 링크를 보내도 되는지 그 플랫폼 규정을 먼저 확인해 주세요.</p>
              </details>
              <details className="faqItem" data-testid="faq-now-and-not-yet">
                <summary>지금 되는 것과 아직 안 되는 것은요?<span className="faqChevron"><ChevronRight size={16} /></span></summary>
                <p><strong>지금 돼요.</strong> 패키지·옵션 저장과 재사용, 주문 직접 등록(금액·마감·할 일·수정 횟수 계산), 오늘 할 일·마감 정리, 로그인 없이 여는 고객 수정 요청 링크(직접 복사해서 보내요), 요청 접수 기록과 &lsquo;수정 완료&rsquo; 기준 횟수 차감, 시작 전 받을 자료 목록(고객 링크에 표시), 추가요청 기록.</p>
                <p><strong>아직 안 돼요.</strong> 플랫폼·메신저의 주문과 대화 자동 수집, 고객에게 자동 답장, 고객 확인과 연결된 차감, 웹에서 새 요청 알림, 결제.</p>
              </details>
              <details className="faqItem">
                <summary>새 의뢰 하나 넣는 데 얼마나 걸려요?<span className="faqChevron"><ChevronRight size={16} /></span></summary>
                <p>패키지만 처음 한 번 등록해두면 새 주문은 고객, 시작일, 패키지, 옵션 네 가지만 고르면 돼요. 저장하면 금액, 마감, 할 일, 수정 횟수가 함께 채워져요.</p>
              </details>
              <details className="faqItem">
                <summary>수정 요청은 어떻게 관리돼요?<span className="faqChevron"><ChevronRight size={16} /></span></summary>
                <p>고객이 링크로 보낸 요청은 먼저 확인 대기로 쌓이고, 작업자가 고친 뒤 &lsquo;수정 완료&rsquo;를 누를 때 1회 차감돼요. 질문이나 중복은 반려하면 횟수를 쓰지 않고, 남은 수정을 다 쓴 뒤의 요청은 &lsquo;추가 작업으로&rsquo; 분류해 따로 협의해요. 메신저·이메일·전화로 온 요청도 직접 기록하고, 이미 고쳤다면 바로 완료로 적을 수 있어요. 고객이 결과를 확인한 뒤에 차감하는 방식은 아직 준비 전이에요.</p>
              </details>
              <details className="faqItem">
                <summary>모바일에서도 되나요?<span className="faqChevron"><ChevronRight size={16} /></span></summary>
                <p>네. 모바일 우선으로 만들어서 오늘 할 일·고객 대기·수정 사용을 한 손으로 처리할 수 있어요. 앱을 열면 마감 이틀·하루 전과 지연된 일을 먼저 정리해서 보여줘요. (기기로 먼저 찾아가는 예약 푸시 알림은 아직 준비 중이에요.)</p>
              </details>
              <details className="faqItem">
                <summary>내 데이터는 안전한가요?<span className="faqChevron"><ChevronRight size={16} /></span></summary>
                <p>결제 정보는 저장하지 않아요. 내 데이터는 언제든 JSON으로 내보내거나 계정과 함께 삭제할 수 있어요.</p>
              </details>
              <details className="faqItem">
                <summary>요금은 어떻게 되나요?<span className="faqChevron"><ChevronRight size={16} /></span></summary>
                <p>무료 플랜은 동시에 진행하는 의뢰 {PLAN_LIMITS.free.activeJobs}건, 지금까지 만든 의뢰 누적 {PLAN_LIMITS.free.totalJobs}건까지예요. 완료한 의뢰는 동시 진행 수에서는 빠지지만 누적 수에서는 빠지지 않아요. 더 필요하면 Basic({PLAN_PRICES.basic.label}) 또는 Pro({PLAN_PRICES.pro.label})로 넓힐 수 있어요. 결제는 아직 준비 중입니다. 30일 Pro 이용 코드를 적용한 계정은 결제 오픈 후 Basic 정가 월 14,900원을 월 9,900원에 12개월 이용할 수 있어요.</p>
              </details>
            </div>
          </div>
        </section>

        <section className="finalCta">
          <div>
              <p>직원을 뽑기엔 아직 이르고, 잡일은 이미 많다면</p>
            <h2>운영은 덜고, 작업에 더 집중하세요.</h2>
          </div>
          <Link href="/today" className="invertedButton">
            무료로 시작하기
            <ArrowRight size={18} />
          </Link>
        </section>
      </main>

      <footer className="marketingFooter">
        <div className="marketingFooterTop">
          <div className="marketingFooterIdentity">
            <Brand />
            <small>© {new Date().getFullYear()} 일감체크. All rights reserved.</small>
          </div>
          <nav aria-label="정책 및 문의">
            <a href="#faq">FAQ</a>
            <Link href="/guide">사용설명서</Link>
            <Link href="/terms">이용약관</Link>
            <Link href="/privacy">개인정보처리방침</Link>
            {service.supportEmail && <a href={`mailto:${service.supportEmail}`}>문의</a>}
          </nav>
        </div>
        <dl className="marketingFooterLegal" role="group" aria-label="사업자 정보">
          <div><dt>사업자</dt><dd>{legal.businessName}</dd></div>
          <div><dt>대표자</dt><dd>{legal.representative}</dd></div>
          <div><dt>사업자등록번호</dt><dd>{legal.regNo}</dd></div>
          <div><dt>통신판매업신고</dt><dd>{legal.mailOrderNo}</dd></div>
          <div><dt>주소</dt><dd>{legal.address}</dd></div>
          <div><dt>연락처</dt><dd>{legal.phone}</dd></div>
          <div><dt>문의</dt><dd><a href={`mailto:${supportEmail}`}>{supportEmail}</a></dd></div>
        </dl>
      </footer>
    </div>
  );
}
