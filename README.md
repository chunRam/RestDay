<p align="center">
  <img src="assets/icon.png" alt="RestDay Logo" width="120" />
</p>

<h1 align="center">RestDay</h1>

<p align="center">
  <strong>휴일을 의미 있게 보내도록 돕는 휴일 의사결정 앱</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Expo-56-blue?logo=expo" alt="Expo SDK 56" />
  <img src="https://img.shields.io/badge/React_Native-0.85-61DAFB?logo=react" alt="React Native" />
  <img src="https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Firebase-12-FFCA28?logo=firebase" alt="Firebase" />
  <img src="https://img.shields.io/badge/Gemini_AI-1.5_Flash-8E75B2?logo=google" alt="Gemini AI" />
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License" />
</p>

---

## 📌 프로젝트 소개

**RestDay**는 휴일을 아무 생각 없이 흘려보내지 않도록, 사용자가 **휴일 전에 자신의 상태와 의도를 파악**하고 **실행 가능한 하루 계획**으로 옮기게 돕는 **휴일 의사결정 앱**입니다.

> 💡 RestDay의 핵심은 "많은 기능"이 아니라, **휴일 전에 결정을 내리고 실행하게 만드는 흐름**에 있습니다.

### 해결하는 문제

현대인에게 휴일은 회복과 재정비를 위한 시간이지만, 실제로는 무엇을 해야 할지 정하지 못해 **무의미하게 시간을 보내고 후회하는 경우**가 많습니다. RestDay는 이 문제를 **사전 의사결정 흐름**으로 해결합니다.

---

## 🔄 핵심 사용자 흐름

```
로그인 → 홈(대시보드) → 휴일 등록 → 의사결정 → AI 계획 생성 → 실행 체크 → 회고
```

| 단계 | 화면 | 설명 |
|:---:|:---:|:---|
| 1 | **Login / Signup** | Google OAuth 또는 이메일 기반 회원가입·로그인 |
| 2 | **Home** | 대시보드 — 다가오는 휴일 D-Day, Google 캘린더 연동 일정, 빠른 액션 |
| 3 | **Register** | 휴일 날짜 등록 (캘린더 UI) 및 일정 직접 추가 |
| 4 | **Decision** | 에너지 수준, 원하는 분위기, 사회적 모드, 강도 등 4단계 질문 응답 |
| 5 | **PlanPreview** | Gemini AI 기반 맞춤 하루 계획 생성 및 미리보기 |
| 6 | **Execution** | 생성된 계획의 체크리스트 실행 및 진행률 추적 |
| 7 | **Review** | 만족도 평가 및 한 줄 회고 기록 |
| 8 | **History** | 과거 휴일 기록 열람 및 상세 보기 |
| 9 | **Settings** | 계정 설정 및 Google 캘린더 연동 관리 |

---

## 🏗️ 기술 스택

