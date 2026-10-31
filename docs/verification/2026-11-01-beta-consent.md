# 검증 기록 — 베타 신청·광고 수신 동의·수신거부·처리결과 통지 (2026-11-01)

- 브랜치 `claude/beta-apply-consent` (origin/main `e83bd63` 기준). 로컬 커밋만 했다. push·PR·병합·운영 DB·배포는 하지 않았다.
- 범위 기준: `D:/SaaS/01_일감체크/스테이션/과제/2-MVP/범위-신청동의수신거부-2026-11-01.md`
- 시험표 원문: `D:/SaaS/01_일감체크/스테이션/과제/1-콜드메일/시험계획.md` v2 시험표 13줄
- **메일은 앱이 보내지 않는다.** 메일이 실제로 가야 확인되는 부분은 모두 "메일 초안 생성 검증까지, 실제 발송 미검증"이다.
- 가상 주소(`*@example.invalid`)만 썼다.

## 만든 것

| 구분 | 파일 |
|---|---|
| DB | `supabase/migrations/20261101090000_beta_application_consent.sql` |
| DB 동작 시험(PGlite) | `scripts/test-beta-consent-db.mjs` (CI: `.github/workflows/release-gate.yml`) |
| 권한 회귀 | `supabase/tests/rpc_execution_surface.sql` 24→35행, `scripts/test-native-push-db.mjs` 기대 35 |
| 규칙·문구·초안 | `src/lib/beta/apply-copy.ts`, `rules.ts`, `mail-drafts.ts`, `ops-backend.ts` |
| RPC 호출 | `src/lib/supabase/beta.ts` |
| 화면 | `src/components/beta-apply-form.tsx`, `beta-confirm-view.tsx`, `beta-unsubscribe-view.tsx`, `beta-ops-applications.tsx`, `beta-public-shell.tsx` |
| Next 경로 | `src/app/apply/page.tsx`, `src/app/apply/confirm/[token]/page.tsx`, `src/app/u/[token]/page.tsx`, `src/app/ops/applications/page.tsx` |
| Sites 셸 | `src/sites/routes.tsx`, `src/lib/standalone-routes.ts`, `src/sites/entry-server.tsx`(noindex), `scripts/prepare-sites-spa-routes.mjs`, `scripts/verify-sites-output.mjs` |
| 방침 초안 | `docs/beta-apply-privacy-draft.md` (법률 검토 대상) |

## RPC와 권한

| 함수 | anon | authenticated | service_role | 비고 |
|---|---|---|---|---|
| `submit_beta_application(text,text,boolean,text,text[],text,boolean,boolean,text)` | O | O | O | 신청. 토큰을 돌려주지 않음. 주소당 3건/시간·5건/일을 먼저 보고, 통과한 것만 전체 300건/시간 |
| `confirm_beta_email(text)` | O | O | O | 주소 확인. 무효 토큰은 기록 없이 invalid, 실제 링크마다 10회/분 |
| `unsubscribe_beta_ads(text)` | O | O | O | 수신거부. 무효 토큰은 기록 없이 invalid, 실제 링크마다 10회/분 |
| `beta_ops_list_applications()` | X | O(운영자만) | O | 함수 안에서 `beta_operator_accounts` 재확인 |
| `beta_ops_list_notices()` | X | O(운영자만) | O | |
| `beta_ops_mark_notice_emailed(uuid)` | X | O(운영자만) | O | |
| `beta_ops_record_milestone(uuid,text,text)` | X | O(운영자만) | O | 결과 안내·인터뷰 끝·베타 끝 → 정리 예정일 |
| `beta_ops_delete_application(uuid)` | X | O(운영자만) | O | 삭제 요청. 신청 정보는 바로 지우고 안내용 주소만 삭제 기록에 남김 |
| `beta_ops_list_deletions()` | X | O(운영자만) | O | 삭제 요청 기록과 남은 통지 수 |
| `beta_ops_mark_deletion_emailed(uuid)` | X | O(운영자만) | O | 삭제 결과 안내 보냄 표시. 같은 주소의 통지가 남아 있으면 거부, 표시하면 주소 삭제 |
| `beta_ops_purge_expired()` | X | O(운영자만) | O | 보유기간 지난 신청 정리. 보내지 않은 통지가 남은 주소는 건너뜀 |

