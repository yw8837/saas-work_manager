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
| `beta_ops_purge_expired()` | X | O(운영자만) | O | 보유기간 지난 신청 정리. 보내지 않은 통지가 남은 주소는 후보에서 먼저 빼고(보류), 정리 가능한 주소만 해시순 100개씩. (deleted_count, remaining_count, held_count) 반환 |
| `beta_ops_prune_call_counters()` | X | O(운영자만) | O | 2일 지난 호출 제한 기록 정리. 신청 정리와 따로(이메일 잠금 없음), 한 번에 5,000행, (deleted_rows, remaining_rows) 반환. 남은 수는 5,001개까지만 센다(5,001 = 5,000 넘음) |

모두 `security definer`, `set search_path = ''`. 내부 도우미 9개(`ilgam_private.beta_email_hash`, `beta_token_hash`, `beta_new_token`, `beta_take_call`, `beta_peek_calls`, `beta_lock_email`, `beta_current_cohort`, `beta_ad_status`, `beta_require_operator`)는 anon·authenticated 실행 불가(DB 시험 `[권한] 운영자 RPC는 …`에서 9개 모두 확인). 표 9개(독립 리뷰 반영으로 `beta_deletion_requests`, 재검토 반영으로 `beta_ad_exclusions` 추가)는 anon·authenticated의 select·insert·update·delete 모두 불가(Supabase 기본 ACL을 흉내 낸 PGlite에서 확인).

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
24. (독립 리뷰 5 반영) 광고 대상은 신청 행이 아니라 주소 단위로 한 번만 계산한다: 주소 확인까지 끝난 동의 + 발송금지 아님 + 그 주소의 가장 최근 신청이 적격 + 그 주소의 어느 신청도 미충족·미선정으로 결과 안내되지 않음. 예전 신청이 미충족·미선정이었다가 나중에 적격으로 다시 신청한 경우도 이번 모집에서는 광고 대상에서 뺀다(보수적, 사용자 확인 필요). (재검토 1 보완) 처음 수정은 남아 있는 신청 행에서만 제외 근거를 찾아서, 미충족·미선정 신청을 보유기간에 따라 정리하면 제외가 풀렸다. 지금은 결과를 미충족·미선정으로 기록할 때 모집(`beta-2026-1`)·이메일 해시 단위의 제외 근거를 `beta_ad_exclusions`에 신청 정보와 따로 남기고(주소 원문 없음), 광고 대상 계산이 이것을 본다. 이 근거의 보관 기한은 D1·G05 결정 전이라 정하지 않았다(사용자 결정 필요).
25. 전송자 명칭은 범위 문서·확정값의 "스튜디오열매"를 썼다. 저장소 `src/lib/business-identity.ts`는 "열매스튜디오(열매STUDIO)"라 다르다. 어느 쪽이 맞는지 사용자 확인 필요.
26. 확인·수신거부 토큰은 해시로만 비교하지만, 운영자가 메일에 붙일 링크를 만들려고 **원문도 `beta_application_links`에 저장**한다. 이 표는 RLS를 켜고 anon·authenticated 권한을 모두 뺐고, 운영자 RPC로만 읽히며, 신청 정보가 지워질 때 함께 지워진다(on delete cascade). 그래도 보관 기간 동안 DB를 읽을 수 있는 사람은 링크를 만들 수 있다(남의 주소 확인 처리·수신거부). 스테이션 Codex 설계 검토(`과제/2-MVP/검토-codex-2026-11-01.md` 1번)가 "평문 원본 장기 보관을 피하고, 한 번만 만들거나 별도 암호화"를 권했다. 대안: (가) 지금대로 (나) 주소 확인이 끝나거나 30일 만료되면 확인 토큰 원문만 지움 (다) 서버 비밀 키로 토큰을 파생(HMAC)하고 키는 Supabase Vault에 둠. 같은 검토 2번은 판단 6의 이메일 해시도 HMAC(서버 비밀 키)로 바꾸라고 권했다. 둘 다 사용자 결정 필요(이번 구현은 (가)와 비밀 키 없는 SHA-256).

## 독립 리뷰 반영 (Codex 읽기 전용 리뷰, 2026-11-01)

원문: `D:/SaaS/01_일감체크/스테이션/과제/2-MVP/검토-codex-2026-11-01-신청기능.md` (7건: 높음 2·중간 4·낮음 1).
작업자(Claude) 보고: 건마다 실패하는 시험을 먼저 만들어 실패(RED)를 확인한 뒤 고치고 통과(GREEN)시켰다. 이 작업 순서는 작업자의 실행 기록이며, 독립 재검토에서 따로 입증되지는 않았다(재검토는 현재 코드의 통과 여부만 확인). migration `20261101090000`은 아직 어디에도 적용되지 않아 새 migration을 쌓지 않고 같은 파일을 고쳤다.

