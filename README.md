# 허구의 아카이브 — 창작 과정 기록실

고등학교 1학년 미술 8차시 단원 「실재한 적 없는 유물 이미지로 구성한 허구의 아카이브 전시」의 수업 자료와 학생 기록지, 교사 대시보드를 담은 웹 애플리케이션입니다.

- 학생: 학번 + 별명 + 숫자 4자리로 입장, 강의 노트와 학습지 작성, 자동 저장
- 교사: 관리자 코드로 입장, 차시별 공개 설정, 진행 현황, 기록 열람, 차시별 살펴본 시간, 루브릭 채점, 창의성 6축 대시보드(유창성·융통성·독창성·정교성·과정·멀티모달), CSV 내보내기
- 전시장: 공개로 설정된 작품을 작품 번호로 관람 (1차 관람은 명제표 가림)

## 1. Firebase 콘솔에서 먼저 켤 것 (한 번만)

1. https://console.firebase.google.com 에서 `class-9f074` 프로젝트를 엽니다.
2. **빌드 → Authentication → 시작하기 → 로그인 방법**에서 **이메일/비밀번호**를 사용 설정합니다.
   학생 계정은 `학번@museum.class`, 교사 계정은 `teacher@museum.class` 형식으로 자동 생성됩니다.
3. **빌드 → Firestore Database → 데이터베이스 만들기**를 누르고 위치를 `asia-northeast3`(서울)로 선택합니다.
   보안 규칙은 아래 배포 명령으로 덮어쓰므로 어느 모드로 시작해도 됩니다.

## 2. 배포

```bash
npm install -g firebase-tools     # 최초 1회
firebase login                    # 브라우저 인증
firebase deploy --only firestore:rules,hosting
```

배포가 끝나면 아래 주소로 열립니다.

- https://class-9f074.web.app
- https://class-9f074.firebaseapp.com

## 3. GitHub에 올리기

```bash
git init
git remote add origin https://github.com/miran-artcode/museum.git
git add .
git commit -m "허구의 아카이브 학급 기록실"
git branch -M main
git push -u origin main
```

## 4. 처음 사용할 때

1. 배포된 주소에서 **교사** 탭을 누르고 6자리 이상 관리자 코드를 입력합니다. 이때 입력한 코드가 이 학급의 관리자 코드가 됩니다.
2. **차시 공개** 탭에서 수업할 차시를 엽니다. 기본값은 1차시만 열린 상태입니다.
3. 학생에게 주소를 알려 줍니다. 학생은 학번·별명·숫자 4자리로 입장합니다.

## 5. 파일 구성

```
public/index.html      화면 뼈대
public/app.js          앱 번들 (React + Firebase)
src-app.jsx            앱 소스
src-fb.js              Firebase 연결 계층
firebase.json          호스팅·규칙 설정
firestore.rules        접근 권한 규칙
.firebaserc            프로젝트 지정
```

소스를 고친 뒤에는 다시 번들해야 합니다.

```bash
npm install
npx esbuild src-app.jsx --bundle --jsx=automatic --loader:.jsx=jsx --minify --format=iife --outfile=public/app.js
```

## 6. 데이터 구조

| 컬렉션 | 문서 | 내용 | 접근 |
|---|---|---|---|
| `meta` | `config` | 차시 공개 설정 | 읽기: 로그인 사용자 / 쓰기: 교사 |
| `students` | 학번 | 별명 | 읽기: 로그인 사용자 / 쓰기: 본인·교사 |
| `worksheets` | 학번 | 기록지 전체, 수정 이력 | 본인과 교사만 |
| `grades` | 학번 | 루브릭·관찰·피드백 | 읽기: 본인·교사 / 쓰기: 교사 |
| `media` | 학번_필드_시각 | 사진·음성·스케치·짧은 영상 (base64, 문서당 1MB 한도) | 쓰기: 본인만 |

## 7. 운영에서 지킬 것

- 별명에 실명을 쓰지 않습니다. 얼굴 사진과 개인정보는 어디에도 입력하지 않습니다.
- 관찰 사진·전시 영상은 사람의 얼굴이, 현장 소리는 사람의 목소리가 담기지 않게 찍고 녹음하도록 안내합니다.
- 확정 성적은 학교 시스템에 별도로 입력하고, 이 앱은 수업 기록과 채점 보조 용도로 씁니다.
- 학생이 비밀번호를 잊으면 Firebase 콘솔 Authentication 목록에서 해당 학번 계정을 삭제합니다. 같은 학번으로 다시 입장하면 새 비밀번호로 등록되고 기록은 학번에 남아 이어집니다.
- Firestore 무료 한도는 하루 읽기 5만 건, 쓰기 2만 건입니다. 한 학급 25명 기준으로 여유가 있습니다.
