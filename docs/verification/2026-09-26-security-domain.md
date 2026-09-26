# 2026-09-26 보안 업데이트 및 도메인 전환 검증

## 범위와 보존 조건

- 기준 커밋: b10312bed0ff0837bcd9f0ecb4d940bf35cb0961.
- 작업 브랜치: chore/security-domain-20260926. 보안 의존성은 별도 커밋/PR로 분리.
- 기존 설문 문서, 사용자 자료, 영상, 백업, 미추적 폴더는 작업 커밋에서 제외.
- 기존 심사용 주소와 Supabase 프로젝트를 유지. DB migration, 고객 데이터, 로그인 제공자, 정책 publication digest는 변경하지 않음.

## 구현 및 리뷰

- next, @next/env, eslint-config-next를 16.3.6으로 정렬. Vitest 4.1.11. npm이 lockfile을 갱신했으며 --force는 사용하지 않음.
- sharp 0.35.4, wrangler 4.141.0, qs 6.16.0 등 취약 의존성 갱신. miniflare의 prerelease 버전은 상위 wrangler의 의존성 해석 결과이며 별도 alpha 버전을 선택한 것이 아님.
- 기본 운영 origin을 deployment-origin.ts로 분리. 환경변수 미설정 시 기존 주소 유지.
- Sites HTML 메타데이터/CSP와 모바일 localhost public-config 부트스트랩에 동일 origin 설정 적용.
- OAuth 복귀 주소와 고객 수정요청 링크는 실제 접속한 origin을 사용. canonical 설정이 새 주소여도 기존 주소 사용자를 강제로 이동시키지 않음.
- Supabase 인증 설정 생성/검증에서 현재 주소와 명시한 이전 주소만 허용.
- 독립 리뷰(gpt-6-astra/high): Critical 0, Important 1, Minor 1. Important는 와일드카드 hostname 허용, Minor는 기존/새 origin 동작의 명시적 회귀 테스트 부족.
- 와일드카드 및 인코딩된 와일드카드 거부 테스트를 먼저 실행해 실패 5건을 확인한 뒤 공용 정규화 함수 수정. 관련 21개 테스트 통과.
- 실제 JSDOM URL을 기존/새 주소로 바꿔 Google OAuth today/settings와 고객 링크 복사 테스트를 추가. 관련 23개 테스트 통과. 애플리케이션 구현을 테스트 편의 목적으로 변경하지 않음.

## 최종 실행 결과

외장 드라이브의 의존성 설치/파일 I/O가 느려 동일 Git 기준의 로컬 임시 검증 복사본에서 수행했다. 결과는 아래 변경 소스에 대한 검증이며 운영에 자동 반영됐다는 뜻이 아니다.

| 검사 | 결과 |
|---|---|
| npm run check:release | PASS, exit 0 |
| 단위 테스트 | 91개 파일 / 516개 통과 |
| 데스크톱·모바일 E2E | 4개 격리 배치 / 44개 통과 |
| lint / typecheck | PASS |
| 운영 의존성 감사 | 0건 |
| 전체 npm audit | 운영·개발 포함 0건 |
| 로컬 production / hosted fail-closed Next build | PASS |
| 기본 origin Sites build 및 verify-sites-output | PASS |
| 새 origin Sites build, HTML 치환 검증 및 verify-sites-output | PASS |
| 기본 origin으로 다시 빌드 | PASS, pending 주소가 실수로 기본 빌드에 남지 않음 |
| git diff --check | PASS, CRLF 안내만 출력 |

실제 대시보드가 새 redirect를 기존 목록 뒤에 추가하는 것을 확인했다. 순서만 다른 정확한 URL 집합을 실패시키는 진단 오탐을 추가 재현(1 failure)한 뒤, 순서는 무시하되 중복·추가 URL·인코딩 변형·와일드카드는 계속 거부하도록 수정했다. 최종 재실행은 **91개 파일/517 tests, E2E 44개 및 모든 release gate PASS, exit 0**.

비차단 경고: 기존 큰 client chunk, Node 25 localStorage 경고, Vite 차기 major native config의 import 확장자 안내. 현재 빌드/테스트 실패는 아님.

## 외부 상태와 미완료 항목

- 기존 운영 주소의 원격 smoke: 9개 검사 PASS (변경 전 운영 버전에 대한 상태 확인).
- Sites에 ilgam.studioyeolmae.com 등록. provider/domain/TLS 모두 active 확인.
- 예스닉에 CNAME 1개, 소유권 확인 TXT 2개 등록 완료. 사용자에게 SLA/트래픽 제한 확인사항 동의를 받은 뒤 신청했으며 결과 3개 모두 등록완료. 다른 서비스 레코드는 수정하지 않음. Google DNS에서 CNAME, Cloudflare DNS에서 소유권 TXT 확인.
- Supabase Site URL을 새 주소로 저장하고 대시보드 reload 후 재확인. 기존/새 주소 today/settings 4개를 유지. Google callback은 기존 Supabase callback 그대로이며 Google Cloud 클라이언트 수정 없음.
- 새 주소 smoke 9개와 양쪽 주소 runtime readback PASS. 동일 Supabase ref/runtime 202608250011/public config digest/current service-role contract 확인. policyPublication.finalized=false는 기존 베타 정책 상태이며 임의 변경하지 않음.
- 사용자 Google 로그인 후 새 Today 진입/저장됨/실시간 연결됨 확인. 기존 주소도 동일 계정으로 정상 세션 유지. 양쪽 일감 0건. 운영 고객 데이터를 새로 생성·수정·삭제하지 않음.
- Supabase Management API 전용 토큰은 제공되지 않아 CLI auth readback 명령 자체는 실행하지 않음. 대신 대시보드 reload 확인과 실제 Google OAuth 복귀를 검증했으며 해당 CLI가 통과했다고 주장하지 않음.
- 실제 기존 고객 bearer-token 조회/제출과 최종 코드 배포 후 양쪽 주소 smoke는 별도 남음.
- 알려진 의존성 취약점 0건과 자동 테스트 통과는 제로데이가 없다는 보증이 아님.

도메인 레코드와 전환 순서: ../DOMAIN-TRANSITION.md.