| # | 심각도 | 원인 | 수정 | 시험 이름 |
|---|---|---|---|---|
| 1 | 높음 | 운영자 화면이 처음 한 번 `getSession()`만 보고 인증 변경을 구독하지 않았다. 로그아웃·계정 전환 뒤에도 주소·토큰·초안이 남고, 전환 전 조회의 늦은 응답이 화면을 다시 채울 수 있었다 | `onAuthStateChange` 구독. 사용자가 바뀌거나 로그아웃하면 목록·통지·삭제 기록·고른 결과·backend를 즉시 비우고 권한을 다시 확인한다. 계정이 정해질 때마다 세대 번호를 올리고, 이전 세대의 응답은 버린다. 같은 계정의 토큰 갱신은 비우지 않는다 (`src/components/beta-ops-applications.tsx`) | 단위 `[리뷰 1] 다른 탭에서 로그아웃하면 신청자 주소·링크·초안을 바로 지우고 로그인 안내로 바꾼다`, `[리뷰 1] 일반 계정으로 바뀌면 화면을 비우고 다시 확인해 '운영자 계정이 아닙니다'만 보인다`, `[리뷰 1] 계정이 바뀌기 전에 보낸 조회가 늦게 와도 화면을 다시 채우지 않는다`, `[리뷰 1] 같은 계정의 토큰 갱신은 화면을 비우지 않는다` |
| 2 | 중간 | 확인·수신거부가 토큰 존재 확인 전에 전체 공용 120회/분을 소비해, 형식만 맞는 무효 토큰으로 정상 처리를 막을 수 있었다. 신청은 주소별 한도에 걸린 요청도 전체 한도를 소비했다 | 무효 토큰은 기록 없이 invalid. 실제 링크만 링크마다 10회/분. 신청은 주소별 한도를 먼저 보고 통과한 것만 전체 한도를 쓴다. 남는 위험(다른 주소로 전체 한도 채우기)은 '판단한 것' 5번에 적었다. (재검토 2 보완) 이 수정은 새 회귀를 만들었다: 전체 한도가 찬 뒤에도 거절되는 새 주소마다 주소별 카운터 2행을 먼저 만들었다. 지금은 같은 주소 요청을 잠금으로 줄 세운 뒤 주소별 사용량을 읽기만 하고, 전체 예산을 확보한 다음, 둘 다 통과할 때만 주소별 카운터를 센다(한 트랜잭션) | DB `[리뷰 2] 주소별 한도에 걸린 신청은 전체 신청 한도를 쓰지 않는다`, `[리뷰 2] 형식만 맞는 무효 토큰을 많이 보내도 정상 주소 확인·수신거부는 막히지 않는다`, `[리뷰 2] 같은 링크를 분당 10번 넘게 누르면 그 링크만 rate_limited, 다른 링크는 그대로` |
| 3 | 중간 | Sites Worker의 검색 차단 정규식이 끝 슬래시를 허용하지 않아 `/u/<token>/`, `/apply/confirm/<token>/`에 `X-Robots-Tag`가 빠졌다 | `src/lib/standalone-routes.ts`에 `normalizeRoutePath`·`isNoindexRoutePath`를 두고 Worker(`entry-server.tsx`)와 단독 경로 판정이 같은 정규화를 쓴다 | 단위 `beta-routes.test.tsx > Worker가 /u/…/ HTML에 검색 차단 헤더…` 등 끝 슬래시 6사례 · E2E `[시험표 6·8·9] 수신거부 링크…`(Next에서 `/u/<token>/` 확인) |
| 4 | 낮음 | 주소 확인의 일시 오류(연결 문제·호출 제한)도 결과 화면으로 바뀌며 확인 버튼이 사라졌다 | 일시 오류 결과에 "다시 확인하기" 버튼을 둔다 (`beta-confirm-view.tsx`) | 단위 `[리뷰 4] 네트워크 오류 뒤에도 새로고침 없이 다시 눌러 확인할 수 있다`, `[리뷰 4] 호출 제한 뒤에도 …`(두 번째 RPC 호출까지 확인) |
| 5 | 높음 | 광고 동의는 주소 단위인데 적격·미선정 제외는 신청 행마다 계산해, 같은 주소의 새 신청을 미선정 처리해도 과거 적격 행 때문에 광고 대상에 남았다 | `beta_ops_list_applications`가 주소 단위로 한 번만 계산: 가장 최근 신청이 적격 + 같은 주소의 어느 신청도 미충족·미선정으로 안내되지 않음(미리보기 backend도 같은 규칙). (재검토 1 보완) 이 수정만으로는 미충족·미선정 신청을 보유기간 정리하면 제외 근거가 사라졌다. 지금은 `beta_ad_exclusions`(모집·이메일 해시)를 함께 본다 | DB `[리뷰 5] 같은 주소가 다시 신청해 새 신청이 미선정이면 과거 적격 신청이 있어도 광고 대상이 아니다`, `[리뷰 5] 최근 신청이 미충족이면 과거 적격 신청이 있어도 광고 대상이 아니다` |
| 6 | 중간 | 삭제 요청 때 신청 정보를 모두 지워, 삭제 전에 생긴 미발송 통지의 받는 주소를 잃었다. 새 철회 초안은 화면 메모리에만 있어 새로고침하면 사라졌다 | 표 `beta_deletion_requests` 추가. 삭제 요청 처리 때 주소만 남기고, 통지 목록은 `recipient_email`로 그 주소를 돌려준다. `beta_ops_mark_deletion_emailed`는 같은 주소의 통지가 남아 있으면 거부하고, 표시하는 순간 주소를 지운다. 운영자 화면의 '삭제 처리 안내'는 DB에서 읽어 새로고침해도 남는다. 보유기간 정리도 보내지 않은 통지가 남은 주소는 건너뛴다. 한계(재검토 3): 이 수정은 직접 삭제 요청 경로만 다룬다. 보유기간 정리가 끝난 뒤 옛 수신거부 링크로 생긴 새 의사표시는 이메일로 보낼 주소가 없다. 주소를 새로 남기지 않고 화면 통지만 했다고 정확히 기록하도록 바꿨다(아래 '재검토 반영' 3번) | DB `[리뷰 6] 삭제 요청 전 못 보낸 통지는 삭제 뒤에도 받는 주소가 남고, 통지를 다 보낸 뒤에야 삭제 결과 안내를 끝내며 그때 주소를 지운다`, `[리뷰 6] 보유기간이 지나도 그 주소로 보내지 않은 통지가 남아 있으면 정리하지 않고, 통지를 보낸 뒤 정리한다`, `[시험표 10] …`(받는 주소 확인 추가) · 단위 `[리뷰 6] 삭제 요청 처리 뒤에도 안 보낸 통지의 초안이 남고, 통지를 보내기 전에는 삭제 결과 안내를 끝낼 수 없다`, `mail-drafts.test.ts > [시험표 10] 삭제 처리 결과 초안` |
| 7 | 중간 | 결과 선택이 컨트롤 내부 상태에만 있고 초안은 DB `outcome`만 봐서, 미선정 초안을 보려면 먼저 '보냄'을 기록해야 했다 | 고른 결과(보낼 예정)를 화면 상태로 올려 초안과 공유한다. 실제로 보낸 뒤 '이 결과로 보낸 것 맞아요'로 기록한다 | 단위 `[리뷰 7] 결과를 고르기만 해도 그 결과의 초안이 보이고, 보냄 표시는 아직 기록되지 않는다` |

RED 확인(작업자 보고, 독립 입증 아님): 리뷰 2·5·6 DB 시험 7개(기존 `[시험표 10]` 기대 보강 포함)가 고치기 전 FAIL, 리뷰 1·6·7 화면 시험 6개, 리뷰 3 Worker 시험 4개, 리뷰 4 시험 2개가 고치기 전 FAIL이었다. 보유기간 정리 건너뛰기는 조건을 일부러 빼서 FAIL → 원본 복구(`cmp` 동일) 뒤 PASS를 확인했다.

## 재검토 반영 (Codex 재검토, 2026-11-01, 판정 "수정 필요")

원문: `D:/SaaS/01_일감체크/스테이션/과제/2-MVP/검토-codex-2026-11-01-신청기능-재검토.md`. 재검토 판정: 기존 7건 중 해결 5건·부분 해결 2건(5·6번), 새 문제 3건.
작업자(Claude) 보고: 각 건을 재검토에 적힌 재현 순서대로 시험으로 먼저 만들어 실패를 확인한 뒤 고쳤다(이 순서는 작업자 실행 기록이다).

