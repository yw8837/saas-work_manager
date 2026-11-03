"use client";

import { Percent } from "lucide-react";
import { useState } from "react";
import {
  feeRateForSource,
  ORDER_SOURCE_LABELS,
  ORDER_SOURCES,
  parseFeeRateInput,
  type FeeRates,
  type OrderSource,
} from "@/lib/domain";
import { useWorkspace } from "./workspace-provider";

const INVALID_MESSAGE = "0~100 사이 숫자로, 소수점 한 자리까지 적어 주세요.";

function FeeRateField({ source, rates, onSave }: { source: OrderSource; rates: FeeRates | undefined; onSave: (rate: number) => void }) {
  const saved = feeRateForSource(rates, source);
  const [draft, setDraft] = useState(saved > 0 ? String(saved) : "");
  const [error, setError] = useState(false);
  const label = ORDER_SOURCE_LABELS[source];
  const inputId = `fee-rate-${source}`;

  const commit = () => {
    const parsed = parseFeeRateInput(draft);
    if (parsed === undefined) {
      setError(true);
      return;
    }
    setError(false);
    if (parsed !== saved) onSave(parsed);
  };

  return (
    <div className="feeRateField">
      <label htmlFor={inputId}>
        {label}<span className="srOnly"> 떼이는 비율(%)</span>
      </label>
      <span className="feeRateInput">
        <input
          id={inputId}
          type="text"
          inputMode="decimal"
          maxLength={5}
          placeholder="0"
          value={draft}
          aria-invalid={error || undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          data-testid={inputId}
        />
        <span aria-hidden="true">%</span>
      </span>
      {error && <small id={`${inputId}-error`} className="feeRateError" role="alert">{INVALID_MESSAGE}</small>}
    </div>
  );
}

/**
 * 받은 곳별 떼이는 비율(%). 기본값은 전부 비어 있다(크몽·숨고 비율을 지어내 넣지 않음).
 * 새 일감을 만들 때 그 받은 곳의 값이 일감에 남고, 바꿔도 이미 만든 일감 금액은 그대로다. 세금 계산은 하지 않는다.
 */
export function FeeRateSettings() {
  const { settings, updateSettings } = useWorkspace();
  const rates = settings.feeRates;

  const save = (source: OrderSource, rate: number) => {
    const next: FeeRates = { ...(rates ?? {}) };
    if (rate > 0) next[source] = rate;
    else delete next[source];
    updateSettings({ feeRates: next });
  };

  return (
    <section className="contentSection settingSection" data-testid="fee-rate-section" aria-labelledby="fee-rate-title">
      <div className="sectionHeadingRow"><div><h2 id="fee-rate-title">받은 곳별 떼이는 비율</h2></div><Percent size={20} /></div>
      <div className="feeRateGrid">
        {ORDER_SOURCES.map((source) => (
          // 다른 기기에서 값이 바뀌면 그 칸만 새 값으로 다시 그린다.
          <FeeRateField key={`${source}:${feeRateForSource(rates, source)}`} source={source} rates={rates} onSave={(rate) => save(source, rate)} />
        ))}
      </div>
      <p className="planPrice">내 계약·정산 내역 기준으로 적어 주세요. 비워 두면 떼지 않아요. 새 일감부터 반영되고, 이미 만든 일감 금액은 그대로예요.</p>
    </section>
  );
}
