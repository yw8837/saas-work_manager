---
name: 일감체크 — Studio Production List
description: 흰색과 흑연색의 작업 목록, 주의가 필요한 순간에만 체리색
colors:
  ink: "#242426"
  ink-soft: "#444448"
  muted: "#68686e"
  paper: "#fff"
  canvas: "#f5f5f6"
  line: "#e5e5e7"
  line-strong: "#c9c9cf"
  border-strong: "#8c8c94"
  primary-active: "#101012"
  interactive: "#3d3d43"
  state-soft: "#f1f1f3"
  cherry: "#b82248"
  cherry-soft: "#fff1f4"
typography:
  headline:
    fontFamily: '"Pretendard Variable", Pretendard, SUIT, "Noto Sans KR", Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "32px"
    fontWeight: 650
    lineHeight: 1.14
    letterSpacing: "-.035em"
  title:
    fontFamily: '"Pretendard Variable", Pretendard, SUIT, "Noto Sans KR", Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "18px"
    fontWeight: 650
    lineHeight: 1.22
    letterSpacing: "-.02em"
  body:
    fontFamily: '"Pretendard Variable", Pretendard, SUIT, "Noto Sans KR", Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: '"Pretendard Variable", Pretendard, SUIT, "Noto Sans KR", Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "12px"
    fontWeight: 500
    letterSpacing: "normal"
rounded:
  field: "6px"
  navigation: "8px"
  control: "12px"
  badge: "5px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  field: "20px"
  section: "24px"
  group: "32px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "0 20px"
  button-primary-hover:
    backgroundColor: "{colors.interactive}"
  button-primary-active:
    backgroundColor: "{colors.primary-active}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 18px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    height: "46px"
  nav-item:
    textColor: "{colors.muted}"
    rounded: "{rounded.navigation}"
    padding: "0 11px"
  status-neutral:
    backgroundColor: "{colors.state-soft}"
    textColor: "{colors.interactive}"
    rounded: "{rounded.badge}"
    padding: "5px 8px"
  status-urgent:
    backgroundColor: "{colors.cherry-soft}"
    textColor: "{colors.cherry}"
    rounded: "{rounded.badge}"
    padding: "5px 8px"
  form-section:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "20px"
---

# Design System: 일감체크

## Overview

**Creative North Star: "Studio Production List — 스튜디오 제작 목록"**

여러 고객의 일감을 정렬하고 필요한 항목으로 좁혀 처리하는, 차분하고 또렷한 작업대다. 흰 면과 흑연색 글자, 정렬된 목록, 얇은 구분선이 정보의 위계를 만든다. 크고 화려한 지표보다 고객·일감·기한·다음 행동의 읽기 순서를 우선한다.

이 문서의 토큰은 웹과 Capacitor가 공유하는 `.appFrame` 작업 화면에 한정한다. 근거는 `src/styles/theme.css`의 공통 기반과 그 위에 적용되는 `src/styles/workspace.css`, 실제 작업 컴포넌트다. 사용자 위임에 따라 선택된 세계를 구현 뒤 기록한 것으로, 배포·서명된 iOS 빌드·실기기 검증을 뜻하지 않는다. 화면별 구성 계약과 조사 출처는 `docs/design/workspace-direction.md`에 둔다.

기존 마케팅 랜딩과 고객 공개 수정요청 폼은 이 작업 화면 토큰의 대상이 아니다. 그 표면들의 실제 값은 아래 "코드 기준 색·모서리·바탕"에 따로 적는다. 마케팅 제목의 자체 호스팅 Paperlogy Medium, 본문·버튼의 Pretendard, Paperlogy SIL Open Font License 1.1 및 `public/fonts/paperlogy/OFL.txt` 보관 정책을 유지한다. 이 작업 화면의 색·두께·모서리를 그 표면들에 자동 전파하지 않는다.

## 코드 기준 색·모서리·바탕 (2026-10-31 사용자 결정 반영)