| # | 심각도 | 원인 | 수정 | 시험 이름 |
|---|---|---|---|---|
| 1 | 높음 | 주소 단위 광고 제외 근거를 남아 있는 신청 행에서만 찾았다. 미충족·미선정 신청을 보유기간 정리하면 같은 주소가 다시 광고 대상이 됐다 | 표 `beta_ad_exclusions(cohort, email_hash, reason)` 추가(해시만). 결과를 미충족·미선정으로 기록할 때 현재 모집(`ilgam_private.beta_current_cohort()` = `beta-2026-1`) 근거를 남기고, 광고 대상 계산이 이것을 본다. 신청 정리와 따로 남는다 | DB `[재검토 1] 같은 주소의 새 신청을 미선정 안내한 뒤 그 신청을 보유기간 정리해도, 남은 과거 적격 신청은 광고 대상이 되지 않는다`, `[재검토 1] 미선정 신청을 모두 정리한 뒤 같은 주소가 다시 적격으로 신청해도(광고 체크 없음·있음) 이번 모집 광고 대상이 아니다` |
| 2 | 중간(회귀) | 주소별 한도를 전체 한도보다 먼저 `take`(쓰기)해서, 전체 한도가 찬 뒤에도 거절되는 새 주소마다 카운터 2행이 생겼다 | 같은 주소 요청을 advisory 잠금으로 줄 세움 → 주소별 사용량을 `beta_peek_calls`로 읽기만 → 전체 예산 확보 → 둘 다 통과할 때만 주소별 카운터 기록(한 트랜잭션). 거절 요청은 주소별 행을 만들지 않고, 전체 행은 시간 창마다 1개뿐 | DB `[재검토 2] 전체 신청 한도가 찬 뒤 새 주소로 거절되는 요청은 카운터 행을 새로 만들지 않는다`, `[재검토 2] 주소별 한도에 걸린 요청은 여전히 전체 예산을 쓰지 않고, 통과한 요청만 주소별·전체 카운터를 함께 센다`, 기존 `[리뷰 2] 주소별 한도에 걸린 신청은 전체 신청 한도를 쓰지 않는다` |
| 3 | 중간 | 보유기간 정리 뒤 옛 수신거부 링크로 철회하면 새 통지의 받는 주소가 없었고, 운영자 화면은 "통지를 마치고 … 주소를 지웠어요"라고 잘못 표시했다 | 수신거부 처리는 그대로 한다. 의사표시 때 주소(신청 정보·삭제 안내용 주소)가 없으면 통지 기록에 `notice_email_unavailable = true`(화면 통지함·이메일 주소 없음)를 남기고 주소를 새로 남기지 않는다. RPC가 `email_notice`를 돌려주고, 수신거부 결과 화면은 통지 v1 항목(전송자·의사표시·일자·처리 결과·변경 방법)과 함께 "메일로 따로 알려 드리지 않고 이 화면이 처리 결과 안내"라고 알린다. 운영자 화면은 "주소가 정리되어 이메일 통지 불가 — 화면 통지만 함"으로 구분하고 '남은 통지'·통지 보냄 버튼에서 뺀다. 이런 건은 정리·삭제 완료를 막는 '보낼 통지'로 세지 않는다 | DB `[재검토 3] 보유기간 정리 뒤 옛 수신거부 링크로 철회하면 처리는 되고, 통지 기록은 '화면 통지함·이메일 주소 없음(정리됨)'으로 정확히 남는다`, `[시험표 6] …`(응답에 `email_notice` 추가) · 단위 `[재검토 3] 화면의 처리 결과 안내는 통지 v1 항목…`, `[재검토 3] 주소가 이미 정리돼 메일을 보낼 수 없으면…`, `[재검토 3] 주소가 정리된 뒤 생긴 통지는 '주소가 정리되어 이메일 통지 불가 — 화면 통지만 함'으로 구분하고…` |

### 재검토로 새로 정한 것 (사용자 확인·법률 검토 필요)

26. 광고 제외 근거(`beta_ad_exclusions`)는 모집 단위(`beta-2026-1`)로 남기고, 보관 기한은 정하지 않았다(D1·G05 결정 전). 모집을 새로 열면 새 migration에서 `beta_current_cohort()` 값을 바꾼다.
27. **법률 검토 질문:** 신청 정보를 보유기간에 따라 지운 뒤 같은 주소가 옛 수신거부 링크로 철회·거부하면, 앱은 처리하고 화면으로만 처리 결과를 알린다(이메일 주소가 남아 있지 않음). 이 경우 정보통신망법 제50조 ⑦의 처리결과 통지를 화면 통지로 갈음할 수 있는가? 아니면 통지를 위해 최소한의 주소를 (얼마 동안) 남겨야 하는가? 정책이 정해지기 전에는 주소를 새로 남기지 않는다.
28. 재검토가 함께 짚은 보관 한계(새 버그로 세지는 않음): 삭제 요청 기록의 미완료 주소에는 보관 상한·실패 종료 절차가 없고, 보내지 않은 통지가 있으면 신청 정보 전체의 정리가 미뤄진다. 최소 정보 보관 방식과 미완료 건의 종료 기준은 사용자 결정이 필요하다.

## 3차 재검토 반영 (Codex, 2026-11-01, 판정 "수정 필요")

원문: `D:/SaaS/01_일감체크/스테이션/과제/2-MVP/검토-codex-2026-11-01-신청기능-재검토2.md`. 판정: 2차 지적 ①·② 해결, ③ 부분 해결(주소 없는 철회의 이메일 통지는 정책·법률 결정 대기라 **이번에 손대지 않음**), 새 지적 2건·문서 2건.
작업자(Claude) 보고: 재검토 재현 순서대로 시험을 먼저 만들어 실패를 확인한 뒤 고쳤다(작업자 실행 기록, 독립 입증 아님).

