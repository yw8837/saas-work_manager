import { describe, expect, it } from "vitest";

import type { BetaParticipation } from "./apply-copy";
import {
  buildApplicationDrafts,
  buildDeletionDraft,
  buildNoticeDraft,
  findDraftProblems,
  type DraftApplication,
  type DraftOptions,
} from "./mail-drafts";
import { isBetaEligible, koreanDate, noticeDueAt } from "./rules";

const NOW = new Date("2026-11-01T03:00:00.000Z");
const OPTIONS: DraftOptions = {
  origin: "https://ilgam.example.test",
  interviewScheduleUrl: "https://forms.example.test/interview",
  betaAccessUrl: "https://ilgam.example.test/today?invite=TESTONLY",
  now: NOW,
};
const CONFIRM = "c".repeat(43);
const UNSUBSCRIBE = "u".repeat(43);

function application(overrides: Partial<DraftApplication> = {}): DraftApplication {
  return {
    id: "app-1",
    email: "test01@example.invalid",
    participation: "beta",
    eligible: true,
    adChecked: true,
    createdAt: "2026-10-31T02:00:00.000Z",
    emailConfirmedAt: null,
    confirmExpiresAt: "2026-11-30T02:00:00.000Z",
    outcome: null,
    confirmToken: CONFIRM,
    unsubscribeToken: UNSUBSCRIBE,
    ...overrides,
  };
}

const ROUTES: Array<[BetaParticipation, boolean]> = [
  ["interview", true], ["interview", false], ["beta", true], ["beta", false], ["both", true], ["both", false],
];

describe("적격 판정", () => {
  it("패키지 판매 = 예 그리고 동시 2~3건·4건 이상만 적격, 0~1건이나 아니오는 미충족", () => {
    expect(isBetaEligible(true, "2-3")).toBe(true);
    expect(isBetaEligible(true, "4+")).toBe(true);
    expect(isBetaEligible(true, "1")).toBe(false);
    expect(isBetaEligible(true, "0")).toBe(false);
    expect(isBetaEligible(false, "4+")).toBe(false);
  });
});

describe("[시험표 1] 6경로(참여 희망 × 광고 O/X) 적격자 운영 연락 초안", () => {
  it.each(ROUTES)("%s · 광고 %s: 요청한 운영 연락만, 광고 X면 광고 관련 줄 없음, '둘 다'는 일정 안내 포함", (participation, ad) => {
    const drafts = buildApplicationDrafts(application({ participation, adChecked: ad }), OPTIONS);
    const purposes = drafts.map((draft) => draft.purpose);
    expect(purposes).toEqual(
      participation === "interview" ? ["interview"] : participation === "beta" ? ["beta"] : ["interview", "beta"],
    );
    for (const draft of drafts) {
      // 운영 연락은 광고가 아니다: (광고) 표기·할인·추첨 문구가 없다.
      expect(draft.subject).not.toContain("(광고)");
      expect(draft.body).not.toMatch(/할인|추첨|상품권|정식 출시/);
      expect(draft.body).toContain("본인이 신청하지 않으셨다면");
      if (ad) {
        expect(draft.body).toContain(`${OPTIONS.origin}/apply/confirm/${CONFIRM}`);
        expect(draft.body).toContain(`${OPTIONS.origin}/u/${UNSUBSCRIBE}`);
        expect(draft.body).toContain("If you do not wish to receive promotional e-mail");
      } else {
        expect(draft.body).not.toContain("/apply/confirm/");
        expect(draft.body).not.toContain("/u/");
        expect(draft.body).not.toContain("광고성 정보");
      }
      expect(findDraftProblems(draft, "test01@example.invalid")).toEqual([]);
    }
  });
});

describe("[시험표 2] 6경로 × 기준 미충족 12사례", () => {
  it.each(ROUTES)("미충족 %s · 광고 %s: '조건과 맞지 않음' 결과 1통뿐, 접속·일정 안내·확인 링크 없음", (participation, ad) => {
    const drafts = buildApplicationDrafts(application({ participation, adChecked: ad, eligible: false }), OPTIONS);
    expect(drafts).toHaveLength(1);
    const [draft] = drafts;
    expect(draft.purpose).toBe("result");
    expect(draft.body).toContain("이번 모집 조건(패키지 외주 동시 2건 이상)과 맞지 않음");
    expect(draft.body).toContain("결과 안내 후 1개월");
    expect(draft.body).not.toContain("시작 방법");
    expect(draft.body).not.toContain("일정 고르기");
    expect(draft.body).not.toContain(OPTIONS.betaAccessUrl!);
    // 미충족자에게는 광고를 보내지 않으므로 동의를 유효로 만드는 확인 링크도 넣지 않는다. 철회 링크만 둔다.
    expect(draft.body).not.toContain("/apply/confirm/");
    expect(draft.body.includes(`/u/${UNSUBSCRIBE}`)).toBe(ad);
    expect(findDraftProblems(draft, "test01@example.invalid")).toEqual([]);
  });

  it("적격이어도 미선정으로 기록하면 결과 1통(1개월 보관)만 만든다", () => {
    const drafts = buildApplicationDrafts(application({ outcome: "not_selected" }), OPTIONS);
    expect(drafts.map((draft) => draft.purpose)).toEqual(["result"]);
    expect(drafts[0].body).toContain("함께하지 못하게 되었습니다");
    expect(drafts[0].body).toContain("결과 안내 후 1개월");
  });

  it("처리결과 통지는 운영 연락과 따로, 미충족 여부와 상관없이 만들 수 있다", () => {
    const notice = buildNoticeDraft(
      { eventId: "event-1", kind: "consent", occurredAt: "2026-10-31T02:00:00.000Z", confirmedAt: null },
      { email: "test01@example.invalid", unsubscribeToken: UNSUBSCRIBE },
      OPTIONS,
    );
    expect(notice.purpose).toBe("notice");
    expect(findDraftProblems(notice, "test01@example.invalid")).toEqual([]);
  });
});