주 버튼 색은 **지금 사이트(먹색) 기준**이다. 이 절은 코드를 바꾸지 않고 코드에 있는 값을 그대로 적은 것이다. 값을 바꾸려면 코드(`src/styles/theme.css`, `src/styles/workspace.css`)를 먼저 바꾸고 이 표를 맞춘다.

색은 두 층으로 정의된다.

- **기본 층** `src/styles/theme.css` `:root`: 랜딩·사용설명서·고객 수정요청 링크(`/r/{token}`, `/demo/r`)·로그인 화면이 쓴다.
- **작업 화면 층** `src/styles/workspace.css` `.appFrame`: 로그인 뒤 작업 화면이 쓴다. 같은 변수 이름을 더 짙은 흑연·중립색으로 덮어쓴다(위 frontmatter 값).

| 역할 | 변수 | 기본 층 실제값 | 작업 화면 층 실제값 |
|---|---|---|---|
| 주 버튼(행동) | `--primary` = `--ink` | `#181d26` 먹색, 글자 `--on-primary` `#ffffff` | `#242426` 흑연 |
| 주 버튼 눌림 | `--primary-active` | `#0d1218` | `#101012` |
| 링크·선택·정보 | `--blue` / `--blue-soft` / `--blue-line` | `#1b61c9` / `#eef3fc` / `#c9d8fa` | 중립 별칭 `#3d3d43` / `#f1f1f3` / `#c9c9cf` |
| 상태 | `--green` `--amber` `--red` (+ `-soft`) | `#0a7d45` `#8a4f06` `#b3311f` | 완료·대기는 중립(`#444448`, `#535359`), 주의만 체리 `#b82248` |
| 마케팅 전용 강조 | `--coral` `--peach` `--forest` `--cream` `--mint` `--yellow` `--mustard` | `#aa2d00` `#fcab79` `#0a2e0e` `#f5e9d4` `#a8d8c4` `#f4d35e` `#d9a441` | 쓰지 않는다. `--coral`·`--cream`·`--warm`은 중립색(`#444448`, `#f1f1f3`)으로 덮여 있다 |
| 본문 면 | `--paper` | `#ffffff` | `#fff` |
| 바탕 | `--canvas` (`html` 배경) | `#f8fafc` | `#f5f5f6` |
| 고객 링크 화면 바탕 | `.publicRevisionPage` | `#eef2f7` (하드코딩, 모바일 760px 이하는 흰색) | — |

- **주 버튼은 먹색 하나.** 파랑으로 행동 버튼을 칠하지 않는다. 파랑은 기본 층에서 링크·선택·정보에만 쓴다. 작업 화면에서는 파랑 변수 자체가 중립색으로 덮여 있어서, 링크·선택도 흑연 명도로 보인다.
- **산호·피치·포레스트(와 크림·민트·옐로·머스터드)는 마케팅 전용.** 랜딩의 제목 강조, 약속 띠, 흐름 구획, 마지막 CTA 띠에만 쓴다. 앱 안으로 새로 들이지 않는다.
- 상태는 색만으로 전달하지 않고 글자·아이콘을 같이 붙인다(아래 Attention Rule과 같다).

모서리 실제값:

| 변수 | 기본 층 | 작업 화면 층 | 쓰임 |
|---|---|---|---|
| `--radius-sm` | `6px` | `6px`(덮지 않음) | 입력, 작은 버튼(`.compactButton`) |
| `--radius` | `10px` | `12px` | 카드·보조 버튼 |
| `--radius-lg` | `12px` | `12px` | 주 버튼, 큰 카드 |
| `--radius-pill` | `9999px` | `9999px` | 칩·배지 |

작업 화면 frontmatter의 `rounded`(field 6 / navigation 8 / control 12 / badge 5)는 위 변수와 컴포넌트별 고정값(`8px` 내비게이션 등)을 함께 요약한 것이다.