| # | 심각도 | 원인 | 수정 | 시험 이름 |
|---|---|---|---|---|
| 1 | 중간(신규) | 다시 누른 수신거부 링크(`already`)에 "과거 의사표시 때 주소가 있었다"는 값을 돌려줘, 통지가 이미 끝난 건에도 화면이 "같은 내용을 14일 안에 이메일로도 알려 드려요"라고 새 발송을 약속했다 | RPC가 참/거짓 대신 `notice_state`를 돌려준다. 새 의사표시: `email_pending`(메일로 보낼 예정)·`screen_only`(주소 없음). 다시 누른 링크: 기존 통지 상태 그대로 `emailed`(이미 보냄)·`email_pending`(아직 안 보냄)·`screen_only`. 화면은 `already`일 때 새 발송을 약속하지 않고 "이미 보내 드렸어요/이번에 새로 바뀐 것은 없어요/주소가 남아 있지 않아요"만 말한다. 새 통지는 만들지 않는다 | DB `[재검토2 1] 통지까지 끝난 옛 수신거부 링크를 정리 뒤 다시 누르면 already·통지 완료(emailed)로 답하고 새 통지를 만들지 않는다` · 단위 `[재검토2 1] 다시 누른 링크(emailed/email_pending/screen_only)는 기존 통지 상태에 맞게만 안내하고, 새 메일 발송을 약속하지 않는다`(3개) |
| 2 | 중간(기존 경계) | 수신거부(주소 확인·통지 생성)와 보유기간 정리·삭제 안내 완료(마지막 주소 삭제)가 같은 잠금을 쓰지 않아, 겹치면 주소가 없는데 '메일로 보낼 예정'으로 기록될 수 있었다 | 이메일 해시마다 잠금 키 하나(`ilgam_private.beta_lock_email`, `hashtext('beta-email:' || 해시)`)를 두고 신청·주소 확인·수신거부·삭제 요청·삭제 안내 완료·보유기간 정리가 모두 이것을 쓴다. 잠금은 행 잠금·행 삭제보다 먼저 잡는다(주소 확인도 행 잠금 앞으로 옮김). 정리는 주소를 해시 오름차순으로 하나씩 잠그고, 잠근 뒤 같은 조건(미발송 통지 없음)으로 다시 확인하며 지운다. 삭제 안내 완료와 삭제 요청도 잠근 뒤 조건을 다시 읽는다 | DB `[재검토2 2] 신청·확인·수신거부·삭제 요청·삭제 안내 완료·보유기간 정리가 같은 이메일에 같은 잠금 키를 쓴다`, `[재검토2 2] 보유기간 정리는 잠금을 이메일 해시 순서로 잡는다(…)` |
| 3 | 낮음 | 검증 기록이 새 화면 분기를 E2E로도 확인한 것처럼 적었다 | "새 분기는 단위 시험으로만, E2E는 기존 흐름 회귀 통과"로 고쳤다 | 문서 |
| 4 | 낮음 | 검증 기록의 내부 도우미 수가 6개였다(실제 9개) | 9개 이름을 적고, DB 시험이 9개 모두 anon·authenticated 실행 불가인지 확인하게 했다 | DB `[권한] 운영자 RPC는 anon이 실행할 수 없고, …`(9개 확인 추가) |

**2번의 한계:** PGlite는 세션 하나라 실제로 두 세션이 겹치는 경합은 재현하지 못했다. 시험은 (가) 각 경로가 트랜잭션 안에서 쥐는 advisory 잠금 키가 같은지(`pg_locks`), (나) 정리 함수가 해시 순서로 잠그는지, (다) 잠금 뒤 조건 재확인 동작(미발송 통지가 있으면 정리·삭제 안내 완료 거부)을 확인한다. 실제 Supabase에서의 다중 세션 부하·교착 시험은 하지 않았다. 잠금 순서 규칙: 한 경로가 여러 주소를 잠그는 곳은 정리뿐이고 해시 오름차순이며, 나머지는 한 주소만 잠그므로 잠금끼리 서로 기다리는 고리는 생기지 않는다고 판단했다(정적 분석). **(4차 재검토에서 정정: 이 판단은 카운터 표의 DELETE·UPSERT를 빠뜨려 틀렸다. 아래 '4차 재검토 반영' 참고.)**

그대로 둔 것: ③ 주소 없는 철회·거부의 이메일 통지(판단 27번 법률 검토 질문), `beta_ad_exclusions` 보관 기한, 미완료 삭제 기록의 주소 보관 상한·실패 종료 절차, 미발송 통지 때문에 신청 정리를 미루는 정책(판단 26·28번). 모두 사용자·법률 결정 대기다.

## 4차 재검토 반영 (Codex, 2026-11-01, 판정 "수정 필요")

원문: `D:/SaaS/01_일감체크/스테이션/과제/2-MVP/검토-codex-2026-11-01-신청기능-재검토3.md`. 판정: 3차 4건 모두 해결, 공유 잠금 도입으로 생긴 새 교착 경로 1건(중간·회귀), 메모 2건.
작업자(Claude) 보고: 시험을 먼저 만들어 실패를 확인한 뒤 고쳤다(작업자 실행 기록, 독립 입증 아님).

| # | 심각도 | 원인 | 수정 | 시험 이름 |
|---|---|---|---|---|
| 1 | 중간(회귀) | 신청은 "이메일 잠금 → 카운터", 주소 확인·수신거부는 "카운터 → 이메일 잠금" 순서였다. `beta_take_call`이 매번 2일 지난 카운터 행을 DELETE해서 카운터 이름이 달라도 같은 행을 두고 다툴 수 있어, 같은 이메일의 신청과 확인·수신거부가 겹치면 교착(40P01)이 날 수 있었다(3차에서 이메일 잠금 키를 하나로 통일하면서 생긴 회귀) | (가) 주소 확인·수신거부도 유효 토큰으로 이메일을 알아낸 뒤 이메일 잠금을 카운터보다 먼저 잡는다. 모든 경로가 "이메일 잠금 → 카운터 → 행 잠금·삭제" 순서다. (나) 오래된 카운터 정리를 `beta_take_call`(공개 RPC 경로)에서 빼서 운영자 정리 `beta_ops_purge_expired`의 마지막 단계로 옮겼다(2일 지난 시간 창만 지우므로 공개 요청이 쓰는 현재 행과 겹치지 않음). 무효 토큰은 여전히 이메일 잠금·카운터 전에 끝난다. 잠금 순서 규칙을 migration 머리 주석에 적었다 | DB `[재검토3 1] 신청·주소 확인·수신거부는 모두 이메일 잠금을 카운터(beta_take_call)보다 먼저 잡는다`(함수 본문의 호출 순서 검사), `[재검토3 1] 공개 RPC는 오래된 카운터를 지우지 않고(경합 제거), 운영자 정리가 지운다. 무효 토큰은 여전히 카운터를 쓰지 않는다`, 기존 `[리뷰 2] 형식만 맞는 무효 토큰을 많이 보내도 …`(회귀 없음) |
| 2 | 메모(성능) | 보유기간 정리가 후보 이메일 잠금을 함수 끝까지 쥐어, 후보가 많으면 공개 요청 대기가 길어질 수 있었다 | 한 번에 주소 100개까지만 처리하고(해시 오름차순), 남은 정리 대상 주소 수를 함께 돌려준다(`deleted_count`, `remaining_count`). 운영자 화면은 "남은 정리 대상 N명이 있어요 … 다시 눌러 주세요"를 보여 준다 | DB `[재검토3 2] 보유기간 정리는 한 번에 주소 100개까지만 처리하고 남은 수를 알려 준다`(101개 → 100 + 1) · 단위 `[재검토3 2] 보유기간 정리가 한 번에 다 못 지우면 남은 정리 대상이 있다고 알린다` |
| 3 | 문서 | 3차 반영 절의 "교착 없음" 판단이 카운터 DELETE·UPSERT를 빠뜨렸다 | 아래 정정과 '사용자 결정 필요' 절 추가, 방침 초안에 법률 검토 대상 반영 | 문서 |