모두 `security definer`, `set search_path = ''`. 내부 도우미 6개(`ilgam_private.beta_*`)는 anon·authenticated 실행 불가. 표 8개(독립 리뷰 반영으로 `beta_deletion_requests` 추가)는 anon·authenticated의 select·insert·update·delete 모두 불가(Supabase 기본 ACL을 흉내 낸 PGlite에서 확인).

## 시험표 13줄 ↔ 테스트 이름

DB = `node scripts/test-beta-consent-db.mjs`, 단위 = `npx vitest run`, E2E = `e2e/beta-apply.spec.ts`(로컬 모드, desktop·mobile 두 번씩).

| # | 시험표 줄 | 테스트 이름 | 한계 |
|---|---|---|---|
| 1 | 인터뷰/베타/둘 다 × 광고 O/X (6경로) | DB `[시험표 1·2] 참여 희망 3 × 광고 2 × 적격/미충족 12사례: 판정, 통지 기록, 광고 대상` · 단위 `mail-drafts.test.ts > [시험표 1] 6경로(참여 희망 × 광고 O/X) 적격자 운영 연락 초안`(6개) | **메일 초안 생성 검증까지, 실제 발송 미검증** |
| 2 | 위 6경로 × 대상 미충족 (12사례) | DB `[시험표 1·2] …12사례…`, `[시험표 2] 적격이어도 미선정으로 결과 안내를 보내면 광고 대상에서 빠지고 1개월 뒤 정리 대상이 된다`, `[시험표 2] 미충족 신청은 결과를 '조건과 맞지 않음'으로만 기록할 수 있다` · 단위 `[시험표 2] 6경로 × 기준 미충족 12사례`(6개 + 미선정 1 + 통지 별도 1) | **메일 초안 생성 검증까지, 실제 발송 미검증** |
| 3 | 필수 동의 거부 / 선택 미입력 | DB `[시험표 3] 필수 동의를 거부하면 제출할 수 없다`, `[시험표 3] 선택 항목(주문 받는 곳)을 비우고 광고에 동의하지 않아도 신청된다`, `[시험표 3] 잘못된 입력(주소 형식·선택지·문구 판본)은 저장하지 않는다` · 단위 `beta-public-pages.test.tsx > [시험표 3] 동의 두 개는 기본값 체크 안 됨, 필수 동의를 거부하면 제출되지 않는다`, `[시험표 3] 선택 항목·광고 동의 없이도 신청되고, 완료 화면은 신청 내용을 다시 보여 주지 않는다` · E2E `[시험표 3·5] 신청 미리보기…` | 없음 |
| 4 | 신규 미동의 / 기존 동의 / 철회 후 재신청 | DB `[시험표 4] 신규 미동의 / 기존 동의 유지 / 철회 후 재신청: 체크하지 않은 재신청은 상태를 덮어쓰지 않는다` | 없음 |
| 5 | 동의·거부·철회 통지 | DB `[시험표 5] 동의·거부·철회마다 통지 기록 1건: 의사표시 시각, 화면 표시 시각, 14일 마감, 이메일 통지 표시` · 단위 `mail-drafts.test.ts > [시험표 5] 처리결과 통지 초안(v1 형식)`(5개), `beta-public-pages.test.tsx > [시험표 5] 광고 동의 의사표시는 완료 화면에 통지 형식…` · E2E `[시험표 3·5] …` | 화면 표시는 검증. **이메일 통지는 메일 초안 생성 검증까지, 실제 발송 미검증**(보낸 시각은 운영자가 표시) |
| 6 | 한글·영문 거부 링크, 로그인 안 한 상태 | DB `[시험표 6] 로그인하지 않은 상태(anon)로 수신거부가 추가 개인정보 없이 처리된다` · 단위 `[시험표 6] 로그인 없이 버튼 한 번으로 처리되고, 한글·영문 안내와 처리 결과(전송자·일자)를 보여 준다` · E2E `[시험표 6·8·9] 수신거부 링크…` | 메일 본문 속 링크를 실제 메일 앱에서 누르는 것은 미검증 |
| 7 | 거부 직후 예약·수동·재시도 발송 | DB `[시험표 7] 수신거부 직후 다음 광고 대상 목록에서 바로 빠진다` · 단위 `beta-ops-applications.test.tsx > [시험표 7][시험표 10] 미리보기에서 삭제 요청 처리 → …` | 앱에 예약·재시도 발송이 없다(Gmail 수동). 운영자 화면 "최신 목록으로 다시 불러와 복사"가 복사 직전 다시 조회한다. **실제 발송 미검증** |
| 8 | 링크 재클릭·무효·만료 | DB `[시험표 8] 같은 링크 재클릭은 같은 결과, 무효·형식 오류 링크는 오류 없이 invalid, 만료된 확인 링크는 expired` · 단위 `[시험표 8] 다시 누른 링크는…`, `[시험표 8] 무효 링크는…`, `[시험표 8] 형식이 틀린 링크는…`, `[시험표 8] 만료된 확인 링크는…` · E2E `[시험표 6·8·9] …` | 수신거부 링크는 만료가 없다(신청 삭제 뒤에도 해시로 '이미 처리됨'). 만료는 확인 링크(30일)만 |
| 9 | 전달된 링크, 보안 스캐너 | DB `[시험표 9] 링크를 여는 것만으로는 처리되지 않는다: 토큰으로 상태를 읽는 공개 함수가 없다` · 단위 `[시험표 9] 링크를 열기만 해서는 서버에 처리 요청을 보내지 않는다(보안 스캐너 대비)`, `[시험표 9][시험표 12] 열기만 해서는 확인되지 않고…` · E2E `[시험표 6·8·9]`, `[시험표 9·12]` | 실제 메일 보안 스캐너 미검증. 전달받은 사람도 버튼을 누를 수 있다(토큰 방식의 한계). Gmail 수동 발송이라 List-Unsubscribe 원클릭 헤더 불가 |
| 10 | 삭제 요청 | DB `[시험표 10] 삭제 요청: 같은 주소의 신청 정보는 지우고, 발송금지 해시와 동의·철회 증빙은 남기고, 다른 사람은 그대로` · 단위 `mail-drafts.test.ts > [시험표 10] 삭제 처리 결과 초안`, `beta-ops-applications.test.tsx > [시험표 7][시험표 10] …` | 결과 통지는 **메일 초안 생성 검증까지, 실제 발송 미검증**. 인터뷰 메모는 앱 밖이라 화면 안내만 |
| 11 | 수신자 대체 ① | DB `[시험표 11] 수신자 대체 ①: A·B가 잇달아 신청해도 링크·상태가 각자 레코드에만 묶인다` · 단위 `[시험표 11] 수신자 대체 ①: A·B 초안이 섞이지 않는다`(2개: 섞임 없음, 받는 사람·본문 주소 불일치는 오류) | Reply-To·전달 경로·Gmail 재시도는 **실제 발송 미검증** |
| 12 | 수신자 대체 ② | DB `[시험표 12] 수신자 대체 ②: 남의 주소로 광고 동의해도 확인 전에는 유효가 아니고, 신청 응답에 확인 토큰이 없다` · 단위 `[시험표 12] 수신자 대체 ②…`(2개), `[시험표 9][시험표 12] …` · E2E `[시험표 9·12] 주소 확인 링크…` | 확인 메일은 **메일 초안 생성 검증까지, 실제 발송 미검증** |
| 13 | 발송 화면 | 단위 `[시험표 13] 발송 화면 초안 점검(실제 발송 미검증)`(2개) · E2E `[시험표 13] 운영자 화면 미리보기: 초안은 링크를 채우기 전엔 복사가 막히고, 채우면 치환 안 된 값 없이 가로로 넘치지 않는다` | 운영자 화면의 초안까지만. **Gmail 작성 화면·실제 받은 메일(데스크톱·모바일)·EML은 미검증** |

