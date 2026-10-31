"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Info, RotateCcw } from "lucide-react";

import { PublicRevisionView } from "@/components/public-revision-view";
import { customerProgressOf, customerStageOf } from "@/lib/domain/customer-stage";
import {
  createCustomerDemoState,
  SAMPLE_WORKER_NAME,
  submitCustomerDemoRevision,
  viewCustomerDemo,
  type CustomerDemoState,
} from "@/lib/demo/sample-order";

const wonFormatter = new Intl.NumberFormat("ko-KR");

/**
 * 로그인 없이 "고객은 이런 화면을 받는다"를 체험하는 링크.
 * 실제 고객 링크와 같은 화면(PublicRevisionView)을 쓰지만, 요청은 이 컴포넌트의 메모리 상태에만 남는다.
 * 작업공간·Supabase·localStorage를 import하지 않는다. 새로고침하면 처음 상태로 돌아간다.
 */
export function CustomerRevisionDemo({ initialState }: { initialState?: CustomerDemoState }) {
  const [state, setState] = useState<CustomerDemoState>(() => initialState ?? createCustomerDemoState());
  // 같은 이벤트 안에서 연달아 제출돼도 차감이 겹치지 않게 최신 상태를 따로 잡아 둔다.
  const stateRef = useRef(state);
  const [resetKey, setResetKey] = useState(0);
  const view = viewCustomerDemo(state);

  async function submit({ name, content }: { name: string; content: string }) {
    const result = submitCustomerDemoRevision(stateRef.current, { body: content, clientLabel: name });
    stateRef.current = result.state;
    setState(result.state);
    return result.usage;
  }

  function reset() {
    const fresh = createCustomerDemoState();
    stateRef.current = fresh;
    setState(fresh);
    setResetKey((value) => value + 1);
  }

  const notice = (
    <section className="demoNotice" aria-label="체험 안내">
      <p className="demoNoticeLead" role="note">
        <Info size={16} aria-hidden="true" />
        <span><strong>체험용 예시 화면이에요.</strong> 남긴 내용은 실제로 전송되지 않아요.</span>
      </p>
      <dl className="demoOrderFacts" aria-label="작업자가 등록한 예시 주문">
        <div><dt>패키지</dt><dd>{view.packageName}</dd></div>
        <div><dt>금액</dt><dd>{wonFormatter.format(view.amount)}원</dd></div>
        <div><dt>마감</dt><dd>{view.daysLeft}일 남음</dd></div>
        <div>
          <dt>수정</dt>
          <dd data-testid="demo-revision-usage">{view.revision.included}회 중 {view.revision.used}회 사용</dd>
        </div>
      </dl>
      <p className="demoNoticeSub">
        위 주문 정보는 작업자 화면 기준이에요. 실제 고객 화면에는 금액·연락처가 보이지 않아요.
      </p>
      <p className="demoNoticeSub" data-testid="demo-preview-only">
        실제 고객 링크에도 마감일·진행 단계·남은 수정 횟수가 같은 모양으로 보여요. 작업자 이름은 설정에서 적은 경우에만 보여요.
      </p>
      <div className="demoNoticeActions">
        <Link href="/guide">사용설명서 보기</Link>
        {state.submitted > 0 && (
          <button type="button" className="demoResetButton" onClick={reset}>
            <RotateCcw size={14} aria-hidden="true" /> 처음 상태로
          </button>
        )}
      </div>
    </section>
  );

  return (
    <PublicRevisionView
      key={resetKey}
      pageClassName="demoRevisionPage"
      before={notice}
      title={view.title}
      packageName={view.packageName}
      revision={view.revision}
      workerName={SAMPLE_WORKER_NAME}
      dueLabel={`${view.daysLeft}일 남음`}
      stage={customerStageOf(state.order)}
      progress={customerProgressOf(state.order)}
      badgeLabel="체험용 · 전송 안 됨"
      footnote="체험 화면이라 남긴 내용은 어디에도 전송·저장되지 않아요. 새로고침하면 처음 상태로 돌아가요."
      onSubmit={submit}
    />
  );
}