**3차 판단 정정:** 3차 반영 절(바로 위 '3차 재검토 반영'의 "2번의 한계")은 "한 주소만 잠그므로 잠금끼리 서로 기다리는 고리는 생기지 않는다"고 적었지만, 이는 이메일 잠금만 본 판단이었고 **틀렸다**. 카운터 표의 DELETE·UPSERT 행 잠금까지 넣으면 신청(이메일 → 카운터)과 확인·수신거부(카운터 → 이메일) 사이에 고리가 생길 수 있었다. 이번 수정으로 순서를 하나로 맞췄다.

**남은 한계:** PGlite는 세션이 하나라 실제 두 세션의 교착을 재현하지 못했다. 이번 시험은 함수 본문의 호출 순서(이메일 잠금이 카운터보다 앞), 공개 RPC가 오래된 카운터 행을 지우지 않는 동작, 무효 토큰이 카운터를 쓰지 않는 동작, 정리 배치 한도를 확인한다. 교착이 없다는 결론은 여전히 코드 순서를 읽은 정적 판단이며, 실제 PostgreSQL 두 세션 회귀 시험(재검토가 권한 것)은 하지 않았다. 운영 적용 전 실제 Supabase(또는 로컬 Postgres)에서 두 세션 시험을 하는 것을 권한다.

## 5차 재검토 반영 (Codex, 2026-11-01, 판정 "수정 필요")

원문: `D:/SaaS/01_일감체크/스테이션/과제/2-MVP/검토-codex-2026-11-01-신청기능-재검토4.md`. 판정: 4차 교착은 해결, 정리 배치에서 생긴 새 결함 2건(중간·회귀), 메모 1건.
작업자(Claude) 보고: 시험을 먼저 만들어 실패를 확인한 뒤 고쳤다(작업자 실행 기록, 독립 입증 아님).

| # | 심각도 | 원인 | 수정 | 시험 이름 |
|---|---|---|---|---|
| 1 | 중간(회귀) | 정리 후보를 해시순 100개 먼저 고르고 DELETE에서만 미발송 통지를 검사해, 앞 100주소가 보류면 101번째 정리 가능한 주소에 영원히 닿지 못했다(재검토 재현: 3회 연속 deleted 0, remaining 101) | 미발송 통지가 있는 주소를 후보에서 먼저 뺀 뒤 `ORDER BY email_hash LIMIT 100`. 잠근 뒤 DELETE에서 같은 조건을 다시 검사하는 보호는 유지. `remaining_count`(정리 가능한데 다음 실행 몫)와 `held_count`(통지 때문에 보류)를 나눠 돌려주고 화면 문구도 나눈다 | DB `[재검토4 1] 해시순 앞 100주소가 미발송 통지로 보류돼도, 그 뒤의 정리 가능한 주소는 정리된다(보류·남은 수 구분)`(재검토의 101주소 사례 그대로, 3회 실행) · 단위 `[재검토3 2][재검토4 1] 정리 결과에서 '정리 가능한 남은 대상'과 '통지 때문에 보류된 주소'를 나눠 알린다` |
| 2 | 중간(회귀) | 오래된 카운터 정리가 신청 정리 함수 안에만 있는데, 그 버튼이 만료 신청 0건이면 비활성이라 화면에서 카운터를 정리할 길이 없었다 | 버튼을 항상 누를 수 있게 하고 이름을 "정리 실행 (만료 신청 N건 · 2일 지난 호출 기록)", 확인 문구를 "신청과 오래된 호출 기록 정리하기"로 바꿨다. 누르면 신청 정리 → 카운터 정리를 차례로(별도 RPC·별도 트랜잭션) 부른다 | 단위 `[재검토4 2] 만료 신청이 0건이어도 정리 버튼을 누를 수 있고, 오래된 호출 기록 정리 RPC까지 부른다` |
| 3 | 메모 | 카운터 DELETE에 건수 제한·`window_start` 인덱스가 없고, 신청 정리와 같은 트랜잭션이라 이메일 잠금을 쥔 채 오래 지울 수 있었다 | 카운터 정리를 새 운영자 함수 `beta_ops_prune_call_counters()`로 분리(이메일 잠금 없음, 신청 정리 뒤 별도 호출). 한 번에 5,000행까지 지우고 남은 행 수를 돌려준다. `beta_public_call_counters(window_start)` 인덱스 추가. 신청 정리 함수는 카운터를 건드리지 않는다 | DB `[재검토4 3] 오래된 카운터 정리는 신청 정리와 따로(이메일 잠금 없이) 한 번에 5,000행까지 지우고 남은 수를 알려 준다`(5,001행 → 5,000 + 1, 현재 시간 창 보존, 잠금 키 없음, 인덱스·권한 확인), 기존 `[재검토3 1] …운영자 카운터 정리가 지운다…` |

바뀐 기존 시험(설계 변경에 맞춤, 삭제·skip 없음): `[재검토2 2]`는 보류 주소를 이제 잠그지 않으므로 정리 잠금 키를 보기 전에 통지 보냄 표시를 한다. `[재검토3 1]`은 카운터 정리를 새 함수로 부른다. `[재검토3 2]`·`[재검토4 1]`은 앞 시험이 남긴 만료 신청이 숫자에 섞이지 않게 시작 때 정리 예정일을 비운다. 운영자 RPC 계약 시험은 운영자 확인 9개·새 권한 회수 목록에 맞췄다. 권한 회귀는 35 → 36행.
101주소 시험이 옛 동작을 잡는지: 후보 필터를 일부러 빼면 `[재검토4 1]`만 FAIL, 원본 복구(`cmp` 동일) 뒤 39개 PASS(작업자 보고).

## 6차 재검토 반영 (Codex, 2026-11-01, 판정 "수정 필요")

원문: `D:/SaaS/01_일감체크/스테이션/과제/2-MVP/검토-codex-2026-11-01-신청기능-재검토5.md`. 판정: 5차 3건 모두 해결, 화면 결함 1건(중간), 메모 1건.
작업자(Claude) 보고: 시험을 먼저 만들어 실패를 확인한 뒤 고쳤다(작업자 실행 기록, 독립 입증 아님). '둘 다 성공' 시험은 고치기 전에도 통과하는 보호 시험이다.