그 밖에 DB `[권한] …` 2개, `[보관] 인터뷰만 6개월·베타 종료 후 6개월…`, `[호출 제한] …`이 있다.

### 시험이 실제로 잡는지(일부러 망가뜨려 확인)

- 표 권한 회수(`from public, anon, authenticated` → `from public`)를 지우면 `[권한] 표는 anon·authenticated가 직접 읽거나 쓰지 못한다`가 FAIL.
- 확인 함수의 "마지막 거부·철회 뒤 동의만 유효" 조건을 지우면 `[시험표 12] …`가 FAIL. 처음엔 이 경우를 잡는 시험이 없어 추가했다.
- 두 경우 모두 원본으로 되돌린 뒤(`cmp`로 같은 파일 확인) 19개 PASS.

## 판단한 것 (문서에 없어서 정한 것 — 사용자 확인 필요)

애매한 것은 개인정보를 덜 남기고 광고를 덜 보내는 쪽으로 정했다.

1. 광고 동의에 체크하지 않은 신청은 의사표시(거부)로 보지 않아 처리결과 통지를 기록하지 않는다. 상태 규칙("체크 안 하고 다시 신청 = 이전 상태 유지")과 맞춘 것이다. 법률 검토에서 '미체크 = 거부 통지 필요'인지 확인 필요.
2. 동의한 적 없는 주소가 수신거부 링크를 누르면 '거부'로 기록하고(통지 대상) 발송금지 해시를 남긴다.
3. 삭제 요청은 광고 동의(유효·확인 대기)가 있으면 '철회'로도 기록한다(통지 마감 14일, 화면 표시 없음). 같은 주소의 신청 정보는 요청을 처리할 때 모두 지운다. (독립 리뷰 6 반영) 그 주소로 아직 보내지 않은 처리결과 통지(삭제 전 동의 등)와 새 철회 통지, 삭제 결과 안내를 보낼 수 있도록 주소만 `beta_deletion_requests`에 남긴다. 순서: 삭제 요청 처리 → 같은 주소의 통지를 모두 보내고 '통지 보냄 표시' → 마지막으로 삭제 결과 안내를 보내고 '보냄 표시'(통지가 남아 있으면 서버가 거부) → 그때 남겨 둔 주소를 지운다. 보유기간 정리도 보내지 않은 통지가 남은 주소는 건너뛴다.
4. 확인 링크 유효기간 30일. 수신거부 링크는 만료 없음(신청 삭제 뒤에도 해시로 '이미 처리됨' 안내).
5. 호출 제한(독립 리뷰 2 반영): 처음에는 확인·수신거부에 전체 공용 120회/분을 토큰 확인 전에 소비해서, 형식만 맞는 무효 토큰 120회로 모든 정상 처리를 막을 수 있었다. 지금은 (가) 무효 토큰은 아무것도 기록하지 않고 invalid로 돌려보내고, (나) 실제로 있는 링크만 링크마다 10회/분으로 센다. 그래서 무효 토큰이 많아도 다른 사람의 정상 확인·수신거부 예산은 줄지 않는다. 신청은 같은 주소 3건/시간·5건/일을 먼저 보고 통과한 것만 전체 300건/시간 예산을 쓴다(주소별 한도에 걸린 반복 신청이 전체 예산을 쓰지 않음). 남는 위험: 호출자(IP)를 구분하지 않으므로 매번 다른 주소로 300건/시간을 채우면 그 시간 동안 다른 신청이 막힐 수 있다. 신청폼이 IP를 받지 않기로 했으므로(신청폼-항목 v3) IP 기반 제한은 넣지 않았다. 필요하면 배포 앞단(Sites·WAF)에서 제한하는 것을 사용자와 정한다. 넘으면 저장·처리하지 않고 화면에 "처리하지 못함"을 보여 준다.
6. 이메일 해시 = SHA-256('ilgamcheck-beta-ad:' + 소문자·공백 제거 주소). 비밀 키가 없어 주소 후보를 알면 대조할 수 있다(G05 질문 4와 함께 검토).
7. 철회한 사람이 다시 체크하고 주소까지 확인하면 발송금지 해시를 지운다(동의·철회 이력은 남김).
8. 미충족·미선정자에게 가는 결과 메일에는 확인 링크를 넣지 않는다(어차피 광고를 보내지 않으므로). 수신거부 링크는 넣는다.
9. 광고 X 경로 메일에는 확인·수신거부 링크와 광고 동의 문장을 넣지 않는다.
10. 미선정 결과 문구 "이번 모집에서는 함께하지 못하게 되었습니다"는 양식에 없어 새로 썼다.
11. 인터뷰 일정 링크(구글 폼)·베타 접속(초대) 링크는 운영자가 화면에서 입력한다. 비어 있거나 https가 아니면 해당 초안을 복사하지 못하게 막는다. 로그인 방법 문장은 넣지 않았다(베타참여안내형 "운영에서 시험한 뒤 확정").
12. '둘 다'는 메일 두 통(인터뷰 일정 안내 + 베타 참여 안내)으로 만든다.
13. 베타참여안내형의 [미정] 문단(베타 종료 뒤 계정·결제·내보내기, '최소 1개월 전 알림')은 넣지 않았다(D7 기본 동작). 이용 조건은 확정값 원문 9 "정식 결제 시작 전까지"만 쓴다.
14. 처리결과 통지·메일 끝의 전화·주소는 미정이라 뺐다. 전송자 명칭·이메일만 넣는다.
15. 주소 확인 전 동의도 통지를 기록하고 같은 주소로 초안을 만든다("확인 전에는 광고를 보내지 않는다" 문장 포함). 시험계획의 [미정] "확인 안 된 주소에 통지를 어떻게 보낼지"는 이 기본값으로 두었다.
16. 신청 완료 화면은 이전 동의 상태를 보여 주지 않는다(남의 주소를 넣은 사람에게 그 주소의 상태가 드러나지 않게). 체크했으면 늘 "동의 접수, 주소 확인 뒤 유효"를 보여 준다. 이미 유효한 사람이 다시 체크해도 상태는 내려가지 않는다(확인 대기 이벤트가 하나 더 쌓일 뿐).
17. 신청 RPC는 확인 토큰을 돌려주지 않는다. 확인 링크는 운영자 화면에서만 볼 수 있다.
18. 문구 판본은 서버 허용 목록(`beta-apply-v1-2026-11-01`)으로 고정했다. 문구를 바꾸면 새 migration이 필요하다.
19. (독립 리뷰 7 반영) 결과는 운영자 화면에서 먼저 골라(보낼 예정) 그 결과의 초안을 확인하고, Gmail로 실제로 보낸 뒤에 '이 결과로 보낸 것 맞아요'로 기록한다. 고르기만 해서는 아무것도 기록되지 않는다. 기록은 한 번만 된다(되돌리기 없음 — 잘못 기록하면 운영자가 DB에서 고쳐야 한다). 미충족이면 결과는 '기준 미충족'만 고를 수 있다.
20. 운영자 로그인은 기존 `/today` 로그인을 그대로 쓰고, 운영자 화면은 세션과 운영자 표만 확인한다.
21. `/apply` 자체는 공개 모집 페이지라 noindex를 붙이지 않았다. 확인·수신거부·운영자 화면만 noindex(Next 메타 + `X-Robots-Tag`). (독립 리뷰 3 반영) Sites Worker는 끝의 `/`를 떼어 낸 같은 기준(`normalizeRoutePath`)으로 판정한다. 이 과정에서 고객 링크 `/r/<token>/`(끝 슬래시)에도 noindex가 붙게 됐다(기존 `/r/<token>`과 같은 의도).
22. 신청 화면에 개인정보처리방침 링크를 넣지 않았다(방침에 아직 이 처리 내용이 없어서). 방침 게시 뒤 넣는다.
23. 운영자 화면 로컬 미리보기는 가상 예시 4건(example.invalid)을 메모리에만 둔다(E2E로 초안 화면을 확인하려고).
24. (독립 리뷰 5 반영) 광고 대상은 신청 행이 아니라 주소 단위로 한 번만 계산한다: 주소 확인까지 끝난 동의 + 발송금지 아님 + 그 주소의 가장 최근 신청이 적격 + 그 주소의 어느 신청도 미충족·미선정으로 결과 안내되지 않음. 예전 신청이 미충족·미선정이었다가 나중에 적격으로 다시 신청한 경우도 이번 모집에서는 광고 대상에서 뺀다(보수적, 사용자 확인 필요).
25. 전송자 명칭은 범위 문서·확정값의 "스튜디오열매"를 썼다. 저장소 `src/lib/business-identity.ts`는 "열매스튜디오(열매STUDIO)"라 다르다. 어느 쪽이 맞는지 사용자 확인 필요.

