# 학생 작품 쌍대비교 연구 · 독립 프로토타입

이 폴더는 기존 수업 앱과 연결되지 않은 검토용 작업 공간입니다. `src-app.jsx`, `src-fb.js`, `firestore.rules`, 기존 설문·앵커 모듈, `public/app.js`를 import하거나 실행 중에 수정하지 않습니다.

따라서 이 폴더의 파일을 추가·삭제해도 기존 앱의 빌드와 실행 경로는 달라지지 않습니다. 이번 전역 용어 정리로 기존 앱의 사용자 표시 문구도 `작품 캡션`으로 갱신했지만, 연구 프로토타입을 기존 앱에 연결한 것은 아닙니다.

## 들어 있는 파일

- `research-design.md`: 연구 질문, 사전설문 20문항, 12회 정보량·신뢰도 기준, 전후 자기평가, 쌍대비교, 사후 AI다움 인상, 로그·분석·윤리 설계
- `research-spec.mjs`: 문항 정의, 자기평가 규격, 비교정보량 계산, 학급 전체 쌍 배정, 역순 반복, 맥락조건 고정, 점수화·검증 함수
- `research-spec.test.mjs`: 자기 작품 제외, 정확한 시행 수, 정보량, 자기평가, 좌우·작품별 조건균형, 반복 간격, 결정론 등을 검사하는 Node 회귀테스트
- `rating-assignment.mjs`, `rating-assignment.test.mjs`: 사후 이미지 인상 평정을 학생·작품·조건별로 균형화하고 검증하는 독립 모듈과 회귀테스트
- `prototype.mjs`: 기존 앱·Firebase와 무관한 학생 화면 프로토타입
- `prototype.e2e.mjs`: 전체 6단계 흐름, 자기평가 잠금, 모바일 두 작품 확인, 키보드 조작 브라우저 검사
- `capture-screenshots.mjs`: 검토용 데스크톱·모바일 화면 이미지 재생성
- `prototype.css`: 프로토타입 전용 스타일
- `prototype.bundle.js`: 브라우저에서 바로 열기 위한 생성 파일
- `index.html`: 독립 프로토타입 시작 화면
- `publish.mjs`, `firebase.json`: 공개 파일 3개만 별도 Hosting 사이트에 배포하기 위한 준비 스크립트와 설정
- `prototype-desktop.png`, `prototype-mobile.png`: 사전설문 데스크톱·좁은 화면 점검
- `self-before.png`, `self-after.png`, `self-reason.png`: 두 자기평가와 현재 점수 잠금 뒤 사유 화면 점검
- `pair-desktop.png`, `pair-mobile.png`: 쌍대비교 데스크톱·좁은 화면 점검
- `ai-rating.png`: 사후 이미지 인상 평가 화면 점검

## 확인 방법

`index.html`을 브라우저로 열면 됩니다. URL에 검토할 단계를 붙일 수도 있습니다.

```text
index.html?stage=pre
index.html?stage=selfBefore
index.html?stage=intro
index.html?stage=pair
index.html?stage=selfAfter
index.html?stage=aiIntro
index.html?stage=ai
index.html?stage=done
```

상단의 `검토 도구`는 프로토타입에만 있습니다. 실제 학생 화면에서는 제거합니다.

응답은 Firebase가 아니라 브라우저의 다음 전용 키에만 저장됩니다.

```text
museum.pairwiseResearch.prototype.r3
```

따라서 기존 앱의 저장 자료와 섞이지 않습니다.

## 검증 명령

```powershell
node --test pairwise-research/research-spec.test.mjs
node --test pairwise-research/rating-assignment.test.mjs
node pairwise-research/prototype.e2e.mjs
```

프로토타입 소스를 고친 뒤 브라우저 번들을 갱신할 때만 다음 명령을 실행합니다.

```powershell
npx esbuild pairwise-research/prototype.mjs --bundle --format=iife --target=es2020 --outfile=pairwise-research/prototype.bundle.js
```

공개 검토용 배포 폴더에는 HTML·CSS·브라우저 번들만 복사합니다.

```powershell
node pairwise-research/publish.mjs
npx firebase-tools deploy --only hosting:artmuseum --project class-9f074 --config pairwise-research/firebase.json
```

현재 학생 화면의 기본값은 `본 비교 11회 + 학생에게 알리지 않는 역순 반복 1회 = 총 12화면`입니다. 작품 24점·평가자 24명이 모두 끝내면 본 판정 264건, 작품당 평균 본 비교 22회가 됩니다. 12회는 자동으로 높은 신뢰도를 보장하지 않으며, 실제 자료의 SSR·평가자분할 SHR·그래프 연결성·신뢰구간으로 최종 판정합니다.

회귀검사는 기본 12화면 설계와 본 비교 12회 대안의 100개 seed에서 다음을 확인합니다.

- 기본값에서 학생별 본 비교 정확히 11회, 역순 반복 1회, 총 12화면
- 원본과 반복 사이에 다른 화면 최소 3개
- 반복을 포함한 작품별 좌우 노출 차이 최대 1
- 반복을 포함한 학생별·학급 전체 맥락조건 차이 최대 1
- 작품별 이미지 단독·캡션 포함 본 비교 노출의 균형
- 사후 6작품 평정의 학생별 3/3, 작품별 6회·조건별 3/3 균형
- 자기 작품 제외, 무순서쌍 중복 방지, 연결된 비교 그래프
- 요청 시행 수를 만들 수 없는 명단의 즉시 중단
- 두 작품 이미지가 모두 관찰되기 전 선택 차단과 차단 이벤트 기록

브라우저 자동 점검에서는 사전설문 20문항 → 자기평가① 5문항·근거 → 쌍대비교 12화면 → 자기평가② 5문항·현재 근거 잠금 → 변경·유지 사유 → 사후 이미지 인상 6점 → 완료 화면의 전체 흐름과 키보드 라디오 조작을 확인합니다.

## 현재 범위와 다음 단계

현재 공개본은 연구 설계와 상호작용 검토용 데모입니다. 브라우저 `localStorage`에만 저장하므로 여러 학생의 응답을 중앙에서 수집할 수 없고, 실제 연구 자료수집 주소로 사용해서는 안 됩니다. 다음 항목은 의도적으로 구현하지 않았습니다.

- 기존 학생 계정·학급 명단 연결
- 실제 작품 이미지 복사·익명화
- Firebase 저장·보안 규칙
- 교사 공개 스위치·결과 집계·CSV
- 기존 설문 또는 앵커 자료 마이그레이션
- 작품 순위나 성적 반영

최종 문항과 흐름을 확인한 뒤 별도 승인하에 기존 앱 연결 작업을 진행해야 합니다. 그때도 이 독립 규격을 기준으로 작은 연결 패치만 작성하는 것이 안전합니다.
