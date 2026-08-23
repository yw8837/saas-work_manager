import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  CheckCircle2,
  ChevronRight,
  Coffee,
  MousePointer2,
  PackageCheck,
} from "lucide-react";
import { Brand } from "./brand";
import { ProductPreview } from "./product-preview";
import { getPublicServiceConfig } from "@/lib/policies";
import { PLAN_LIMITS, PLAN_PRICES } from "@/lib/domain";
import { requestedStorageMode } from "@/lib/supabase/mode";

export function MarketingHome() {
  const service = getPublicServiceConfig();
  const hosted = requestedStorageMode() === "hosted";

  // 전자상거래법 사업자 정보 고지 — 배포 시 NEXT_PUBLIC_* 로 주입, 미설정이면 정직하게 등록 전 고지
  const legal = {
    businessName: process.env.NEXT_PUBLIC_BUSINESS_NAME?.trim() || null,
    owner: process.env.NEXT_PUBLIC_BUSINESS_OWNER?.trim() || service.operatorName,
    regNo: process.env.NEXT_PUBLIC_BUSINESS_NUMBER?.trim() || null,
    mailOrderNo: process.env.NEXT_PUBLIC_MAIL_ORDER_NUMBER?.trim() || null,
    address: process.env.NEXT_PUBLIC_BUSINESS_ADDRESS?.trim() || null,
    phone: process.env.NEXT_PUBLIC_BUSINESS_PHONE?.trim() || null,
  };
  const hasLegalInfo = Object.values(legal).some(Boolean);

  return (
    <div className="marketingPage">
      <header className="marketingHeader">
        <Brand />
        <nav className="marketingNav" aria-label="소개 메뉴">
          <a href="#workflow">사용 방식</a>
          <a href="#revision">수정 관리</a>
          <a href="#faq">자주 묻는 질문</a>
        </nav>
        <Link href="/today" className="headerDemoLink">
          {hosted ? "초대 베타 로그인" : "바로 시작"}
          <ChevronRight size={16} />
        </Link>
      </header>

      <main>
        <section className="heroSection">
          <div className="heroCopy">
            <h1>
              1인 사업자는<br />
              <span>1인분만 하세요.</span>
            </h1>
            <p className="heroLead">
              패키지로 받은 주문을 고르면 할 일, 마감, 수정 횟수와 알림이 한 번에 준비돼요.
            </p>
            <div className="heroActions">
              <Link href="/today" className="primaryButton heroPrimary" data-testid="landing-demo">
                {hosted ? "초대받은 베타 참여자 로그인" : "지금 바로 시작"}
                <ArrowRight size={18} />
              </Link>
              <a href="#workflow" className="secondaryButton">
                어떻게 편해지나요?
              </a>
            </div>
          </div>

          <ProductPreview />
        </section>

        <section className="promiseBand" aria-label="핵심 가치">
          <p data-tone="peach"><Coffee size={19} /><span>하루 커피 한 잔 값에</span><strong>잡일 담당 한 명</strong></p>
          <p data-tone="forest"><PackageCheck size={19} /><span>주문을 다시 옮겨 적지 않고</span><strong>패키지로 자동 조립</strong></p>
          <p data-tone="cream"><BellRing size={19} /><span>마감과 고객 대기를</span><strong>앱을 열면 먼저 정리</strong></p>
        </section>

        <section className="workflowSection" id="workflow">
          <div className="workflowInner">
            <div className="workflowIntro">
              <h2>처음 한 번만 정리하면,<br />다음 주문부터는 고르기만.</h2>
              <p>받은 주문을 다시 관리하는 플랫폼이 아니에요. 수주 후 반복되는 잡일만 자동으로 펼쳐줘요.</p>
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
              고객은 링크로 요청하고, 카톡으로 온 급한 수정은 작업자가 직접 기록해요.
              어느 경로로 와도 같은 타임라인과 남은 횟수에 쌓여요.
            </p>
            <ul>
              <li><CheckCircle2 size={18} /> 고객 링크 요청은 자동 카운트</li>
              <li><CheckCircle2 size={18} /> 메신저 요청도 바로 수동 기록</li>
              <li><CheckCircle2 size={18} /> 초과 요청은 추가 작업으로 분리</li>
            </ul>
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
                <span>자동 −1</span>
              </article>
              <article>
                <span className="entryDot manual" />
                <div><small>카카오톡 · 오늘 오전 9:40</small><p>회사소개 문구 교체</p></div>
                <span>수동 기록</span>
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
                <p>판매·상담·결제는 플랫폼이 해줘요. 일감체크는 수주 이후에 반복되는 납품 관리(마감·할 일·수정 횟수)만 자동으로 챙겨요. 다시 등록해서 파는 곳이 아니에요. 크몽·숨고에서 받든 인스타 DM이나 소개로 받든, 패키지를 정해두고 일하는 분이면 업종과 상관없이 똑같이 쓸 수 있어요.</p>
              </details>
              <details className="faqItem">
                <summary>새 의뢰 하나 넣는 데 얼마나 걸려요?<span className="faqChevron"><ChevronRight size={16} /></span></summary>
                <p>패키지만 처음 한 번 등록해두면 새 주문은 고객, 시작일, 패키지, 옵션 네 가지만 고르면 돼요. 저장하면 금액, 마감, 할 일, 수정 횟수가 함께 채워져요.</p>
              </details>
              <details className="faqItem">
                <summary>수정 요청은 어떻게 관리돼요?<span className="faqChevron"><ChevronRight size={16} /></span></summary>
                <p>고객이 링크로 보낸 요청은 자동으로 1회 차감되고, 카톡·DM으로 온 요청은 직접 기록해요. 어느 경로로 와도 같은 타임라인과 남은 횟수에 쌓이고, 초과 요청은 추가 작업으로 분리돼요.</p>
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
                <p>무료 플랜은 동시에 진행하는 의뢰 {PLAN_LIMITS.free.activeJobs}건, 지금까지 만든 의뢰 누적 {PLAN_LIMITS.free.totalJobs}건까지예요. 완료한 의뢰는 동시 진행 수에서는 빠지지만 누적 수에서는 빠지지 않아요. 더 필요하면 Basic({PLAN_PRICES.basic.label}) 또는 Pro({PLAN_PRICES.pro.label})로 넓히는 구조예요. 결제는 아직 준비 중이며, 베타 참여자에게는 종료 뒤 Basic을 월 9,900원에 12개월 유지하는 혜택을 제안할 예정이에요.</p>
              </details>
            </div>
          </div>
        </section>

        <section className="finalCta">
          <div>
            <p>직원을 뽑기엔 아직 이르고, 잡일은 이미 많다면</p>
            <h2>오늘 할 일부터 가볍게 맡겨봐요.</h2>
          </div>
          <Link href="/today" className="invertedButton">
            {hosted ? "베타 계정으로 로그인" : "지금 시작하기"}
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
            <Link href="/terms">이용약관</Link>
            <Link href="/privacy">개인정보처리방침</Link>
            {service.supportEmail && <a href={`mailto:${service.supportEmail}`}>문의</a>}
          </nav>
        </div>
        {hasLegalInfo && <dl className="marketingFooterLegal" aria-label="운영 정보">
          {legal.businessName && <div><dt>사업자</dt><dd>{legal.businessName}</dd></div>}
          {legal.owner && <div><dt>운영</dt><dd>{legal.owner}</dd></div>}
          {legal.regNo && <div><dt>사업자등록번호</dt><dd>{legal.regNo}</dd></div>}
          {legal.mailOrderNo && <div><dt>통신판매업신고</dt><dd>{legal.mailOrderNo}</dd></div>}
          {legal.address && <div><dt>주소</dt><dd>{legal.address}</dd></div>}
          {legal.phone && <div><dt>연락처</dt><dd>{legal.phone}</dd></div>}
          {service.supportEmail && <div><dt>문의</dt><dd><a href={`mailto:${service.supportEmail}`}>{service.supportEmail}</a></dd></div>}
        </dl>}
      </footer>
    </div>
  );
}
