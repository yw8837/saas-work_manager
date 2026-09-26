# 2026-09-26 운영 기능 최종 확인

## 확인된 범위

- 대표 주소: https://ilgam.studioyeolmae.com (Sites v27). 기존 심사 주소는 호환용으로 유지한다.
- Supabase 프로젝트 evhkpgxacpweelnmjmqh: ACTIVE_HEALTHY.
- 새/기존 주소 smoke 각 9개 PASS. 로그인 계정의 저장됨·실시간 연결 확인.
- 운영 검증 전용 일감 1건으로 신규 주소 고객 요청 1회, 기존 주소 고객 요청 1회 제출 성공. 작업자 화면에서 같은 일감의 수정 사용 0→1→2와 양쪽 요청 원문/시각 반영 확인.
- ACL 보완 후 할 일 1/6 완료 저장 및 공개 고객 요청 1회 추가 성공. 포함 한도를 넘은 요청은 추가 작업 검토로 분리되며 사용 횟수는 2/2에 유지.
- 이번 변경 뒤 단위 테스트 93파일/521개, lint/typecheck PASS. npm audit --omit=dev: 0건.
- mobile:verify 최초 실행은 mobile bundle이 없어 실패. build:mobile 후 재실행 PASS. 이는 Android/iOS shell 정적 확인이며 실제 기기 배포·스토어 출시를 뜻하지 않는다.
- Vite의 큰 chunk 및 향후 native config loader 경고, Node 25 localstorage 경고는 남아 있으나 검사 실패는 아니다.

## 최소 권한 보완

원격 default ACL이 anon에 함수 EXECUTE를 직접 부여한 상태라 기존 PUBLIC revoke만으로는 익명 실행 권한이 제거되지 않았다. owner RPC 14개 내부에는 auth.uid/소유자 검사가 있어 이번 검토에서 익명 무단 데이터 변경은 입증되지 않았다. 불필요한 호출 경로를 줄이는 방어 보완이다.

- migration: 20260926140654_rpc_execution_surface.sql, 운영 적용 성공.
- owner RPC 14개: PUBLIC/anon EXECUTE 제거. authenticated/service_role 유지.
- trigger 함수 4개: PUBLIC/anon/authenticated EXECUTE 제거. owner/service_role 및 기존 trigger 유지.
- 고객 bearer-token RPC 3개는 유지. 모든 함수를 일괄 INVOKER로 바꾸지 않음.
- supabase/tests/rpc_execution_surface.sql은 실제 pg_catalog 유효 권한을 검사한다. 적용 전 22개 중 18개 false(RED), 적용 후 22개 모두 true(GREEN). SQL 실행 성공만으로 PASS 판정하지 말고 모든 passed 값을 확인할 것.
- 적용 후 trigger 4개 모두 활성, owner postgres 유지 확인.
- 이어진 삭제 보완 trigger를 포함한 최종 권한 검사는 23/23 true이다.
- advisor의 익명 SECURITY DEFINER 경고 21→3. 남은 3개는 공개 고객 링크용. authenticated 경고 18개는 용도별 로그인/공개 RPC이며 소유자 검사를 별도 유지한다.
- RLS 정책 없는 테이블 3개는 내부용 기본 차단이다. 경고 제거 목적으로 allow 정책을 추가하지 않는다.
- 비밀번호 유출 보호 경고는 Google-only/이메일 provider OFF 계약과 구분. MFA 추가는 별도 등록·복구 설계 없이 임의로 강제하지 않는다.

독립 리뷰는 함수 본문·원격 ACL·trigger를 읽어 최소 변경을 검토했다. 이것은 모든 취약점이나 제로데이가 없다는 보장이 아니다.

## 실제 발견한 일감 삭제 잔존 기록 버그

UI에서 일감을 삭제하면 문서 JSON에서는 사라지고 공개 링크도 거부됐지만 별도 portal 1행·요청 3행이 남는 문제를 발견했다. 이는 일감 삭제 시 함께 삭제한다는 공개 안내와 맞지 않았다.

