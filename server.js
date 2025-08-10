const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

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

// 간단한 뉴스 시스템 (디버깅용)
class SimpleNewsSystem {
    constructor() {
        this.cache = new Map();
        console.log('🚀 SimpleNewsSystem 초기화 완료');
    }

    // 기본 HTTP 요청 (짧은 타임아웃)
    async makeRequest(url, timeout = 3000) {
        console.log(`🌐 API 요청: ${url}`);
        
        return new Promise((resolve, reject) => {
            const https = require('https');
            const http = require('http');
            const protocol = url.startsWith('https:') ? https : http;
            
            const timer = setTimeout(() => {
                console.log(`⏰ 타임아웃: ${url}`);
                reject(new Error('타임아웃'));
            }, timeout);
            
            const req = protocol.get(url, {
                headers: {
                    'User-Agent': 'EmarkNews/Debug',
                    'Accept': 'application/json'
                }
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    clearTimeout(timer);
                    try {
                        const result = JSON.parse(data);
                        console.log(`✅ API 응답 성공: ${url}`);
                        resolve(result);
                    } catch (error) {
                        console.log(`❌ JSON 파싱 오류: ${url}`);
                        reject(error);
                    }
                });
            });
            
            req.on('error', (error) => {
                clearTimeout(timer);
                console.log(`❌ 요청 오류: ${url} - ${error.message}`);
                reject(error);
            });
        });
    }

    // News API 테스트
    async testNewsAPI() {
        const apiKey = process.env.NEWS_API_KEY;
        if (!apiKey) {
            console.log('❌ News API 키 없음');
            return [];
        }

        try {
            console.log('📰 News API 테스트 시작...');
            const url = `https://newsapi.org/v2/top-headlines?country=us&pageSize=5&apiKey=${apiKey}`;
            const data = await this.makeRequest(url, 5000);
            
            if (data.status === 'error') {
                console.log('❌ News API 오류:', data.message);
                return [];
            }
            
            console.log(`✅ News API 성공: ${data.articles?.length || 0}개 기사`);
            return data.articles || [];
            
        } catch (error) {
            console.log('❌ News API 실패:', error.message);
            return [];
        }
    }

    // 기본 데이터 생성
    createDefaultData() {
        console.log('🔧 기본 데이터 생성 중...');
        
        const now = new Date().toISOString();
        const defaultArticle = {
            id: 'debug-1',
            title: 'EmarkNews 디버깅 모드 활성화',
            description: '시스템이 디버깅 모드로 실행 중입니다. API 연결을 테스트하고 있습니다.',
            url: '#',
            image: null,
            publishedAt: now,
            source: 'EmarkNews Debug',
            category: '시스템',
            urgency: 3,
            importance: 3,
            buzz: 3,
            stars: 3,
            keywords: ['디버깅', '테스트'],
            sentiment: '중립'
        };

        return {
            sections: {
                world: [defaultArticle],
                korea: [{ ...defaultArticle, id: 'debug-2', title: '한국 뉴스 디버깅 중' }],
                japan: [{ ...defaultArticle, id: 'debug-3', title: '일본 뉴스 디버깅 중' }]
            },
            trending: [['디버깅', 5], ['테스트', 3], ['시스템', 2]],
            lastUpdated: now,
            totalArticles: 3,
            systemStatus: {
                cacheSize: 0,
                lastUpdate: now,
                apiKeys: {
                    newsApi: !!process.env.NEWS_API_KEY,
                    skyworkAi: !!process.env.SKYWORK_API_KEY,
                    openAi: !!process.env.OPENAI_API_KEY,
                    youtubeApi: !!process.env.YOUTUBE_API_KEY
                },
                environment: process.env.NODE_ENV || 'debug',
                version: 'debug-1.0.0'
            }
        };
    }

    // 뉴스 수집 (안전한 버전)
    async collectNews() {
        console.log('🔄 안전한 뉴스 수집 시작...');
        
        const startTime = Date.now();
        
        try {
            // 캐시 확인
            if (this.cache.has('news')) {
                const cached = this.cache.get('news');
                if (Date.now() - cached.timestamp < 5 * 60 * 1000) { // 5분 캐시
                    console.log('📦 캐시된 데이터 사용');
                    return cached.data;
                }
            }

            // News API 테스트
            const articles = await this.testNewsAPI();
            
            let result;
            if (articles.length > 0) {
                // 실제 뉴스 데이터 처리
                result = this.processRealNews(articles);
                console.log('✅ 실제 뉴스 데이터 처리 완료');
            } else {
                // 기본 데이터 사용
                result = this.createDefaultData();
                console.log('⚠️ 기본 데이터 사용');
            }

            // 캐시 저장
            this.cache.set('news', {
                data: result,
                timestamp: Date.now()
            });

            const duration = Date.now() - startTime;
            console.log(`⏱️ 뉴스 수집 완료: ${duration}ms`);
            
            return result;

        } catch (error) {
            console.error('❌ 뉴스 수집 오류:', error);
            return this.createDefaultData();
        }
    }

    // 실제 뉴스 처리
    processRealNews(articles) {
        console.log(`📊 실제 뉴스 처리: ${articles.length}개`);
        
        const processedArticles = articles.slice(0, 3).map((article, index) => ({
            id: `real-${index}`,
            title: article.title || '제목 없음',
            description: article.description || '내용 없음',
            url: article.url || '#',
            image: article.urlToImage,
            publishedAt: article.publishedAt || new Date().toISOString(),
            source: article.source?.name || 'Unknown',
            category: '세계',
            urgency: Math.floor(Math.random() * 3) + 2,
            importance: Math.floor(Math.random() * 3) + 2,
            buzz: Math.floor(Math.random() * 3) + 2,
            stars: Math.floor(Math.random() * 3) + 2,
            keywords: ['뉴스', '실시간'],
            sentiment: '중립'
        }));

        return {
            sections: {
                world: processedArticles,
                korea: [processedArticles[0] ? { ...processedArticles[0], id: 'korea-1', category: '한국' } : null].filter(Boolean),
                japan: [processedArticles[1] ? { ...processedArticles[1], id: 'japan-1', category: '일본' } : null].filter(Boolean)
            },
            trending: [['뉴스', 10], ['실시간', 8], ['글로벌', 6]],
            lastUpdated: new Date().toISOString(),
            totalArticles: processedArticles.length,
            systemStatus: {
                cacheSize: this.cache.size,
                lastUpdate: new Date().toISOString(),
                apiKeys: {
                    newsApi: !!process.env.NEWS_API_KEY,
                    skyworkAi: !!process.env.SKYWORK_API_KEY,
                    openAi: !!process.env.OPENAI_API_KEY,
                    youtubeApi: !!process.env.YOUTUBE_API_KEY
                },
                environment: process.env.NODE_ENV || 'production',
                version: 'debug-1.0.0'
            }
        };
    }
}

