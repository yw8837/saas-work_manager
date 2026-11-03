import { describe, expect, it } from "vitest";

import { cancelAddon, composeJob, confirmAddon, createAddon } from "./engine";
import { marginShortfall } from "./margin-floor";
import { setJobSource } from "./order-source";
import {
  confirmedAddonAmount,
  feeRateForSource,
  jobFee,
  jobFeeRate,
  jobNetAmount,
  normalizeFeeRate,
  parseFeeRateInput,
} from "./platform-fee";
import type { PackageTemplate } from "./types";

const basic: PackageTemplate = {
  id: "pkg_basic",
  name: "Basic 홈페이지",
  price: 1_410_000,
  estimatedCost: 95_000,
  durationDays: 7,
  revisionLimit: 1,
  tasks: [{ taskKey: "brief", title: "의뢰서 확인", relativeDay: 0, order: 0 }],
};

function job(feeRate?: number) {
  return composeJob({
    jobId: "job_fee",
    clientLabel: "카페 모라",
    startDate: "2026-11-03",
    package: basic,
    source: "kmong",
    now: "2026-11-03T00:00:00.000Z",
    ...(feeRate === undefined ? {} : { feeRate }),
  });
}

describe("받은 곳별 떼이는 비율(수수료)", () => {
  it("입력 글은 0~100, 소수점 한 자리까지만 받고 빈칸은 0(안 뗌)", () => {
    expect(parseFeeRateInput("")).toBe(0);
    expect(parseFeeRateInput("  ")).toBe(0);
    expect(parseFeeRateInput("20")).toBe(20);
    expect(parseFeeRateInput(" 15.5 ")).toBe(15.5);
    expect(parseFeeRateInput("0")).toBe(0);
    expect(parseFeeRateInput("100")).toBe(100);
    expect(parseFeeRateInput("100.0")).toBe(100);
    expect(parseFeeRateInput("100.1")).toBeUndefined();
    expect(parseFeeRateInput("101")).toBeUndefined();
    expect(parseFeeRateInput("15.55")).toBeUndefined();
    expect(parseFeeRateInput("-1")).toBeUndefined();
    expect(parseFeeRateInput("abc")).toBeUndefined();
    expect(parseFeeRateInput("1e1")).toBeUndefined();
    expect(parseFeeRateInput(".5")).toBeUndefined();
    expect(parseFeeRateInput("20%")).toBeUndefined();
  });

  it("저장본의 비율은 0~100 숫자만 믿고 소수점 한 자리로 맞춘다(아니면 0)", () => {
    expect(normalizeFeeRate(20)).toBe(20);
    expect(normalizeFeeRate(15.55)).toBe(15.6);
    expect(normalizeFeeRate(undefined)).toBe(0);
    expect(normalizeFeeRate("20")).toBe(0);
    expect(normalizeFeeRate(-3)).toBe(0);
    expect(normalizeFeeRate(120)).toBe(0);
    expect(normalizeFeeRate(Number.NaN)).toBe(0);
  });

  it("기본값은 전부 비어 있어 어느 받은 곳도 떼지 않는다(크몽·숨고 비율을 미리 넣지 않음)", () => {
    expect(feeRateForSource(undefined, "kmong")).toBe(0);
    expect(feeRateForSource({}, "soomgo")).toBe(0);
    expect(feeRateForSource({ kmong: 20 }, "kmong")).toBe(20);
    expect(feeRateForSource({ kmong: 20 }, "referral")).toBe(0);
    expect(feeRateForSource({ kmong: 20 }, undefined)).toBe(0);
  });

  it("수수료는 계약 금액에 비율을 곱해 원 단위로 반올림한다", () => {
    expect(jobFee({ amount: 1_410_000, feeRate: 20 })).toBe(282_000);
    expect(jobFee({ amount: 1_410_000, feeRate: 15.5 })).toBe(218_550);
    expect(jobFee({ amount: 33_333, feeRate: 3.3 })).toBe(1_100);
    expect(jobFee({ amount: 1_410_000 })).toBe(0);
    expect(jobNetAmount({ amount: 1_410_000, feeRate: 20 })).toBe(1_128_000);
    expect(jobNetAmount({ amount: 1_410_000 })).toBe(1_410_000);
  });

  it("일감을 만들 때 비율을 스냅숏으로 남기고, 남는 돈(예상)은 수수료까지 뺀다", () => {
    const withFee = job(20);
    expect(withFee.feeRate).toBe(20);
    expect(jobFeeRate(withFee)).toBe(20);
    expect(withFee.amount).toBe(1_410_000);
    expect(withFee.margin).toBe(1_410_000 - 282_000 - 95_000);
  });

  it("비율이 0이거나 없으면 칸을 남기지 않고 남는 돈은 지금과 같다(예전 일감도 0으로 취급)", () => {
    const zero = job(0);
    expect("feeRate" in zero).toBe(false);
    expect(zero.margin).toBe(1_410_000 - 95_000);
    const none = job();
    expect("feeRate" in none).toBe(false);
    expect(jobFeeRate(none)).toBe(0);
    expect(jobFee(none)).toBe(0);
  });

  it("최소 남길 돈 경고는 수수료를 뺀 남는 돈을 기준으로 본다", () => {
    // 수수료 없이는 1,315,000원이 남아 기준(1,200,000원)을 넘지만, 20%를 떼면 1,033,000원이라 167,000원 모자라다.
    expect(marginShortfall(job().margin, 1_200_000)).toBeNull();
    expect(marginShortfall(job(20).margin, 1_200_000)).toBe(167_000);
  });

  it("확정한 추가요청에도 같은 비율을 떼고, 확정 취소는 정확히 되돌린다", () => {
    const base = job(20);
    const addon = createAddon(base, { addonId: "addon_1", title: "페이지 추가", amountDelta: 100_000, estimatedCostDelta: 10_000, durationDaysDelta: 0, createdAt: "2026-11-04T00:00:00.000Z" });
    const withDraft = { ...base, addons: [addon] };
    expect(confirmedAddonAmount(withDraft)).toBe(0);

    const confirmed = confirmAddon(withDraft, "addon_1", "2026-11-04T01:00:00.000Z");
    expect(confirmed.amount).toBe(1_510_000);
    expect(jobFee(confirmed)).toBe(302_000);
    expect(confirmed.margin).toBe(1_510_000 - 302_000 - 105_000);
    expect(confirmedAddonAmount(confirmed)).toBe(100_000);

    const cancelled = cancelAddon(confirmed, "addon_1", "2026-11-04T02:00:00.000Z");
    expect(cancelled.amount).toBe(base.amount);
    expect(cancelled.margin).toBe(base.margin);
    expect(confirmedAddonAmount(cancelled)).toBe(0);
  });

  it("받은 곳을 바꾸면 그때의 비율로 다시 남기고, 비율을 안 넘기면 스냅숏을 그대로 둔다", () => {
    const kmong = job(20);
    const toReferral = setJobSource(kmong, "referral", "2026-11-05T00:00:00.000Z", 0);
    expect("feeRate" in toReferral).toBe(false);
    expect(toReferral.margin).toBe(1_410_000 - 95_000);

    const back = setJobSource(toReferral, "soomgo", "2026-11-05T01:00:00.000Z", 12.5);
    expect(back.feeRate).toBe(12.5);
    expect(back.margin).toBe(1_410_000 - 176_250 - 95_000);

    // 예전 호출(비율 없이)은 받은 곳만 바꾼다.
    const sourceOnly = setJobSource(kmong, "referral", "2026-11-05T00:00:00.000Z");
    expect(sourceOnly.feeRate).toBe(20);
    expect(sourceOnly.margin).toBe(kmong.margin);
  });
});
