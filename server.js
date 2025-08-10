const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// 캐시 무력화를 위한 버전 정보
const CACHE_VERSION = Date.now(); // 현재 시간을 버전으로 사용
const APP_VERSION = "premium-3.0.1-cache-busting";

// 캐시 무력화 미들웨어
app.use((req, res, next) => {
    // 정적 파일에 대한 캐시 무력화 헤더 설정
    if (req.path.match(/\.(css|js|png|jpg|jpeg|gif|ico|svg)$/)) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('ETag', `"${CACHE_VERSION}"`);
    }
    next();
});

// 미들웨어
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 요청 로깅
app.use((req, res, next) => {
    console.log(`📝 ${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// 환경 변수 확인
console.log('🔧 환경 변수 확인:');
console.log('- NEWS_API_KEY:', process.env.NEWS_API_KEY ? '✅ 설정됨' : '❌ 없음');
console.log('- OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '✅ 설정됨' : '❌ 없음');
console.log('- YOUTUBE_API_KEY:', process.env.YOUTUBE_API_KEY ? '✅ 설정됨' : '❌ 없음');
console.log('- SKYWORK_API_KEY:', process.env.SKYWORK_API_KEY ? '✅ 설정됨' : '❌ 없음');

// 프리미엄 뉴스 시스템 로드
const PremiumMultiAPINewsSystem = require('./advanced-news-system');

// 뉴스 시스템 초기화
const newsSystem = new PremiumMultiAPINewsSystem();

// API 라우트
app.get('/api/news', async (req, res) => {
    console.log('📡 /api/news 요청 받음');
    
    try {
        // 캐시 무력화 헤더 설정
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('ETag', `"${CACHE_VERSION}"`);
        
        // 타임아웃 설정 (10초)
        const timeout = setTimeout(() => {
            console.log('⏰ API 응답 타임아웃');
            if (!res.headersSent) {
                res.status(408).json({ error: '요청 시간 초과' });
            }
        }, 10000);

        const newsData = await newsSystem.collectAllNews();
        
        clearTimeout(timeout);
        
        if (!res.headersSent) {
            console.log('✅ 프리미엄 뉴스 데이터 응답 전송');
            res.json(newsData);
        }

    } catch (error) {
        console.error('❌ API 오류:', error);
        if (!res.headersSent) {
            res.status(500).json({ 
                error: '서버 오류',
                message: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }
});

// 수동 업데이트
app.post('/api/news', async (req, res) => {
    console.log('🔄 수동 업데이트 요청');
    
    try {
        // 캐시 무력화 헤더 설정
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('ETag', `"${CACHE_VERSION}"`);
        
        // 캐시 클리어
        newsSystem.clearCache();
        console.log('🗑️ 프리미엄 캐시 클리어 완료');
        
        const newsData = await newsSystem.collectAllNews();
        
        res.json({
            success: true,
            message: '프리미엄 업데이트 완료',
            data: newsData,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ 수동 업데이트 오류:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// 상태 확인
app.get('/api/status', (req, res) => {
    console.log('📊 상태 확인 요청');
    
    res.json({
        status: 'running',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        environment: process.env.NODE_ENV || 'production',
        version: APP_VERSION,
        cacheVersion: CACHE_VERSION,
        systemStatus: newsSystem.getSystemStatus()
    });
});

// 메인 페이지
app.get('/', (req, res) => {
    console.log('🏠 메인 페이지 요청');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404 처리
app.use((req, res) => {
    console.log(`❌ 404: ${req.path}`);
    res.status(404).json({ 
        error: '페이지를 찾을 수 없습니다',
        path: req.path,
        timestamp: new Date().toISOString()
    });
});

// 에러 처리
app.use((error, req, res, next) => {
    console.error('💥 서버 에러:', error);
    res.status(500).json({ 
        error: '서버 내부 오류',
        message: error.message,
        timestamp: new Date().toISOString()
    });
});

// 서버 시작
app.listen(PORT, () => {
    console.log('🚀 EmarkNews 프리미엄 v3.0.1 서버 시작');
    console.log(`📡 포트: ${PORT}`);
    console.log(`🌐 URL: http://localhost:${PORT}`);
    console.log(`🔧 캐시 무력화 버전: ${CACHE_VERSION}`);
    console.log('✨ 프리미엄 다중 API + AI 번역 + 캐시 무력화 활성화');
    
    // 초기 뉴스 수집
    setTimeout(() => {
        console.log('🔄 프리미엄 뉴스 수집 시작...');
        newsSystem.collectAllNews().then(() => {
            console.log('✅ 프리미엄 뉴스 수집 완료');
        }).catch(error => {
            console.error('❌ 프리미엄 뉴스 수집 실패:', error);
        });
    }, 1000);
});

// 프로세스 종료 처리
process.on('SIGTERM', () => {
    console.log('🛑 서버 종료 신호 받음');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🛑 서버 종료 신호 받음');
    process.exit(0);
});

// 처리되지 않은 예외 처리
process.on('uncaughtException', (error) => {
    console.error('💥 처리되지 않은 예외:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 처리되지 않은 Promise 거부:', reason);
    console.error('Promise:', promise);
});

