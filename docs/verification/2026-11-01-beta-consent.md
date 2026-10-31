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
| 권한 회귀 | `supabase/tests/rpc_execution_surface.sql` 24→33행, `scripts/test-native-push-db.mjs` 기대 33 |
| 규칙·문구·초안 | `src/lib/beta/apply-copy.ts`, `rules.ts`, `mail-drafts.ts`, `ops-backend.ts` |
| RPC 호출 | `src/lib/supabase/beta.ts` |
| 화면 | `src/components/beta-apply-form.tsx`, `beta-confirm-view.tsx`, `beta-unsubscribe-view.tsx`, `beta-ops-applications.tsx`, `beta-public-shell.tsx` |
| Next 경로 | `src/app/apply/page.tsx`, `src/app/apply/confirm/[token]/page.tsx`, `src/app/u/[token]/page.tsx`, `src/app/ops/applications/page.tsx` |
| Sites 셸 | `src/sites/routes.tsx`, `src/lib/standalone-routes.ts`, `src/sites/entry-server.tsx`(noindex), `scripts/prepare-sites-spa-routes.mjs`, `scripts/verify-sites-output.mjs` |
| 방침 초안 | `docs/beta-apply-privacy-draft.md` (법률 검토 대상) |

## RPC와 권한

| 함수 | anon | authenticated | service_role | 비고 |
|---|---|---|---|---|
| `submit_beta_application(text,text,boolean,text,text[],text,boolean,boolean,text)` | O | O | O | 신청. 토큰을 돌려주지 않음. 주소당 3건/시간·5건/일, 전체 300건/시간 |
| `confirm_beta_email(text)` | O | O | O | 주소 확인. 전체 120회/분 |
| `unsubscribe_beta_ads(text)` | O | O | O | 수신거부. 전체 120회/분 |
| `beta_ops_list_applications()` | X | O(운영자만) | O | 함수 안에서 `beta_operator_accounts` 재확인 |
| `beta_ops_list_notices()` | X | O(운영자만) | O | |
| `beta_ops_mark_notice_emailed(uuid)` | X | O(운영자만) | O | |
| `beta_ops_record_milestone(uuid,text,text)` | X | O(운영자만) | O | 결과 안내·인터뷰 끝·베타 끝 → 정리 예정일 |
| `beta_ops_delete_application(uuid)` | X | O(운영자만) | O | 삭제 요청 |
| `beta_ops_purge_expired()` | X | O(운영자만) | O | 보유기간 지난 신청 정리 |

모두 `security definer`, `set search_path = ''`. 내부 도우미 6개(`ilgam_private.beta_*`)는 anon·authenticated 실행 불가. 표 7개는 anon·authenticated의 select·insert·update·delete 모두 불가(Supabase 기본 ACL을 흉내 낸 PGlite에서 확인).

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
3. 삭제 요청은 광고 동의(유효·확인 대기)가 있으면 '철회'로도 기록한다(통지 마감 14일, 화면 표시 없음). 같은 주소의 신청 정보를 모두 지운다.
4. 확인 링크 유효기간 30일. 수신거부 링크는 만료 없음(신청 삭제 뒤에도 해시로 '이미 처리됨' 안내).
5. 호출 제한: 신청 전체 300건/시간, 같은 주소 3건/시간·5건/일. 확인·수신거부 각각 전체 120회/분. 넘으면 저장·처리하지 않고 화면에 "처리하지 못함"을 보여 준다.
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
19. 결과 안내 보냄 표시는 한 번만 기록된다(되돌리기 없음). 미충족이면 결과는 '기준 미충족'만 고를 수 있다.
20. 운영자 로그인은 기존 `/today` 로그인을 그대로 쓰고, 운영자 화면은 세션과 운영자 표만 확인한다.
21. `/apply` 자체는 공개 모집 페이지라 noindex를 붙이지 않았다. 확인·수신거부·운영자 화면만 noindex(메타 + `X-Robots-Tag`).
22. 신청 화면에 개인정보처리방침 링크를 넣지 않았다(방침에 아직 이 처리 내용이 없어서). 방침 게시 뒤 넣는다.
23. 운영자 화면 로컬 미리보기는 가상 예시 4건(example.invalid)을 메모리에만 둔다(E2E로 초안 화면을 확인하려고).
24. 전송자 명칭은 범위 문서·확정값의 "스튜디오열매"를 썼다. 저장소 `src/lib/business-identity.ts`는 "열매스튜디오(열매STUDIO)"라 다르다. 어느 쪽이 맞는지 사용자 확인 필요.

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
