import { BETA_OFFER_TEXT, FREE_PLAN_TEXT } from "@/lib/signup-start";

/** 시작 버튼 옆 안내 두 줄(베타 코드 혜택·무료 범위). 화면마다 말이 달라지지 않게 문장은 signup-start.ts에서만 가져온다. */
export function SignupOffer({ testId, className, betaOnly }: { testId: string; className?: string; betaOnly?: boolean }) {
  return (
    <p className={className ? `signupOffer ${className}` : "signupOffer"} data-testid={testId}>
      <span>{BETA_OFFER_TEXT}</span>
      {betaOnly ? null : <> <span>{FREE_PLAN_TEXT}</span></>}
    </p>
  );
}
