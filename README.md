# EmarkNews - AI 기반 글로벌 뉴스 포털

AI 기술을 활용한 고급 뉴스 수집 및 분석 시스템으로, 전 세계 뉴스를 실시간으로 수집하고 한국어로 제공하는 웹 포털입니다.

## 🌟 주요 기능

- **다중 소스 뉴스 수집**: News API, YouTube API, RSS 피드
- **AI 기반 분석**: Skywork AI + OpenAI 폴백 시스템
- **고급 뉴스 선별**: 품질 점수, 중복 제거, 트렌딩 분석
- **반응형 웹 UI**: 세계뉴스, 한국뉴스, 일본뉴스 섹션
- **실시간 업데이트**: 10분마다 자동 뉴스 갱신
- **다크모드 지원**: 사용자 친화적인 UI/UX

## 🚀 배포

이 프로젝트는 Railway에 배포되어 있습니다.

### 환경 변수

다음 환경 변수들이 필요합니다:

```env
SKYWORK_API_KEY=your_skywork_api_key
OPENAI_API_KEY=your_openai_api_key
NEWS_API_KEY=your_news_api_key
YOUTUBE_API_KEY=your_youtube_api_key
NODE_ENV=production
MAX_ARTICLES_PER_SECTION=5
QUALITY_THRESHOLD=10
DUPLICATE_THRESHOLD=0.7
CACHE_EXPIRY_MINUTES=10
```

## 🛠️ 기술 스택

- **Backend**: Node.js (순수 Node.js, Express 없음)
- **Frontend**: HTML + Tailwind CSS + DaisyUI + JavaScript
- **APIs**: News API, YouTube Data API v3, Skywork AI, OpenAI
- **배포**: Railway

## 📁 프로젝트 구조

```
emarknews/
├── server.js                 # 메인 서버 파일
├── advanced-news-system.js   # 뉴스 수집 및 AI 분석 시스템
├── public/
│   └── index.html            # 프론트엔드 UI
├── package.json              # 의존성 및 스크립트
├── .gitignore               # Git 무시 파일
└── README.md                # 프로젝트 문서
```

## 🔧 로컬 개발

1. 저장소 클론:
```bash
git clone https://github.com/yhun1542/emarknews.git
cd emarknews
```

2. 의존성 설치:
```bash
npm install
```

3. 환경 변수 설정:
`.env` 파일을 생성하고 필요한 API 키들을 설정합니다.

4. 서버 실행:
```bash
npm start
```

5. 브라우저에서 `http://localhost:3000` 접속

## 📊 API 엔드포인트

- `GET /`: 메인 페이지
- `GET /api/news`: 뉴스 데이터 조회
- `GET /api/news?status=true`: 시스템 상태 확인
- `POST /api/news`: 수동 뉴스 업데이트

## 🤖 AI 분석 기능

- **품질 점수**: 제목 길이, 내용 길이, 이미지 존재, 소스 신뢰도, 최신성 기반
- **중복 제거**: Jaccard 유사도 알고리즘 사용
- **트렌딩 분석**: 키워드 빈도 분석으로 인기 주제 추출
- **카테고리 분류**: 정치, 경제, 기술, 스포츠, 국제 등 자동 분류

## 📈 성능 최적화

- **캐싱 시스템**: 메모리 기반 캐싱으로 API 호출 최소화
- **비동기 처리**: Promise.all을 활용한 병렬 데이터 수집
- **에러 핸들링**: 견고한 에러 처리 및 폴백 시스템

## 📄 라이선스

MIT License

## 👥 기여

이슈 리포트나 풀 리퀘스트를 환영합니다!

## 📞 지원

문제가 있으시면 GitHub Issues를 통해 문의해주세요.

# Force rebuild Sun Aug 10 08:16:53 EDT 2025
# Force rebuild premium v3.0 Sun Aug 10 08:45:55 EDT 2025