## 독립 리뷰 반영 (Codex 읽기 전용 리뷰, 2026-11-01)

원문: `D:/SaaS/01_일감체크/스테이션/과제/2-MVP/검토-codex-2026-11-01-신청기능.md` (7건: 높음 2·중간 4·낮음 1).
건마다 실패하는 시험을 먼저 만들어 실패(RED)를 확인한 뒤 고치고 통과(GREEN)시켰다. migration `20261101090000`은 아직 어디에도 적용되지 않아 새 migration을 쌓지 않고 같은 파일을 고쳤다.

| # | 심각도 | 원인 | 수정 | 시험 이름 |
|---|---|---|---|---|
| 1 | 높음 | 운영자 화면이 처음 한 번 `getSession()`만 보고 인증 변경을 구독하지 않았다. 로그아웃·계정 전환 뒤에도 주소·토큰·초안이 남고, 전환 전 조회의 늦은 응답이 화면을 다시 채울 수 있었다 | `onAuthStateChange` 구독. 사용자가 바뀌거나 로그아웃하면 목록·통지·삭제 기록·고른 결과·backend를 즉시 비우고 권한을 다시 확인한다. 계정이 정해질 때마다 세대 번호를 올리고, 이전 세대의 응답은 버린다. 같은 계정의 토큰 갱신은 비우지 않는다 (`src/components/beta-ops-applications.tsx`) | 단위 `[리뷰 1] 다른 탭에서 로그아웃하면 신청자 주소·링크·초안을 바로 지우고 로그인 안내로 바꾼다`, `[리뷰 1] 일반 계정으로 바뀌면 화면을 비우고 다시 확인해 '운영자 계정이 아닙니다'만 보인다`, `[리뷰 1] 계정이 바뀌기 전에 보낸 조회가 늦게 와도 화면을 다시 채우지 않는다`, `[리뷰 1] 같은 계정의 토큰 갱신은 화면을 비우지 않는다` |
| 2 | 중간 | 확인·수신거부가 토큰 존재 확인 전에 전체 공용 120회/분을 소비해, 형식만 맞는 무효 토큰으로 정상 처리를 막을 수 있었다. 신청은 주소별 한도에 걸린 요청도 전체 한도를 소비했다 | 무효 토큰은 기록 없이 invalid. 실제 링크만 링크마다 10회/분. 신청은 주소별 한도를 먼저 보고 통과한 것만 전체 한도를 쓴다. 남는 위험(다른 주소로 전체 한도 채우기)은 '판단한 것' 5번에 적었다 | DB `[리뷰 2] 주소별 한도에 걸린 신청은 전체 신청 한도를 쓰지 않는다`, `[리뷰 2] 형식만 맞는 무효 토큰을 많이 보내도 정상 주소 확인·수신거부는 막히지 않는다`, `[리뷰 2] 같은 링크를 분당 10번 넘게 누르면 그 링크만 rate_limited, 다른 링크는 그대로` |
| 3 | 중간 | Sites Worker의 검색 차단 정규식이 끝 슬래시를 허용하지 않아 `/u/<token>/`, `/apply/confirm/<token>/`에 `X-Robots-Tag`가 빠졌다 | `src/lib/standalone-routes.ts`에 `normalizeRoutePath`·`isNoindexRoutePath`를 두고 Worker(`entry-server.tsx`)와 단독 경로 판정이 같은 정규화를 쓴다 | 단위 `beta-routes.test.tsx > Worker가 /u/…/ HTML에 검색 차단 헤더…` 등 끝 슬래시 6사례 · E2E `[시험표 6·8·9] 수신거부 링크…`(Next에서 `/u/<token>/` 확인) |
| 4 | 낮음 | 주소 확인의 일시 오류(연결 문제·호출 제한)도 결과 화면으로 바뀌며 확인 버튼이 사라졌다 | 일시 오류 결과에 "다시 확인하기" 버튼을 둔다 (`beta-confirm-view.tsx`) | 단위 `[리뷰 4] 네트워크 오류 뒤에도 새로고침 없이 다시 눌러 확인할 수 있다`, `[리뷰 4] 호출 제한 뒤에도 …`(두 번째 RPC 호출까지 확인) |
| 5 | 높음 | 광고 동의는 주소 단위인데 적격·미선정 제외는 신청 행마다 계산해, 같은 주소의 새 신청을 미선정 처리해도 과거 적격 행 때문에 광고 대상에 남았다 | `beta_ops_list_applications`가 주소 단위로 한 번만 계산: 가장 최근 신청이 적격 + 같은 주소의 어느 신청도 미충족·미선정으로 안내되지 않음(미리보기 backend도 같은 규칙) | DB `[리뷰 5] 같은 주소가 다시 신청해 새 신청이 미선정이면 과거 적격 신청이 있어도 광고 대상이 아니다`, `[리뷰 5] 최근 신청이 미충족이면 과거 적격 신청이 있어도 광고 대상이 아니다` |
| 6 | 중간 | 삭제 요청 때 신청 정보를 모두 지워, 삭제 전에 생긴 미발송 통지의 받는 주소를 잃었다. 새 철회 초안은 화면 메모리에만 있어 새로고침하면 사라졌다 | 표 `beta_deletion_requests` 추가. 삭제 요청 처리 때 주소만 남기고, 통지 목록은 `recipient_email`로 그 주소를 돌려준다. `beta_ops_mark_deletion_emailed`는 같은 주소의 통지가 남아 있으면 거부하고, 표시하는 순간 주소를 지운다. 운영자 화면의 '삭제 처리 안내'는 DB에서 읽어 새로고침해도 남는다. 보유기간 정리도 보내지 않은 통지가 남은 주소는 건너뛴다 | DB `[리뷰 6] 삭제 요청 전 못 보낸 통지는 삭제 뒤에도 받는 주소가 남고, 통지를 다 보낸 뒤에야 삭제 결과 안내를 끝내며 그때 주소를 지운다`, `[리뷰 6] 보유기간이 지나도 그 주소로 보내지 않은 통지가 남아 있으면 정리하지 않고, 통지를 보낸 뒤 정리한다`, `[시험표 10] …`(받는 주소 확인 추가) · 단위 `[리뷰 6] 삭제 요청 처리 뒤에도 안 보낸 통지의 초안이 남고, 통지를 보내기 전에는 삭제 결과 안내를 끝낼 수 없다`, `mail-drafts.test.ts > [시험표 10] 삭제 처리 결과 초안` |
| 7 | 중간 | 결과 선택이 컨트롤 내부 상태에만 있고 초안은 DB `outcome`만 봐서, 미선정 초안을 보려면 먼저 '보냄'을 기록해야 했다 | 고른 결과(보낼 예정)를 화면 상태로 올려 초안과 공유한다. 실제로 보낸 뒤 '이 결과로 보낸 것 맞아요'로 기록한다 | 단위 `[리뷰 7] 결과를 고르기만 해도 그 결과의 초안이 보이고, 보냄 표시는 아직 기록되지 않는다` |

