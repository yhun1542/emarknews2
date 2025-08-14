# Fullstack Scaffold (Next.js + Express, TypeScript)

## 구조
- `frontend/` — Next.js (TypeScript), API 프록시 설정 포함
- `backend/`  — Express (TypeScript), /health 및 샘플 API
- `imports/`  — 채팅에서 추출한 코드(phase2) 원본 분류본 (프론트/백/설정)

## 빠른 실행
### 1) 개발 모드
```bash
# 1) 루트에서 공통 env 생성
cp .env.example .env

# 2) 백엔드
cd backend
npm i
npm run dev

# 3) 프런트엔드 (새 터미널)
cd ../frontend
npm i
npm run dev
```
- Frontend: http://localhost:3000
- Backend:  http://localhost:4000

### 2) Docker (선택)
```bash
docker compose up --build
```
- http://localhost:3000 (프런트)
- http://localhost:4000 (백엔드)

## 배포 팁
- Railway/Render/Heroku: 각각의 서비스로 `frontend`, `backend` 디렉터리를 별도 서비스로 올리면 됩니다.
- 프런트는 `NEXT_PUBLIC_API_BASE`를 배포된 백엔드 URL로 바꾸세요.
- 백엔드는 `PORT`를 플랫폼 지정 포트 환경변수(process.env.PORT) 우선 사용하도록 이미 설정되어 있습니다.
