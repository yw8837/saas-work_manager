import { Sparkles } from "lucide-react";

/** 주문 하나가 끝나기까지 누가 무엇을 하고, 일감체크가 무엇을 대신 해 주는지 한 장에 보인다. */
export type FlowActor = "me" | "customer";

export type FlowStep = {
  id: string;
  actor: FlowActor;
  title: string;
  action: string;
  auto?: string;
};

export const FLOW_ACTOR_LABEL: Record<FlowActor, string> = { me: "나", customer: "고객" };

// 기능 상태는 PRODUCT.md '기능 상태'와 맞춘다. 자동으로 보내거나 가져오는 일은 없으니 '자동'에는 화면 안에서 채워지는 것만 적는다.
export const FLOW_STEPS: FlowStep[] = [
  { id: "order", actor: "me", title: "주문이 와요", action: "크몽·숨고·카톡 어디서 왔든 괜찮아요." },
  { id: "register", actor: "me", title: "일감 등록", action: "고객·시작일·패키지·옵션만 골라요.", auto: "금액·마감·할 일·수정 횟수가 채워져요" },
  { id: "kickoff", actor: "me", title: "시작 안내 보내기", action: "카톡 문구 하나를 복사해 보내요.", auto: "링크·받을 자료·질문이 문구에 들어가요" },
  { id: "materials", actor: "customer", title: "자료·답 보내기", action: "카톡으로 답해도 돼요. 나는 체크만 해요.", auto: "남은 것만 다시 요청하는 문구가 생겨요" },
  { id: "work", actor: "me", title: "작업하고 시안 보내기", action: "오늘 화면에서 급한 것부터 해요.", auto: "마감 가까운 순으로 정리돼요" },
  { id: "revision", actor: "customer", title: "수정 요청", action: "링크에 남기면 '확인 대기'로 들어와요.", auto: "고객 링크에 남은 수정 횟수가 보여요" },
  { id: "revision-done", actor: "me", title: "고치고 '수정 완료'", action: "누를 때 1회를 써요. 범위 밖은 '추가 작업으로'.", auto: "남은 횟수가 줄고 기록이 남아요" },
  { id: "complete", actor: "me", title: "납품하고 '일감 완료'", action: "끝난 주문을 완료로 바꿔요.", auto: "월별 정리에 매출이 모여요" },
];

export function WorkFlowChart({
  headingId,
  heading = "주문 하나가 끝나기까지",
  headingLevel = "h2",
}: {
  headingId: string;
  heading?: string;
  headingLevel?: "h2" | "h3";
}) {
  const Heading = headingLevel;
  return (
    <section className="flowChart" aria-labelledby={headingId} data-testid="work-flow-chart">
      <div className="flowChartHead">
        <Heading id={headingId}>{heading}</Heading>
        <p className="flowLegend" aria-label="표시 뜻">
          <span className="flowWho" data-actor="me">나</span> 내가 할 일
          <span className="flowWho" data-actor="customer">고객</span> 고객이 할 일
          <span className="flowAutoMark"><Sparkles size={13} aria-hidden="true" /> 자동</span> 일감체크가 해 줘요
        </p>
      </div>
      <ol className="flowSteps">
        {FLOW_STEPS.map((step, index) => (
          <li key={step.id} className="flowStep" data-actor={step.actor} data-testid={`flow-step-${step.id}`}>
            <span className="flowNumber" aria-hidden="true">{index + 1}</span>
            <div className="flowBody">
              <p className="flowTitle">
                <span className="flowWho" data-actor={step.actor}>{FLOW_ACTOR_LABEL[step.actor]}</span>
                <strong>{step.title}</strong>
              </p>
              <p className="flowAction">{step.action}</p>
            </div>
            {step.auto ? (
              <p className="flowAuto">
                <Sparkles size={14} aria-hidden="true" />
                <span><b className="flowAutoTag">자동</b> {step.auto}</span>
              </p>
            ) : <span className="flowAutoEmpty" aria-hidden="true" />}
          </li>
        ))}
      </ol>
    </section>
  );
}