**Key Characteristics:**

- 흰 바탕과 흑연색, 정렬된 행으로 만드는 작업 중심 위계.
- 중립 명도로 표현하는 선택·완료·대기·Pro 상태.
- 지연·초과·오류·파괴적 행동에만 쓰는 체리색.
- 장식용 윗표제 대신 제목·날짜·실제 기능 설명.
- 데스크톱의 밀도와 모바일의 한 손 조작을 각각 보존.

## Colors

Primary와 Neutral이 화면 대부분을 담당하고, 체리색은 기능적 주의 신호다. 색 이름과 값의 기준은 위 frontmatter이며 같은 값을 다른 색 체계로 재정의하지 않는다.

Sidecar의 8단계 tonalRamp는 패널 탐색용으로 합성한 OKLCH 명도 견본이며 구현 토큰이나 대비 검증 결과가 아니다. 실제 UI에는 frontmatter의 추출값을 사용한다.

### Primary

- **흑연 잉크 / ink:** 제목, 주요 행동, 어두운 하단 행동 바. 눌린 상태는 primary-active, 호버는 interactive다.
- **체리 경고 / cherry:** 지연, 수정 초과, 오류, 삭제 등 주의가 필요한 동작과 상태. cherry-soft는 그 상태의 연한 받침이다.

### Neutral

- **백지 / paper:** 작업 본문과 상·하단 내비게이션.
- **작업대 회색 / canvas:** 사이드바, 검색, 프리뷰, 안내와 보조 영역.
- **보조 잉크 / ink-soft, muted:** 본문 보조 설명과 날짜·고객·기한·메타 정보.
- **구분선 / line, line-strong, border-strong:** 정보 구획, 입력 테두리, 호버 등 더 또렷한 경계.
- **상태 회색 / state-soft:** 진행·대기·완료 등 비위험 상태의 배경. 역사적 CSS 변수 blue/green/amber는 작업 화면에서 중립색 별칭이며 실제 파랑·초록·황토색을 뜻하지 않는다.

**The Neutral Selection Rule.** 선택·완료·대기·Pro는 중립 명도와 문구·아이콘으로 구분하고, 체리색을 선택 강조나 업그레이드 판촉색으로 쓰지 않는다.

**The Attention Rule.** 주의 상태는 체리색에 문구·아이콘을 함께 붙인다. 색만으로 상태를 전달하지 않는다.

## Typography

작업 화면의 제목과 본문은 모두 Pretendard Variable 및 frontmatter의 한국어 대체 글꼴 스택을 사용한다. Paperlogy는 유지되는 마케팅 제목의 글꼴이며 작업 화면의 디스플레이 서체가 아니다.

### Hierarchy

- **Headline:** 일반 페이지와 Today 제목의 기준. Today는 휴대폰에서 (28px), 폼·상세의 기존 제목은 (34px)로 남아 있다. 모든 제목을 하나의 크기로 강제하지 않는다.
- **Title:** 섹션 제목. 굵기로 구획을 드러내되 장식용 대문자 라벨을 덧붙이지 않는다.
- **Body:** 기본 본문·입력 값의 기준. 작업 행 제목은 데스크톱 (16px, 600), 모바일 (15px, 600, 행간 1.5)로 정보를 촘촘하게 정렬한다.
- **Label:** 상태·기한·요약 메타의 기준. 고객·보조 설명은 (13–14px), 실제 제약 안내는 작은 글자로도 내용이 명확해야 한다.
- **Numbers:** 요약 수치·패키지 금액·프리뷰는 tabular-nums. Today 수치는 데스크톱 (20px, 650), 모바일 (23px)다.

**The Useful Label Rule.** 제목 위의 장식용 윗표제는 제거한다. “현재 브라우저에서만 검사”, “아직 준비 중인 기능”처럼 범위·한계를 알리는 문구와 폼의 실제 필드 라벨은 보존한다. 이들은 브랜딩용 kicker가 아니다.