RED 확인: 리뷰 2·5·6 DB 시험 7개(기존 `[시험표 10]` 기대 보강 포함)가 고치기 전 FAIL, 리뷰 1·6·7 화면 시험 6개, 리뷰 3 Worker 시험 4개, 리뷰 4 시험 2개가 고치기 전 FAIL이었다. 보유기간 정리 건너뛰기는 조건을 일부러 빼서 FAIL → 원본 복구(`cmp` 동일) 뒤 PASS를 확인했다.

## 못 한 것·한계

- 메일 발송은 범위 밖이다. 메일이 실제로 가야 확인되는 부분(위 표의 "실제 발송 미검증")은 확인하지 않았다.
- List-Unsubscribe 헤더: Gmail 수동 발송이라 불가(범위 문서 "하지 않는 것").
- 보유기간 정리 자동 예약 없음(운영자 버튼만).
- DB 규칙은 PGlite로만 시험했다. 실제 Supabase(PostgREST·Auth·기본 ACL)에서의 통합 확인은 migration 적용 뒤 필요하다.
- 운영 DB migration·운영자 등록·Sites 배포·push·PR은 하지 않았다(사용자 승인 대상).
- 범위 문서 완료 기준의 "독립 리뷰, PR(CI 통과)"은 하지 않았다(이번 지시가 로컬 커밋까지).