| 영역 | 기술 |
|:---|:---|
| **프레임워크** | [Expo SDK 56](https://docs.expo.dev/versions/v56.0.0/) + React Native 0.85 |
| **언어** | TypeScript 6.0 |
| **상태관리** | [Zustand](https://github.com/pmndrs/zustand) 5 |
| **네비게이션** | React Navigation 7 (Native Stack) |
| **인증** | Firebase Auth (Google OAuth + 이메일/비밀번호) |
| **데이터베이스** | Cloud Firestore |
| **AI 추천** | Google Gemini 1.5 Flash (Vercel Serverless Function 프록시) |
| **캘린더 연동** | expo-calendar + Google Calendar API |
| **호스팅** | Firebase Hosting (Web) + Vercel (API 프록시) |

---

## 📁 프로젝트 구조

```
RestDay/
├── App.tsx                     # 앱 진입점 (NavigationContainer + AuthProvider)
├── index.ts                    # Expo 엔트리 포인트
├── app.json                    # Expo 프로젝트 설정
├── package.json                # 의존성 및 스크립트 정의
├── tsconfig.json               # TypeScript 설정
├── firebase.json               # Firebase Hosting 배포 설정
├── vercel.json                 # Vercel Serverless Function 설정
│
├── api/
│   └── gemini-recommendation.js   # Gemini AI 프록시 (Vercel Function)
│
├── src/
│   ├── components/
│   │   └── CalendarPicker.tsx      # 캘린더 날짜 선택 컴포넌트
│   │
│   ├── firebase/
│   │   └── config.ts              # Firebase 초기화 (환경변수 기반)
│   │
│   ├── hooks/
│   │   ├── useCalendar.ts             # 디바이스 캘린더 접근 훅
│   │   └── useGoogleCalendarAuth.ts   # Google Calendar OAuth 훅
│   │
│   ├── navigation/
│   │   └── AppNavigator.tsx       # 인증 상태 기반 스택 네비게이터
│   │
│   ├── screens/
│   │   ├── LoginView.tsx          # 로그인 화면
│   │   ├── SignupView.tsx         # 회원가입 화면
│   │   ├── HomeView.tsx           # 메인 대시보드
│   │   ├── RegisterView.tsx       # 휴일/일정 등록
│   │   ├── DecisionView.tsx       # 휴일 의사결정 질문
│   │   ├── PlanPreviewView.tsx    # AI 추천 계획 미리보기
│   │   ├── ExecutionView.tsx      # 계획 실행 체크리스트
│   │   ├── ReviewView.tsx         # 휴일 회고
│   │   ├── HistoryView.tsx        # 과거 기록 목록
│   │   ├── HistoryDetailView.tsx  # 기록 상세 보기
│   │   ├── SettingsView.tsx       # 설정
│   │   └── DevLogsView.tsx        # 개발 로그 (디버깅용)
│   │
│   ├── services/
│   │   └── geminiRecommendation.ts    # Gemini AI 추천 서비스 로직
│   │
│   ├── store/
│   │   ├── useAppStore.ts             # 앱 전역 상태 (Zustand)
│   │   ├── useAuthStore.ts            # 인증 상태 관리
│   │   └── useGoogleCalendarStore.ts  # Google 캘린더 상태
│   │
│   ├── theme/
│   │   └── theme.ts               # 디자인 토큰 (색상, 그림자)
│   │
│   └── utils/
│       ├── googleAuth.ts          # Google OAuth 유틸리티
│       ├── holidayDates.ts        # 공휴일 날짜 계산
│       ├── homeDashboard.ts       # 홈 대시보드 데이터 가공
│       ├── logger.ts              # 앱 내 로거
│       └── planGenerator.ts       # 규칙 기반 계획 생성 엔진
│
├── assets/                    # 앱 아이콘, 스플래시 이미지
├── docs/                      # 제품 방향 문서, UI 프로토타입
└── scripts/
    └── verify-firebase-deploy-config.js   # 배포 전 설정 검증 스크립트
```

---

## 🚀 실행 방법

### 사전 요구사항

- **Node.js** 18 이상
- **npm** 또는 **yarn**
- **Expo CLI** (전역 설치 불필요, npx 사용)

### 1. 저장소 클론

```bash
git clone https://github.com/chunRam/RestDay.git
cd RestDay
```

### 2. 의존성 설치

```bash
npm install
```

### 3. 환경변수 설정

```bash
cp .env.example .env.local
```

`.env.local` 파일을 열어 Firebase 및 Google OAuth 클라이언트 ID를 입력합니다.

| 환경변수 | 설명 |
|:---|:---|
| `EXPO_PUBLIC_FIREBASE_API_KEY` | Firebase 웹 API 키 |
| `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase 인증 도메인 |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID` | Firebase 프로젝트 ID |
| `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase Storage 버킷 |
| `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | FCM 발신자 ID |
| `EXPO_PUBLIC_FIREBASE_APP_ID` | Firebase 앱 ID |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Google OAuth 웹 클라이언트 ID |
| `EXPO_PUBLIC_GOOGLE_WEB_REDIRECT_URI` | OAuth 리다이렉트 URI |
| `EXPO_PUBLIC_GEMINI_PROXY_URL` | Gemini AI 프록시 URL |

### 4. 앱 실행

```bash
# 개발 서버 시작 (모든 플랫폼)
npm start

# 특정 플랫폼
npm run web       # 웹 브라우저
npm run ios       # iOS 시뮬레이터
npm run android   # Android 에뮬레이터
```

---

## 🤖 AI 추천 시스템

RestDay는 사용자의 의사결정 답변을 기반으로 **Gemini 1.5 Flash**가 맞춤 휴일 계획을 생성합니다.

```
사용자 답변 → Vercel Serverless Proxy → Gemini API → 맞춤 계획 반환
```

- API 키는 **Vercel 환경변수**(`GEMINI_API_KEY`)로만 관리되어 클라이언트에 노출되지 않습니다.
- Gemini 호출 실패 시 **규칙 기반 추천 엔진**으로 자동 폴백합니다.

| 추천 출처 | 설명 |
|:---|:---|
| `gemini` | Gemini AI 추천 성공 |
| `rule_based` | Gemini 미설정 또는 실패 → 규칙 기반 추천 |
| `gemini_retry_then_rule_based` | 재시도 후에도 실패 → 규칙 기반 추천 |

---

## 🌐 배포

### Firebase Hosting (웹 앱)

```bash
npm run deploy
```

이 명령은 다음을 순차적으로 실행합니다:
1. 배포 설정 검증 (`scripts/verify-firebase-deploy-config.js`)
2. Expo 웹 빌드 (`expo export --platform web`)
3. Firebase Hosting 배포

### Vercel (AI 프록시)

`api/gemini-recommendation.js`는 Vercel에 배포되는 Serverless Function입니다.  
Vercel 프로젝트에 `GEMINI_API_KEY` 환경변수를 설정해야 합니다.

---

## 📄 라이선스

이 프로젝트는 [MIT License](LICENSE) 하에 배포됩니다.