describe("[시험표 5] 처리결과 통지 초안(v1 형식)", () => {
  it.each([
    ["consent", "동의", "동의가 등록되었습니다."],
    ["refuse", "거부", "거부가 처리되어 앞으로 광고성 이메일을 보내지 않습니다."],
    ["withdraw", "철회", "철회가 처리되어 앞으로 광고성 이메일을 보내지 않습니다."],
  ] as const)("%s: 전송자·의사표시·날짜·결과가 들어 있고 광고가 섞이지 않는다", (kind, label, result) => {
    const draft = buildNoticeDraft(
      { eventId: `event-${kind}`, kind, occurredAt: "2026-10-31T16:30:00.000Z", confirmedAt: "2026-11-01T00:00:00.000Z" },
      { email: "test05@example.invalid", unsubscribeToken: UNSUBSCRIBE },
      OPTIONS,
    );
    expect(draft.subject).toBe(`[스튜디오열매] 광고성 정보 수신 ${label} 처리 결과 안내`);
    expect(draft.body).toContain("스튜디오열매에서 알려 드립니다.");
    expect(draft.body).toContain(`- 의사표시: 광고성 정보(이메일) 수신 ${label}`);
    // 한국 시간 기준 날짜(UTC 16:30 = 다음 날 01:30 KST).
    expect(draft.body).toContain("- 일자: 2026-11-01");
    expect(draft.body).toContain(result);
    expect(draft.body).toContain("37@studioyeol.com");
    expect(draft.body).not.toMatch(/할인|추첨|베타 초대|\(광고\)/);
    expect(findDraftProblems(draft, "test05@example.invalid")).toEqual([]);
  });

  it("확인 전 동의 통지는 '주소 확인 전에는 광고를 보내지 않는다'를 함께 알린다", () => {
    const draft = buildNoticeDraft(
      { eventId: "event-pending", kind: "consent", occurredAt: "2026-10-31T02:00:00.000Z", confirmedAt: null },
      { email: "test05@example.invalid", unsubscribeToken: UNSUBSCRIBE },
      OPTIONS,
    );
    expect(draft.body).toContain("메일 주소 확인 버튼을 누르시기 전까지는 광고성 메일을 보내지 않습니다.");
  });

  it("통지 마감은 의사표시일부터 14일", () => {
    const occurred = new Date("2026-11-01T00:00:00.000Z");
    expect(noticeDueAt(occurred).toISOString()).toBe("2026-11-15T00:00:00.000Z");
    expect(koreanDate(noticeDueAt(occurred))).toBe("2026-11-15");
  });
});

describe("[시험표 10] 삭제 처리 결과 초안", () => {
  it("지운 것, 남긴 것과 이유, 계정 데이터는 지우지 않음을 알린다", () => {
    const draft = buildDeletionDraft("Test10@Example.invalid", "2026-11-01T00:00:00.000Z");
    expect(draft.to).toBe("test10@example.invalid");
    expect(draft.body).toContain("- 지운 것: 신청 정보");
    expect(draft.body).toContain("해시");
    expect(draft.body).toContain("증빙을 위해 남깁니다");
    expect(draft.body).toContain("일감체크 계정과 일감 데이터는 이 요청으로 지우지 않습니다");
    expect(findDraftProblems(draft, "test10@example.invalid")).toEqual([]);
  });
});