## 검증 명령과 결과 (2026-11-01, Windows 로컬, 출력 원문 발췌)

```
$ npm run lint            → exit 0 (eslint . 지적 없음)
$ npm run typecheck       → exit 0 (tsc --noEmit 지적 없음)
$ npx vitest run
 Test Files  137 passed (137)
      Tests  888 passed (888)
$ node scripts/test-native-push-db.mjs
PASS: native SQL contract, deletion regression, 33 RPC privilege checks (ephemeral PGlite).
$ node scripts/test-beta-consent-db.mjs
PASS: 19 beta consent DB checks (ephemeral PGlite).
$ npm run check:release
[release-gate] PASS unit            (137 files / 888 tests)
[release-gate] PASS lint
[release-gate] PASS typecheck
[release-gate] PASS production dependency audit   (found 0 vulnerabilities)
[release-gate] PASS local production build
[e2e-release] PASS desktop/core 14 · desktop/surface 27 · mobile/core 14 · mobile/surface 27
[release-gate] PASS local production E2E
[release-gate] PASS hosted fail-closed production build
[release-gate] PASS unit/lint/typecheck/audit/local E2E/hosted build 전체 게이트 통과.
$ npm run build:sites && node scripts/verify-sites-output.mjs
✓ built in 1.28s / ✓ built in 51ms   (Vite native config·500 kB chunk 경고는 기존과 같음)
Sites output verified
```