## Layout

데스크톱은 고정 사이드바 (224px)와 가변 작업 본문으로 나뉜다. 본문은 최대 (1180px), 좌우 여백 (32px), 상단 여백 (36px)을 쓴다. Today의 주 영역과 보조 영역은 약 (1.7:1), 간격 (36px), 보조 영역 왼쪽 경계로 구분한다. 목록은 카드 중첩 대신 행과 여백으로 정리한다.

반응형은 단계적으로 바뀐다. (1180px) 이하에서는 Today가 한 열이 되고, (1050px) 이하에서는 사이드바가 아이콘 레일 (78px), 폼·상세가 한 열이 된다. (760px) 이하에서는 사이드바 대신 오늘/일감/새 일감/패키지/설정 5슬롯 하단 내비게이션을 사용한다. 모바일 본문 여백은 (24px 20px 108px), 새 일감은 고정 생성 바를 위해 아래 (192px)를 확보한다.

휴대폰 하단 내비게이션 높이는 (70px + safe-area-inset-bottom)이다. 생성·상세 행동 바는 그 위에 놓인다. 주요 터치 목표는 (44×44px) 이상을 유지한다. 모바일 일감은 축소된 표가 아니라 두 열의 목록이며 남은 수정 횟수를 계속 표시한다. 데스크톱 프리뷰는 모바일에서 숨기고 하단에 금액·할 일·기한·수정 한도를 요약한다.

## Elevation & Depth

기본 깊이는 흰 면, 중립색 면, 얇은 선으로 표현한다. Today 목록과 일감 표는 평면이며 주요 버튼·선택 패키지·작업 프리뷰에는 그림자를 붙이지 않는다. 실제 떠 있는 메뉴·알림에는 아래 vocabulary를 사용한다. 토스트와 하단 행동 바의 짙은 면은 공간적 구분이지 장식용 그림자가 아니다.

### Shadow Vocabulary

- **떠 있는 메뉴:** `0 10px 28px rgb(24 24 28 / 10%)` — 더보기·알림 팝오버의 공통 깊이.
- **키보드 포커스:** (2px) 잉크색 실선과 (2px) offset. 입력 포커스는 중립 테두리와 `0 0 0 2px rgb(36 36 38 / 10%)`를 함께 사용한다.

**The Flat Work Rule.** 목록·프리뷰·선택을 띄우기 위해 그림자를 늘리지 않는다. 선과 여백으로 구획하고 실제 오버레이에만 높이 차이를 준다.

상태 전환은 기반 CSS의 배경·테두리·그림자 (140–160ms ease)를 유지한다. 주요·위험 버튼은 누를 때 (1px) 내려간다. reduced-motion에서는 transition과 smooth scrolling을 끈다. 입장 애니메이션이나 장식용 반복 모션을 새 규칙으로 추가하지 않는다.

## Shapes

입력은 작은 모서리, 내비게이션은 단정한 모서리, 버튼·폼·설정 컨테이너는 더 부드러운 모서리를 쓴다. 정확한 공통 값은 rounded 토큰에 둔다. 상태 배지는 작은 모서리, 완료 체크의 시각 표시는 (24×24px, 7px 모서리)이며 실제 버튼은 더 크다.

모든 면을 둥근 카드로 감싸지 않는다. Today 구획과 일감 표·행, 상세 사실 요약 rail은 각진 구분선 구조다. 기존 선택지 (9px), 프리뷰 (14px), Pro pill처럼 목적이 있는 컴포넌트 변형도 존재하므로 공통 radius를 모든 요소에 강제하지 않는다.

## Components

### Buttons

