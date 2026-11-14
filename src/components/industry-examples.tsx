import Link from "next/link";
import { ArrowRight } from "lucide-react";

import type { OptionTemplate } from "@/lib/domain";
import { SIGNUP_START_HREF, signupStartHref } from "@/lib/signup-start";
import { INDUSTRY_LABELS, INDUSTRY_ORDER, INDUSTRY_STARTERS } from "@/lib/store/industry-starters";
import { Brand } from "./brand";
import { SignupOffer } from "./signup-offer";

const won = new Intl.NumberFormat("ko-KR");

export const EXAMPLES_NOTICE = "금액과 횟수는 예시예요. 업계 평균이 아니에요. 가입 뒤 패키지 화면에서 고쳐 써요.";

/** '범위 밖·추가 작업' 묶음에는 금액·기간·수정 횟수 중 하나라도 더해지는 옵션만 보여 준다. */
function addsSomething(option: OptionTemplate): boolean {
  return option.priceDelta !== 0 || option.durationDaysDelta !== 0 || option.revisionLimitDelta !== 0;
}

function optionPrice(option: OptionTemplate): string {
  return option.priceDelta === 0 ? "금액 그대로" : `+${won.format(option.priceDelta)}원`;
}

function optionDuration(option: OptionTemplate): string {
  return option.durationDaysDelta === 0 ? "기간 그대로" : `+${option.durationDaysDelta}일`;
}

/**
 * 업종별 예시 패키지 공개 페이지(/examples). 로그인 없이 본다.
 * 숫자는 모두 INDUSTRY_STARTERS에서만 가져온다. 새 숫자나 평균을 여기 적지 않는다.
 * 버튼은 `/today?starter=<업종>&invite=BETA2026`으로 가고(signup-start.ts), 오늘 화면이 업종 칩과 같은 applyIndustryStarter를 한 번 부른다.
 * 블로그 글이 쓰는 옛 구역 주소(`#examples-design` 등)도 각 구역 맨 위의 빈 표시로 이어 준다(기존 `#design`도 그대로).
 */
export function IndustryExamples() {
  return (
    <div className="guidePage examplesPage">
      <header className="guideHeader">
        <Brand />
        <nav aria-label="예시 페이지 메뉴">
          <Link href="/guide" className="guideHeaderExtra">사용설명서</Link>
          <Link href="/today" className="guideHeaderLogin" data-testid="examples-header-login">로그인</Link>
          <Link href={SIGNUP_START_HREF} className="guideHeaderStart" data-testid="examples-header-start">무료로 시작하기</Link>
        </nav>
      </header>

      <main className="guideMain examplesMain">
        <h1>업종별 예시 패키지</h1>
        <p className="examplesLead">
          주문마다 고르기만 하면 되는 패키지를 업종별로 미리 만들어 뒀어요. 금액·기간·포함 수정 횟수·받을 자료를 보고, 맞는 예시로 시작해요.
        </p>
        <p className="examplesNotice" data-testid="examples-notice">{EXAMPLES_NOTICE}</p>
        <SignupOffer testId="examples-offer" className="examplesOffer" />
        <Link href="/try" className="examplesTry" data-testid="examples-try">가입 없이 둘러보기</Link>

        <nav className="examplesJump" aria-label="업종 바로 가기">
          {INDUSTRY_ORDER.map((industry) => (
            <a key={industry} href={`#${industry}`}>{INDUSTRY_LABELS[industry]}</a>
          ))}
        </nav>

        {INDUSTRY_ORDER.map((industry) => {
          const starter = INDUSTRY_STARTERS[industry];
          const label = INDUSTRY_LABELS[industry];
          return (
            <section key={industry} id={industry} className="examplesIndustry" aria-labelledby={`examples-${industry}-title`} data-testid={`examples-${industry}`}>
              <span id={`examples-${industry}`} className="examplesAnchor" data-testid={`examples-anchor-${industry}`} />
              <h2 id={`examples-${industry}-title`}>{label}</h2>

              <ul className="examplesPackages">
                {starter.packages.map((item) => (
                  <li key={item.id} className="examplesPackage" data-testid={`examples-package-${item.id}`}>
                    <h3>{item.name}</h3>
                    <p className="examplesDescription">{item.description}</p>
                    <p className="examplesPrice">{won.format(item.price)}원</p>
                    <dl className="examplesFacts">
                      <div><dt>기간</dt><dd>{item.durationDays}일</dd></div>
                      <div><dt>포함 수정</dt><dd>{item.revisionLimit}회</dd></div>
                    </dl>
                    {(item.intakeItems?.length ?? 0) > 0 && (
                      <div className="examplesIntake">
                        <p>시작 전 받을 자료</p>
                        <ul>
                          {item.intakeItems?.map((name) => <li key={name}>{name}</li>)}
                        </ul>
                      </div>
                    )}
                  </li>
                ))}
              </ul>

              <div className="examplesOptions" data-testid={`examples-options-${industry}`}>
                <h3>범위 밖·추가 작업은 이렇게 더해요</h3>
                <ul>
                  {starter.options.filter(addsSomething).map((option) => (
                    <li key={option.id}>
                      <span className="examplesOptionName">{option.name}</span>
                      <span className="examplesOptionDelta">
                        {optionPrice(option)} · {optionDuration(option)}
                        {option.revisionLimitDelta !== 0 && ` · 수정 +${option.revisionLimitDelta}회`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <Link href={signupStartHref(industry)} className="primaryButton examplesStart" data-testid={`examples-start-${industry}`}>
                이 예시로 시작하기<span className="srOnly"> ({label})</span>
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <SignupOffer testId={`examples-offer-${industry}`} className="examplesSectionOffer" />
            </section>
          );
        })}
      </main>

      <footer className="guideFooter">
        <Link href="/">일감체크 소개</Link>
        <Link href="/guide">사용설명서</Link>
        <Link href="/terms">이용약관</Link>
        <Link href="/privacy">개인정보처리방침</Link>
      </footer>
    </div>
  );
}