- 기존 대비: unit 132파일/827개 → 137파일/888개, E2E 74개 → 82개(새 `e2e/beta-apply.spec.ts` 4개 × desktop·mobile), PGlite 권한 24 → 33.
- 기존 테스트를 지우거나 skip하지 않았다. 바꾼 기존 테스트: `src/sites/routes.test.tsx`(경로 목록에 새 경로 4개 추가), `scripts/verify-sites-output.test.mjs`(셸 번들에 새 경로가 있어야 통과하도록 fixture 보강 + 빠진 경우 실패 시험 추가), `supabase/tests/rpc_execution_surface.sql`·`scripts/test-native-push-db.mjs`(새 함수 9개 행 추가).
- 화면은 로컬 빌드를 390px·1280px로 띄워 신청·수신거부·운영자 화면을 직접 찍어 보고, 운영자 화면 버튼이 가로로 늘어나던 것과 "결과" 글자가 세로로 꺾이던 것을 고쳤다.

### 독립 리뷰 반영 뒤 재검증 (2026-11-01, 출력 원문 발췌)

```
$ npm run lint            → LINT_EXIT=0
$ npm run typecheck       → TYPECHECK_EXIT=0
$ npx vitest run
 Test Files  137 passed (137)
      Tests  902 passed (902)
$ node scripts/test-native-push-db.mjs
PASS: native SQL contract, deletion regression, 35 RPC privilege checks (ephemeral PGlite).
$ node scripts/test-beta-consent-db.mjs
PASS: 26 beta consent DB checks (ephemeral PGlite).
$ npm run check:release
[release-gate] PASS unit            (137 files / 902 tests)
[release-gate] PASS lint
[release-gate] PASS typecheck
[release-gate] PASS production dependency audit   (found 0 vulnerabilities)
[release-gate] PASS local production build
[e2e-release] PASS desktop/core 14 · desktop/surface 27 · mobile/core 14 · mobile/surface 27
[release-gate] PASS local production E2E
[release-gate] PASS hosted fail-closed production build
[release-gate] PASS unit/lint/typecheck/audit/local E2E/hosted build 전체 게이트 통과.
CHECK_RELEASE_EXIT=0
$ npm run build:sites && node scripts/verify-sites-output.mjs
BUILD_SITES_EXIT=0 (✓ built in 861ms / ✓ built in 42ms)
Sites output verified
VERIFY_SITES_EXIT=0
```

- 로컬 빌드 운영자 화면을 1280px·390px로 띄워 삭제 요청 처리 → '삭제 처리 안내' 칸, 미선정을 고르기만 했을 때의 결과 초안을 확인했다. 가로 넘침 0px(두 폭 모두).