단정한 흑연색 행동과 흰색 보조 행동. 기본 높이는 최소 (44px), primary/secondary 내부 좌우 여백은 frontmatter를 따른다. primary는 interactive 호버, primary-active 눌림과 (1px) 이동, 공통 focus-visible 실선을 갖는다. secondary는 중립색 배경 호버와 더 강한 테두리를 사용한다. disabled는 불투명도 (.52)와 금지 커서다. 모바일 짙은 생성 바 안의 primary만 흰색으로 반전한다.

### Chips

진행·완료·대기는 중립 배경과 각 상태의 문구·아이콘을 사용한다. 지연과 수정 초과만 urgent 배지다. Pro 배지는 중립색 면·잉크 글자·중립 테두리이며 주의 상태가 아니다. 상태 배지를 버튼인 것처럼 호버하거나 눌리게 만들지 않는다.

### Cards / Containers

설정·폼 등의 실제 구획은 흰색, 얇은 line 테두리, control 모서리를 쓴다. 폼 구획 내부는 데스크톱 (20px), 모바일 (16px)다. Today 목록 구획은 테두리·배경·모서리를 제거하고 행 사이 선으로 구분한다. 프리뷰는 canvas와 잉크 글자, 그림자 없는 보조 면이다.

### Inputs / Fields

흰 바탕과 line-strong 테두리, field 모서리. 일반 작업 입력 값은 (16px)와 최소 (44px) 높이다. 아이콘 입력은 (46px) 높이, 왼쪽 (41px) 여백을 확보한다. 검색·일감 범위 선택기는 canvas 배경이다. 범위 선택기는 데스크톱 최대 (430px), 모바일 전체 너비·최소 (48px) 높이와 (16px) 글자다. 오류를 색만으로 전달하지 않는다.

### Navigation

사이드바는 canvas, 기본 항목은 muted, 선택 항목은 더 짙은 중립 배경·잉크·(650) 두께다. 선택 항목에 색 띠나 그림자를 붙이지 않는다. 모바일 내비게이션은 흰 바탕, 활성 잉크와 굵어진 SVG 선으로 위치를 알리며 새 일감 슬롯도 같은 안정된 높이로 정렬한다.

### Task Rows

체크 / 고객·일감·기한 / 빠른 행동이 정렬된 제작 목록이다. 행 높이는 데스크톱 최소 (90px), 모바일 (100px). 긴 메타는 모바일에서 줄바꿈하고 빠른 행동은 세로로 쌓는다. 긴급 행 전체에 그라데이션을 칠하지 않고 기한·상태의 주의 신호를 사용한다. 빈 상태에는 실제 다음 행동을 안내하며 운영 고객처럼 보이는 가짜 행을 넣지 않는다.

## Do's and Don'ts

### Do:

- **Do** 작업 화면에만 이 토큰을 적용하고 마케팅·공개 폼의 기존 경계를 보존한다.
- **Do** 선택·완료·대기·Pro를 중립 명도와 문구·아이콘으로 구분한다.
- **Do** 실제 제약·미지원·저장 상태 안내와 필드 라벨을 읽을 수 있게 남긴다.
- **Do** 모바일 고정 바와 safe area를 계산하고 마지막 항목까지 접근할 여백을 확보한다.
- **Do** 키보드 포커스, reduced-motion, 최소 터치 목표를 유지한다.

### Don't:

- **Don't** 작업 화면에 파랑·초록·베이지 중심 색이나 전형적인 AI SaaS 장식을 다시 도입한다.
- **Don't** 체리색을 선택·완료·Pro 판촉색으로 쓰거나 상태를 색만으로 전달한다.
- **Don't** 장식용 윗표제, 유리 효과, 과한 그라데이션, 목적 없는 KPI 차트와 카드 반복을 추가한다.
- **Don't** 모바일에서 데스크톱 표를 축소하거나 수정 잔여 정보를 숨긴다.
- **Don't** 새 일감 저장 뒤 별도 Todo 생성 단계를 추가하거나 빈 작업대에 가짜 운영 일감을 넣는다.