- migration `20260926141910_workspace_job_revision_cleanup` 운영 적용.
- 동일 문서의 OLD.jobs에는 있고 NEW.jobs에는 없는 ID에만, 그 소유자의 요청→portal 순서로 삭제한다. 유지한 일감·다른 소유자·과거 무관한 orphan·사용량 원장은 건드리지 않는다.
- 고객 제출과 portal 등록은 document→portal 잠금 순서로 맞췄다. 공개 제출은 문서 잠금 뒤 토큰/owner/활성을 재검사하며, 등록은 문서 잠금을 얻지 못하면 즉시 거부한다. 동시 삭제·접수의 잠금 순환과 삭제 후 portal 재생성을 방지한다.
- `supabase/tests/workspace_job_deletion.sql`: 임시 합성 소유자만 사용하며 성공/실패 모두 rollback. 실제 save RPC 경로에서 삭제·유지 일감·다른 소유자·무관한 orphan·일반 편집·반복 저장·공개 제출/동일 요청 재시도·삭제 링크 거부를 검사한다. 적용 전 `deleted_job_revision_data_retained` RED, 적용 후 PASS.
- 사용자 승인 및 확인 클릭으로 실제 검증 일감 삭제. 이미 남아 있던 테스트 자료는 확인한 owner+job key+portal ID와 정확한 3요청/1portal 수량을 제한해 별도 삭제했다. 후속 DB 조회 결과 portal0/request0. 실제 고객/기존 패키지/계정은 삭제하지 않았다.
- 대규모 동시 부하 테스트는 수행하지 않았다. 잠금 순서의 정적 독립 검토와 직렬 실제 RPC 회귀 결과를 구분한다.

## 빈 일감 화면의 마지막 정렬 보완

- 운영 테스트 자료를 정리한 뒤 아이콘·제목·설명·버튼이 한 줄에 붙는 기존 UI 결함을 발견했다. `.jobEmpty`에 세로 flex 정렬과 8px 간격만 추가했고 문구·라우트·저장 로직은 바꾸지 않았다.
- `e2e/responsive-ui.spec.ts`: 320/1440px 각각 초기 빈 목록과 검색 결과 없음에서 요소의 세로 순서·가로 경계·가로 넘침·첫 일감 생성 페이지 이동을 검사한다. local build에서 수정 전 요소 순서 assertion RED, 수정 후 4/4 PASS. 최초 테스트는 이전 hosted build여서 실행 준비 오류가 있었으며 local rebuild 뒤 실제 결함을 재현했다. 두 파일의 독립 정적 리뷰도 PASS. 세로 화면 안 배치나 다른 요소에 의한 가림까지 자동 검증했다는 뜻은 아니다.
- 최종 PR CI 및 배포 영수증은 HANDOFF.md 최신 절에 기록한다.

## 미완료 운영 조건 — 통과로 꾸미지 않음

- policyPublication.finalized=false. --require-finalized 검사 FAIL. 법률 검토와 정책 확정의 증거가 없으므로 true로 바꾸지 않았다.
- operational:evidence:verify는 저장소 밖 운영 증거 경로가 없어 FAIL. 실제 계정 탈퇴/cascade와 별도 복구 환경에서의 백업 복원 증거를 만들지 않았다. 운영 DB를 복원 실험 대상으로 쓰지 않는다.
- 기존 check:external-beta는 Vercel/SMTP 및 recentPasswordAmrVerified를 전제로 한다. 현재 Sites/Google-only/최근 OAuth 재인증과 맞지 않아 외부 출시 승인 명령으로 그대로 사용하면 안 된다. 이 불일치는 약관·복구 증거를 생략할 이유가 아니다.
- 유료 결제는 기존 제품 범위대로 준비 중이다.

## 증거

브라우저 캡처: C:\Users\최용우\.gstack\projects\saas-work-manager\designs\design-audit-20260926\screenshots\production-revision-cross-domain.png 및 production-revision-acl-after.png.
공개 링크의 bearer token, 세션/관리 키, 실제 고객 데이터는 이 기록에 보관하지 않는다.