describe("[시험표 11] 수신자 대체 ①: A·B 초안이 섞이지 않는다", () => {
  it("A 초안에는 A 주소·A 링크만, B의 주소·링크·신청일이 없다", () => {
    const a = application({ id: "app-a", email: "test-a@example.invalid", participation: "interview", confirmToken: "A".repeat(43), unsubscribeToken: "a".repeat(43) });
    const b = application({ id: "app-b", email: "test-b@example.invalid", participation: "beta", createdAt: "2026-09-01T02:00:00.000Z", confirmToken: "B".repeat(43), unsubscribeToken: "b".repeat(43) });
    const aDrafts = buildApplicationDrafts(a, OPTIONS);
    const bDrafts = buildApplicationDrafts(b, OPTIONS);
    for (const draft of aDrafts) {
      expect(draft.to).toBe("test-a@example.invalid");
      expect(draft.body).not.toContain("B".repeat(43));
      expect(draft.body).not.toContain("b".repeat(43));
      expect(draft.body).not.toContain("2026-09-01");
      expect(draft.body).not.toContain("test-b@example.invalid");
    }
    for (const draft of bDrafts) {
      expect(draft.to).toBe("test-b@example.invalid");
      expect(draft.body).not.toContain("A".repeat(43));
    }
  });

  it("받는 사람이 신청 레코드와 다르거나 본문에 다른 주소가 섞이면 보내지 않도록 오류로 남긴다", () => {
    const [draft] = buildApplicationDrafts(application({ participation: "beta" }), OPTIONS);
    expect(findDraftProblems(draft, "test-b@example.invalid")).toContain("받는 사람이 신청 레코드의 주소와 다름");
    const mixed = { ...draft, body: `${draft.body}\n참고: test-b@example.invalid` };
    expect(findDraftProblems(mixed, draft.to)).toContain("본문에 다른 주소가 들어 있음");
  });
});

describe("[시험표 12] 수신자 대체 ②: 남의 주소로 신청한 경우", () => {
  it("메일에 '본인이 신청하지 않았으면' 거부·삭제 방법이 있고, 신청 내용(하는 일·건수 등)은 드러내지 않는다", () => {
    for (const participation of ["interview", "beta", "both"] as const) {
      for (const draft of buildApplicationDrafts(application({ email: "test-c@example.invalid", participation }), OPTIONS)) {
        expect(draft.body).toContain("본인이 신청하지 않으셨다면 이 메일에 회신해 주세요");
        expect(draft.body).toContain("수신거부 링크로 바로 철회하실 수 있습니다");
        expect(draft.body).not.toMatch(/웹|디자인|크몽|자기 홈페이지|2~3건|4건 이상|패키지 판매/);
      }
    }
  });

  it("확인 기간이 지났거나 이미 확인된 주소에는 확인 링크를 넣지 않는다", () => {
    const expired = buildApplicationDrafts(application({ confirmExpiresAt: "2026-10-31T00:00:00.000Z" }), OPTIONS)[0];
    const confirmed = buildApplicationDrafts(application({ emailConfirmedAt: "2026-10-31T05:00:00.000Z" }), OPTIONS)[0];
    expect(expired.body).not.toContain("/apply/confirm/");
    expect(confirmed.body).not.toContain("/apply/confirm/");
    expect(confirmed.body).toContain(`/u/${UNSUBSCRIBE}`);
  });
});

describe("[시험표 13] 발송 화면 초안 점검(실제 발송 미검증)", () => {
  it("운영자가 넣을 링크가 비어 있으면 '입력 필요'로 막고, 채우면 치환 안 된 변수가 남지 않는다", () => {
    const blank = buildApplicationDrafts(application({ participation: "both" }), { origin: OPTIONS.origin, now: NOW });
    expect(blank.map((draft) => findDraftProblems(draft, "test01@example.invalid").length > 0)).toEqual([true, true]);
    expect(findDraftProblems(blank[0], "test01@example.invalid")).toContain("입력 필요: 인터뷰 일정 링크(구글 폼)");
    // http 링크나 엉뚱한 값은 받지 않는다.
    const insecure = buildApplicationDrafts(application(), { ...OPTIONS, betaAccessUrl: "http://insecure.example.test" })[0];
    expect(insecure.missing).toEqual(["베타 접속(초대) 링크"]);

    const filled = buildApplicationDrafts(application({ participation: "both" }), OPTIONS);
    for (const draft of filled) {
      expect(findDraftProblems(draft, "test01@example.invalid")).toEqual([]);
      expect(`${draft.subject}\n${draft.body}`).not.toMatch(/\[(?:입력 필요|확정값|미정)|\{\{|\$\{|undefined|NaN|null/);
      // 법정 정보: 본문 끝에 전송자 명칭·연락 이메일이 실제로 들어 있다.
      expect(draft.body.trim().endsWith("보내는 사람: 스튜디오열매 · 37@studioyeol.com")).toBe(true);
      expect(draft.from).toBe("37@studioyeol.com");
    }
  });

  it("베타 안내 초안은 [미정] 문단(베타 종료 뒤 계정·결제·내보내기)을 넣지 않는다", () => {
    const [draft] = buildApplicationDrafts(application(), OPTIONS);
    expect(draft.body).not.toMatch(/자동 결제|내보내기|유료 전환|끝나기 최소 1개월 전/);
    expect(draft.body).toContain("베타는 정식 결제 시작 전까지 이어집니다.");
  });
});