| # | 심각도 | 원인 | 수정 | 시험 이름 |
|---|---|---|---|---|
| 1 | 중간 | "정리 실행"이 신청 정리 → 호출 기록 정리를 한 덩어리로 처리해, 신청 정리(이미 커밋된 별도 트랜잭션)가 성공한 뒤 호출 기록 정리만 실패해도 삭제 수·남은 수·보류 수가 사라지고 "처리하지 못했어요"만 떴다 | 두 트랜잭션 분리는 그대로 두고 결과·오류를 각각 처리하는 `runCleanup`으로 바꿨다. 신청 정리 성공 뒤 호출 기록 정리만 실패하면 "신청 N건을 정리했어요. (남은·보류 수) 호출 기록 정리는 완료하지 못했어요. 다시 시도해 주세요."를 보여 준다. 신청 정리가 실패하면 "신청 정리를 하지 못했어요. 호출 기록 정리도 하지 않았어요."를 보여 주고 두 번째 RPC는 부르지 않는다 | 단위 `[재검토5 1] 정리 실행: 둘 다 성공하면 …`, `[재검토5 1] 정리 실행: 신청 정리는 성공하고 호출 기록 정리만 실패하면 …`, `[재검토5 1] 정리 실행: 신청 정리가 실패하면 그렇게 알리고 호출 기록 정리 RPC는 부르지 않는다` |
| 2 | 메모 | 호출 기록 정리가 남은 행을 `COUNT(*)`로 전부 세서, 5,000행 삭제 제한이 전체 실행 시간의 상한이 되지 못했다 | 남은 수를 `LIMIT 5001` 부분 질의로 5,001개까지만 센다. 5,001이면 화면에 "남은 기록이 5,000행 넘게 있어요. 다시 눌러 지워 주세요."를 보여 준다 | DB `[재검토5 2] 호출 기록 정리의 남은 수는 5,001개까지만 센다(실행 시간 상한, 5,001 = '5,000 넘음')`(10,002행 → 5,000/5,001, 5,000/2, 2/0) · 단위 `[재검토5 2] 남은 호출 기록이 5,000행을 넘으면 정확한 수 대신 '5,000행 넘게'로 알린다` |

한계: 실제 PostgreSQL 다중 세션의 동시 정리 대기·교착은 이번에도 시험하지 않았다(PGlite는 세션 하나). 화면 문구는 단위 시험으로만 확인했다(E2E는 기존 흐름 회귀 통과).

## 7차 재검토 반영 (Codex, 2026-11-01, 판정 "수정 필요")

원문: `D:/SaaS/01_일감체크/스테이션/과제/2-MVP/검토-codex-2026-11-01-신청기능-재검토6.md`. 판정: 6차 2건 중 1건 해결(남은 수 상한), 1건 부분 해결(부분 성공 안내). 남은 결함 1건(P2, 재검토는 6차 이전 커밋에서도 재현돼 이번 변경이 만든 것은 아니라고 구분).
작업자(Claude) 보고: 시험을 먼저 만들어 실패를 확인한 뒤 고쳤다(작업자 실행 기록, 독립 입증 아님).

| # | 심각도 | 원인 | 수정 | 시험 이름 |
|---|---|---|---|---|
| 1 | P2 | 작업 뒤 목록을 다시 불러오다 실패하면 화면이 오류 화면(`gate="error"`)으로 일찍 빠지는데, 작업 결과 메시지는 정상 화면에서만 그려져 이미 끝난 작업 결과가 가려졌다. 정리 실행뿐 아니라 같은 `run()` → `refresh()` 흐름인 통지 보냄 표시·삭제 요청 처리·삭제 안내 완료·결과 기록도 같은 문제였다 | 오류 화면에서도 같은 로그인 세션에서 받은 작업 결과를 먼저 보여 주고(`beta-ops-last-result`), 그 아래에 "운영 기록을 불러오지 못했어요. 방금 한 작업은 위와 같이 처리됐고, 목록만 다시 불러오지 못했어요."와 "목록 다시 불러오기" 버튼을 따로 보여 준다. 모든 작업이 같은 메시지 상태를 쓰므로 한 번에 고쳐진다. 로그아웃·계정 전환 때 결과를 지우는 동작(`clearAll`)은 그대로이고, 로그인 필요·운영자 아님 화면에는 결과를 보여 주지 않는다 | 단위 `[재검토6] 신청 정리 성공 → 호출 기록 정리 실패 → 목록 다시 불러오기 실패여도, 완료된 정리 결과와 목록 갱신 실패를 둘 다 보여 준다`, `[재검토6] 통지 보냄 표시처럼 다른 작업도, 뒤이은 목록 갱신이 실패해도 완료 결과를 보여 준다`, `[재검토6] 남아 있던 작업 결과는 계정이 바뀌면 지운다(1차 1번 회귀 금지)` |

한계: 작업 결과는 화면 메모리에만 있어 브라우저를 새로고침하면 사라진다(DB에 남는 기록 — 삭제 수는 신청 목록, 통지·삭제 기록은 각 목록 — 은 다시 불러오면 볼 수 있다). 화면 문구는 단위 시험으로만 확인했다(E2E는 기존 흐름 회귀 통과).
(위 표의 오류 화면 문구 "목록만 다시 불러오지 못했어요"는 8차 재검토 2번에 따라 바뀌었다. 아래 절 참고.)

## 8차 재검토 반영 (Codex, 2026-11-01, 판정 "수정 필요")

원문: `D:/SaaS/01_일감체크/스테이션/과제/2-MVP/검토-codex-2026-11-01-신청기능-재검토7.md`. 판정: 7차 1건 해결(다섯 작업 경로 모두 실제 컴포넌트로 확인). 새로 2건.
이번 반영은 구현 에이전트가 주간 사용량 한도로 멈춰서 **Claude(메인 세션)가 직접** 고쳤다. 새 시험 4개를 수정 전 코드(`a5f289e`의 화면 파일)로 돌려 4개 모두 실패하는 것을 확인했고, 수정 뒤 24개 모두 통과했다(작업자 실행 기록, 독립 입증 아님).