// 뉴스 시스템 초기화
const newsSystem = new SimpleNewsSystem();

// API 라우트
app.get('/api/news', async (req, res) => {
    console.log('📡 /api/news 요청 받음');
    
    try {
        // 타임아웃 설정 (10초)
        const timeout = setTimeout(() => {
            console.log('⏰ API 응답 타임아웃');
            if (!res.headersSent) {
                res.status(408).json({ error: '요청 시간 초과' });
            }
        }, 10000);

        const newsData = await newsSystem.collectNews();
        
        clearTimeout(timeout);
        
        if (!res.headersSent) {
            console.log('✅ 뉴스 데이터 응답 전송');
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
        // 캐시 클리어
        newsSystem.cache.clear();
        console.log('🗑️ 캐시 클리어 완료');
        
        const newsData = await newsSystem.collectNews();
        
        res.json({
            success: true,
            message: '업데이트 완료',
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
        environment: process.env.NODE_ENV || 'development',
        apiKeys: {
            newsApi: !!process.env.NEWS_API_KEY,
            skyworkAi: !!process.env.SKYWORK_API_KEY,
            openAi: !!process.env.OPENAI_API_KEY,
            youtubeApi: !!process.env.YOUTUBE_API_KEY
        },
        cacheSize: newsSystem.cache.size
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
    res.status(404).json({ error: '페이지를 찾을 수 없습니다' });
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
    console.log('🚀 EmarkNews 디버깅 서버 시작');
    console.log(`📡 포트: ${PORT}`);
    console.log(`🌐 URL: http://localhost:${PORT}`);
    console.log('🔧 디버깅 모드 활성화');
    
    // 초기 뉴스 수집
    setTimeout(() => {
        console.log('🔄 초기 뉴스 수집 시작...');
        newsSystem.collectNews().then(() => {
            console.log('✅ 초기 뉴스 수집 완료');
        }).catch(error => {
            console.error('❌ 초기 뉴스 수집 실패:', error);
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