| # | 심각도 | 원인 | 수정 | 시험 이름 |
|---|---|---|---|---|
| 1 | P2 | 작업 RPC를 기다리는 사이 로그아웃·계정 전환이 있으면, 늦게 온 응답이 이전 계정의 결과를 새 화면(로그인 필요 화면·다른 계정의 오류 화면)에 다시 띄웠다. `run()`·`runCleanup()`에 작업 시작 세대 검사가 없었고, 뒤이은 `refresh()`가 호출 순간의 세대를 저장해 이전 작업의 조회를 새 세대로 취급했다. 세대 검사 누락과 로그인 화면이 오류 화면으로 덮이는 동작은 기존 결함, 결과 재노출은 7차 반영으로 더해진 것(재검토 판정) | 작업 시작 때 세대를 저장하고 모든 `await` 뒤(메시지 저장·다음 RPC·목록 조회 전)에 현재 세대와 비교해 다르면 아무것도 하지 않고 끝낸다(`isStale`). `refresh(target, startedGeneration)`로 작업 시작 세대를 넘겨, 세대가 다르면 조회 자체를 하지 않는다. `copyAdTargets`도 같은 규칙 | `[재검토7 1] 정리 RPC를 기다리는 사이 로그아웃하면, 늦게 온 성공 응답이 결과를 다시 띄우거나 다음 RPC를 부르지 않는다`, `[재검토7 1] 통지 보냄 표시를 기다리는 사이 다른 계정으로 바뀌면, 이전 계정의 완료 문구가 새 계정 화면에 나오지 않는다`, `[재검토7 1] 정리 두 단계 사이에 계정이 바뀌면, 호출 기록 정리 RPC를 부르지 않고 결과도 띄우지 않는다` |
| 2 | P3 | 오류 화면의 결과 유지 조건이 성공·실패를 가리지 않아, 작업 자체가 실패해도 "방금 한 작업은 위와 같이 처리됐고, 목록만 다시 불러오지 못했어요"라고 실패 범위를 잘못 말했다 | 공통 문구를 "목록 갱신에도 실패했어요. 위 작업 결과를 확인한 뒤 목록을 다시 불러와 주세요."로 바꿔 실패 범위를 단정하지 않는다 | `[재검토7 2] 작업 자체가 실패하고 목록 갱신도 실패하면, '목록만' 실패했다고 단정하지 않는다` |

한계: 늦은 응답 차단은 화면 쪽 처리다. 이미 서버에서 끝난 작업(예: 정리 RPC가 지운 신청)은 되돌리지 않으며, 같은 운영자가 다시 로그인해 목록을 불러오면 결과가 반영된 목록을 본다.

## 9차 재검토 결과 (Codex, 2026-11-01, 판정 "병합 가능")

원문: `D:/SaaS/01_일감체크/스테이션/과제/2-MVP/검토-codex-2026-11-01-신청기능-재검토8.md`. 대상 `9b044f0`(`git diff a5f289e..HEAD`).
- 8차 P2·P3 모두 해결. Codex가 실제 컴포넌트(React·JSDOM, hosted backend·RPC 변환 코드)에 응답 지연을 넣어 8개 경로를 재현했다: `run()` 네 작업(통지 보냄 표시·삭제 처리·삭제 안내 완료·결과 기록), `runCleanup()` 두 단계 사이와 두 번째 응답 대기, `copyAdTargets()` 목록 응답 대기·클립보드 응답 대기. 로그아웃·다른 운영자 전환·같은 계정 재로그인 포함. 모두 이전 결과 표시·후속 조회 없음.
- 새 문제 없음: 정상 작업 뒤 목록 갱신 유지, 같은 계정의 TOKEN_REFRESHED·SIGNED_IN은 진행 중 작업을 무효화하지 않음, "목록 다시 불러오기"는 작업 RPC를 다시 부르지 않음, 오류 화면에 이메일·토큰·서버 오류 원문 없음.
- Codex 독립 시나리오 117개 통과(같은 검증을 수정 전 `a5f289e`에 돌리면 결함 검출), 베타 DB 40개·권한 36개 PASS. 전체 Vitest·E2E·빌드는 Codex가 다시 돌리지 않았다(위 8차 반영 뒤 재검증은 Claude가 돌림).
- 판정에서 뺀 것(요청대로): 정책·법률 결정 대기, 실제 PostgreSQL 다중 세션 미검증.

## 한계·운영 안내 (호출 제한 기록)

- 호출 제한 카운터 표(`beta_public_call_counters`)는 **운영자가 "정리 실행"을 누르지 않으면 계속 커진다.** "2일 지난 행" 조건은 자동 만료가 아니라 정리를 실행할 때만 적용된다. 자동 예약은 아직 없다(범위 문서 '하지 않는 것').
- 크기 추정(재검토 계산): 신청만 보더라도 매시간 서로 다른 주소 300개가 접수되면 주소별 시·일 카운터와 전체 카운터로 **하루 약 14,424행**이 늘 수 있다. 확인·수신거부의 링크별 분 카운터는 별도다. 전체 한도가 찬 뒤 거절되는 새 주소는 카운터 행을 만들지 않는다(재검토 2 보호 유지).
- 운영 안내: 신청을 받는 동안에는 적어도 며칠에 한 번 "정리 실행"을 누른다. 한 번에 5,000행까지 지우므로 남은 행이 있다고 나오면 다시 누른다. 자동 예약(service_role 예약 작업 등)은 사용자 결정 뒤 다음 단계에서 만든다.
- 실제 PostgreSQL 두 세션 시험은 이번에도 하지 않았다(PGlite는 세션 하나).

## 사용자 결정 필요 (Codex 4차 재검토가 정리한 정책·법률 결정 목록, 원문 그대로)

- 주소 정리 뒤 화면 통지만 허용할지, 통지용 최소 이메일 주소를 보관할지와 그 근거·기간
- 광고 제외 기록·발송금지 해시·동의 및 철회 증빙·수신거부 토큰의 보유 근거와 종료 기준
- 미완료 삭제 요청의 이메일 보관 상한과 발송 실패 종료 절차
- 미발송 통지 때문에 신청 정보 전체의 보관을 연장하는 정책과 최소 정보 보관 방식
- 광고 미체크의 의사표시 해석, 주소 확인 전 동의 통지 발송, 광고 목적 안내와 수신 동의의 단일 체크 방식
- 개인정보처리방침 확정·게시, Supabase·Gmail 위탁 및 국외 이전, 접속 기록 고지
- 전송자 명칭·사업자명·문의 창구의 정합성
- (Claude 추가, 스테이션 Codex 설계 검토 1·2번) 확인·수신거부 토큰 원문 보관 방식과 이메일 해시의 비밀 키(HMAC) 사용 여부 — 위 판단 26
- [방침 초안:29·42] 에 보관 연장·이메일 통지 불가 경계 반영 → 이번에 `docs/beta-apply-privacy-draft.md` 2절·4절에 '법률 검토 대상'으로 반영했다

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

### 재검토 반영 뒤 재검증 (2026-11-01, 출력 원문 발췌)

```
$ npm run lint            → LINT_EXIT=0
$ npm run typecheck       → TYPECHECK_EXIT=0
$ npx vitest run
 Test Files  137 passed (137)
      Tests  905 passed (905)
$ node scripts/test-native-push-db.mjs
PASS: native SQL contract, deletion regression, 35 RPC privilege checks (ephemeral PGlite).
NATIVE_DB_EXIT=0
$ node scripts/test-beta-consent-db.mjs
PASS: 31 beta consent DB checks (ephemeral PGlite).
BETA_DB_EXIT=0
$ npm run check:release
[release-gate] PASS unit            (905 tests)
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
BUILD_SITES_EXIT=0 (✓ built in 781ms / ✓ built in 53ms)
Sites output verified
VERIFY_SITES_EXIT=0
```

- 이번 재검토 반영으로 새로 생긴 화면 분기(수신거부 결과의 '변경 방법' 줄·이메일 통지 안내 줄, 운영자 화면의 '화면 통지만 함' 표시)는 **단위 시험으로만** 확인했다. 기존 E2E는 이 새 문구를 검사하지 않고, 미리보기 수신거부는 늘 '메일로 보낼 예정' 상태라 주소 없는 분기를 실행하지 않는다 — E2E는 **기존 흐름의 회귀 통과**만 뜻한다. 스크린샷은 다시 찍지 않았다.

### 3차 재검토 반영 뒤 재검증 (2026-11-01, 출력 원문 발췌)

```
$ npm run lint            → LINT_EXIT=0
$ npm run typecheck       → TYPECHECK_EXIT=0
$ npx vitest run
 Test Files  137 passed (137)
      Tests  908 passed (908)
$ node scripts/test-native-push-db.mjs
PASS: native SQL contract, deletion regression, 35 RPC privilege checks (ephemeral PGlite).
NATIVE_DB_EXIT=0
$ node scripts/test-beta-consent-db.mjs
PASS: 34 beta consent DB checks (ephemeral PGlite).
BETA_DB_EXIT=0
$ npm run check:release
[release-gate] PASS unit            (908 tests)
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
BUILD_SITES_EXIT=0 (✓ built in 890ms / ✓ built in 44ms)
Sites output verified
VERIFY_SITES_EXIT=0
```

- 이번에 바뀐 수신거부 재클릭 문구는 단위 시험으로만 확인했다(E2E는 기존 흐름 회귀 통과). 스크린샷은 찍지 않았다.

### 4차 재검토 반영 뒤 재검증 (2026-11-01, 출력 원문 발췌)

```
$ npm run lint            → LINT_EXIT=0
$ npm run typecheck       → TYPECHECK_EXIT=0
$ npx vitest run
 Test Files  137 passed (137)
      Tests  909 passed (909)
$ node scripts/test-native-push-db.mjs
PASS: native SQL contract, deletion regression, 35 RPC privilege checks (ephemeral PGlite).
NATIVE_DB_EXIT=0
$ node scripts/test-beta-consent-db.mjs
PASS: 37 beta consent DB checks (ephemeral PGlite).
BETA_DB_EXIT=0
$ npm run check:release
[release-gate] PASS unit            (909 tests)
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
BUILD_SITES_EXIT=0 (✓ built in 793ms / ✓ built in 44ms)
Sites output verified
VERIFY_SITES_EXIT=0
```

- 정리 결과 문구(남은 정리 대상)는 단위 시험으로만 확인했다(E2E는 기존 흐름 회귀 통과). 실제 PostgreSQL 두 세션 교착 시험은 하지 않았다.

### 5차 재검토 반영 뒤 재검증 (2026-11-01, 출력 원문 발췌)

```
$ npm run lint            → LINT_EXIT=0
$ npm run typecheck       → TYPECHECK_EXIT=0
$ npx vitest run
 Test Files  137 passed (137)
      Tests  910 passed (910)
$ node scripts/test-native-push-db.mjs
PASS: native SQL contract, deletion regression, 36 RPC privilege checks (ephemeral PGlite).
NATIVE_DB_EXIT=0
$ node scripts/test-beta-consent-db.mjs
PASS: 39 beta consent DB checks (ephemeral PGlite).
BETA_DB_EXIT=0
$ npm run check:release
[release-gate] PASS unit            (910 tests)
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
BUILD_SITES_EXIT=0 (✓ built in 849ms / ✓ built in 47ms)
Sites output verified
VERIFY_SITES_EXIT=0
```

- 정리 버튼·결과 문구 변경은 단위 시험으로만 확인했다(E2E는 기존 흐름 회귀 통과). 스크린샷은 찍지 않았다.

### 6차 재검토 반영 뒤 재검증 (2026-11-01, 출력 원문 발췌)

```
$ npm run lint            → LINT_EXIT=0
$ npm run typecheck       → TYPECHECK_EXIT=0
$ npx vitest run
 Test Files  137 passed (137)
      Tests  914 passed (914)
$ node scripts/test-native-push-db.mjs
PASS: native SQL contract, deletion regression, 36 RPC privilege checks (ephemeral PGlite).
NATIVE_DB_EXIT=0
$ node scripts/test-beta-consent-db.mjs
PASS: 40 beta consent DB checks (ephemeral PGlite).
BETA_DB_EXIT=0
$ npm run check:release
[release-gate] PASS unit            (914 tests)
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
BUILD_SITES_EXIT=0 (✓ built in 819ms / ✓ built in 44ms)
Sites output verified
VERIFY_SITES_EXIT=0
```

### 7차 재검토 반영 뒤 재검증 (2026-11-01, 출력 원문 발췌)

```
$ npm run lint            → LINT_EXIT=0
$ npm run typecheck       → TYPECHECK_EXIT=0
$ npx vitest run
 Test Files  137 passed (137)
      Tests  917 passed (917)
$ node scripts/test-native-push-db.mjs
PASS: native SQL contract, deletion regression, 36 RPC privilege checks (ephemeral PGlite).
NATIVE_DB_EXIT=0
$ node scripts/test-beta-consent-db.mjs
PASS: 40 beta consent DB checks (ephemeral PGlite).
BETA_DB_EXIT=0
$ npm run check:release
[release-gate] PASS unit            (917 tests)
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
BUILD_SITES_EXIT=0 (✓ built in 750ms / ✓ built in 52ms)
Sites output verified
VERIFY_SITES_EXIT=0
```

### 8차 재검토 반영 뒤 재검증 (2026-11-01, Claude 직접 실행, 출력 원문 발췌)

```
LINT_EXIT=0
TYPECHECK_EXIT=0
 Test Files  137 passed (137)
      Tests  921 passed (921)
PASS: native SQL contract, deletion regression, 36 RPC privilege checks (ephemeral PGlite).
PASS: 40 beta consent DB checks (ephemeral PGlite).
[release-gate] PASS unit
[release-gate] PASS lint
[release-gate] PASS typecheck
[release-gate] PASS production dependency audit
[release-gate] PASS local production build
[e2e-release] PASS desktop/core · desktop/surface · mobile/core · mobile/surface (통과 수 14 27 14 27)
[release-gate] PASS local production E2E
[release-gate] PASS hosted fail-closed production build
[release-gate] PASS unit/lint/typecheck/audit/local E2E/hosted build 전체 게이트 통과.
CHECK_RELEASE_EXIT=0
BUILD_SITES_EXIT=0
Sites output verified
```
