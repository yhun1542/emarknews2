const axios = require('axios');
const crypto = require('crypto');

// 설정 상수화
const CACHE_EXPIRY = 8 * 60 * 1000; // 8분
const API_TIMEOUTS = {
    NEWS_API: 10000,
    NAVER_API: 8000,
    OPENAI: 15000,
    SKYWORK: 12000,
    EXCHANGE_API: 5000,
    X_API: 8000 // *** X API 타임아웃 설정
};
const MAX_ARTICLES_PER_SECTION = 12;

class EnhancedNewsSystemXIntegrated {
    constructor() {
        this.cache = new Map();
        this.cacheExpiry = CACHE_EXPIRY;
        this.lastUpdate = null;
        this.isUpdating = false;
        this.updatePromise = null;
        this.updateCounter = 0;

        // API 설정
        this.apis = {
            newsApi: process.env.NEWS_API_KEY || '44d9347a149b40ad87b3deb8bba95183',
            openAi: process.env.OPENAI_API_KEY,
            skyworkAi: process.env.SKYWORK_API_KEY,
            naverClientId: process.env.NAVER_CLIENT_ID || '4lsPsi_je8UoGGcfTP1w',
            naverClientSecret: process.env.NAVER_CLIENT_SECRET || 'J3BHRgyWPc',
            // *** X (Twitter) API 설정 추가 (환경 변수 사용 권장) ***
            xApiKey: process.env.X_API_KEY || 'Dyop1iTlyu8fi6yeuC0GlcV0t',
            xApiSecret: process.env.X_API_SECRET || '8k4CpV8OJJO3J3lVgTh9N5VS92BatIWx4z5pzdOufUBTOxZETz'
        };

        this.xBearerToken = null; // *** X API Bearer Token 캐시
        this.xTokenExpiry = 0; // *** 토큰 만료 시간

        // *** X 트렌드 위치 (WOEID) ***
        this.xTrendLocations = {
            world: { woeid: 1, name: '전세계' },
            korea: { woeid: 23424868, name: '대한민국' },
            japan: { woeid: 23424856, name: '일본' }
        };

        // 프리미엄 소스 (신뢰도 점수 포함)
        this.premiumSources = {
            'bbc-news': { score: 95, name: 'BBC News' },
            'reuters': { score: 95, name: 'Reuters' },
            'associated-press': { score: 90, name: 'AP 통신' },
            'cnn': { score: 85, name: 'CNN' },
            'the-guardian-uk': { score: 85, name: 'The Guardian' },
            'the-new-york-times': { score: 90, name: 'New York Times' },
            'bloomberg': { score: 90, name: 'Bloomberg' },
            'financial-times': { score: 88, name: 'Financial Times' },
            'wall-street-journal': { score: 88, name: 'Wall Street Journal' },
            'abc-news': { score: 80, name: 'ABC News' },
            'nbc-news': { score: 80, name: 'NBC News' },
            'the-washington-post': { score: 85, name: 'Washington Post' }
        };

        // 일본 메이저 신문사 소스
        this.japanSources = {
            'asahi.com': { score: 90, name: '아사히신문' },
            'mainichi.jp': { score: 88, name: '마이니치신문' },
            'yomiuri.co.jp': { score: 88, name: '요미우리신문' },
            'nikkei.com': { score: 92, name: '니혼게이자이신문' },
            'sankei.com': { score: 85, name: '산케이신문' },
            'kyodonews.net': { score: 87, name: '교도통신' },
            'jiji.com': { score: 85, name: '지지통신' },
            'nhk.or.jp': { score: 90, name: 'NHK' },
            'japantimes.co.jp': { score: 85, name: 'Japan Times' }
        };

        // 한국 뉴스 소스 매핑
        this.koreanSources = {
            'chosun.com': { score: 85, name: '조선일보' },
            'joongang.co.kr': { score: 85, name: '중앙일보' },
            'donga.com': { score: 85, name: '동아일보' },
            'hankyoreh.com': { score: 80, name: '한겨레' },
            'khan.co.kr': { score: 80, name: '경향신문' },
            'hani.co.kr': { score: 80, name: '한겨레' },
            'ytn.co.kr': { score: 85, name: 'YTN' },
            'sbs.co.kr': { score: 85, name: 'SBS' },
            'kbs.co.kr': { score: 85, name: 'KBS' },
            'mbc.co.kr': { score: 85, name: 'MBC' },
            'jtbc.co.kr': { score: 80, name: 'JTBC' },
            'news1.kr': { score: 75, name: '뉴스1' },
            'newsis.com': { score: 75, name: '뉴시스' },
            'yna.co.kr': { score: 80, name: '연합뉴스' },
            'mt.co.kr': { score: 75, name: '머니투데이' },
            'mk.co.kr': { score: 75, name: '매일경제' },
            'sedaily.com': { score: 75, name: '서울경제' },
            'etnews.com': { score: 75, name: '전자신문' }
        };

        // 고품질 키워드
        this.qualityKeywords = {
            urgent: {
                keywords: ['breaking', 'urgent', 'emergency', 'crisis', 'alert', '긴급', '속보', '위기', '비상', '경보'],
                score: 25
            },
            important: {
                keywords: ['president', 'government', 'minister', 'summit', 'agreement', 'decision', 'policy', '대통령', '정부', '장관', '정상회담', '합의', '결정', '정책'],
                score: 20
            },
            economic: {
                keywords: ['economy', 'market', 'stock', 'finance', 'trade', 'investment', 'gdp', '경제', '시장', '주식', '금융', '무역', '투자'],
                score: 15
            },
            international: {
                keywords: ['war', 'conflict', 'diplomacy', 'treaty', 'sanctions', 'nato', 'un', '전쟁', '갈등', '외교', '조약', '제재'],
                score: 18
            },
            technology: {
                keywords: ['ai', 'artificial intelligence', 'technology', 'innovation', 'breakthrough', 'research', '인공지능', '기술', '혁신', '연구'],
                score: 12
            },
            social: {
                keywords: ['society', 'culture', 'education', 'health', 'environment', '사회', '문화', '교육', '건강', '환경'],
                score: 10
            }
        };

        // 스포츠 키워드 (제외용)
        this.sportsKeywords = ['sports', 'baseball', 'football', 'soccer', 'basketball', 'tennis', 'golf', 'olympics', 'world cup', '스포츠', '야구', '축구', '농구', '테니스', '골프', '올림픽'];


        // API 메트릭
        this.apiMetrics = {
            newsApi: { success: 0, failure: 0, totalTime: 0, lastError: null },
            naverApi: { success: 0, failure: 0, totalTime: 0, lastError: null },
            openAi: { success: 0, failure: 0, totalTime: 0, lastError: null },
            skyworkAi: { success: 0, failure: 0, totalTime: 0, lastError: null },
            exchangeApi: { success: 0, failure: 0, totalTime: 0, lastError: null },
            xApi: { success: 0, failure: 0, totalTime: 0, lastError: null } // *** X API 메트릭 추가
        };

        // Rate Limiting
        this.rateLimits = {
            naver: { requests: 0, resetTime: Date.now() + 60000, maxRequests: 50 },
            newsApi: { requests: 0, resetTime: Date.now() + 3600000, maxRequests: 400 },
            openAi: { requests: 0, resetTime: Date.now() + 60000, maxRequests: 60 },
            skywork: { requests: 0, resetTime: Date.now() + 60000, maxRequests: 60 },
            // *** X API Rate Limit (Trends API는 15분당 75회 제한)
            xApi: { requests: 0, resetTime: Date.now() + (15 * 60000), maxRequests: 70 }
        };

        console.log('🚀 뉴스 시스템 초기화 (X API 통합 v16.0.0)');
    }

    // 메인 뉴스 수집 함수 (Promise 재사용 로직 유지)
    async getNews(forceRefresh = false, timestamp = null) {
        const cacheKey = 'integrated_news_data_v16';

        // 1. 캐시 확인
        if (!forceRefresh && !timestamp && this.cache.has(cacheKey) && !this.isCacheExpired(cacheKey)) {
            return this.cache.get(cacheKey).data;
        }

        // 2. 업데이트 중복 방지
        if (this.isUpdating) {
            console.log('⚠️ 이미 업데이트 중입니다. 진행 중인 업데이트를 기다립니다.');
            if (this.updatePromise) {
                try {
                    const newsData = await this.updatePromise;
                    return newsData;
                } catch (error) {
                    return this.cache.get(cacheKey)?.data || this.getEmergencyNews();
                }
            }
            return this.cache.get(cacheKey)?.data || this.getEmergencyNews();
        }

        // 3. 업데이트 시작
        console.log('🔄 통합 뉴스 수집 시작...', forceRefresh ? '(강제 새로고침)' : '');
        this.isUpdating = true;
        this.updateCounter++;

        this.updatePromise = this.collectEnhancedNews(forceRefresh)
            .then(newsData => {
                const totalArticles = newsData.sections.world.length +
                                      newsData.sections.korea.length +
                                      newsData.sections.japan.length;

                if (totalArticles < 5) {
                    console.error('❌ 충분한 뉴스 수집 실패');
                    return this.cache.get(cacheKey)?.data || this.getEmergencyNews();
                }

                // 성공적으로 수집된 데이터를 캐시에 저장
                this.cache.set(cacheKey, {
                    data: newsData,
                    timestamp: Date.now()
                });

                this.lastUpdate = new Date().toISOString();
                console.log(`✅ 뉴스 수집 완료: ${totalArticles}개 기사 + ${newsData.sections.buzz.length}개 버즈`);

                return newsData;
            })
            .catch(error => {
                console.error('❌ 뉴스 수집 중 치명적 오류:', error.message);
                const fallbackData = this.cache.get(cacheKey)?.data || this.getEmergencyNews();
                return fallbackData;
            })
            .finally(() => {
                this.isUpdating = false;
                this.updatePromise = null;
            });

        return this.updatePromise;
    }

    // *** 개선사항: 향상된 뉴스 수집 (X 트렌드 추가)
    async collectEnhancedNews(forceRefresh = false) {
        console.log('📡 뉴스 및 소셜 트렌드 수집 시작...');

        // 병렬 수집 (X 트렌드 추가)
        const results = await Promise.allSettled([
            this.fetchEnhancedWorldNews(forceRefresh),
            this.fetchEnhancedKoreaNews(forceRefresh),
            this.fetchEnhancedJapanNews(forceRefresh),
            this.fetchEnhancedExchangeRates(),
            this.fetchSocialBuzz() // *** X 트렌드 수집
        ]);

        const worldNews = results[0].status === 'fulfilled' ? results[0].value : [];
        const koreaNews = results[1].status === 'fulfilled' ? results[1].value : [];
        const japanNews = results[2].status === 'fulfilled' ? results[2].value : [];
        const exchangeRates = results[3].status === 'fulfilled' ? results[3].value : this.getDefaultExchangeRates();
        const socialBuzz = results[4].status === 'fulfilled' ? results[4].value : []; // *** 버즈 데이터

        // 결과 로깅
        results.forEach((result, index) => {
            const sections = ['세계뉴스', '한국뉴스', '일본뉴스', '환율정보', '소셜버즈'];
            if (result.status === 'rejected') {
                console.error(`❌ ${sections[index]} 수집 실패:`, result.reason?.message);
            }
        });

        const trending = this.generateAdvancedTrendingKeywords([...worldNews, ...koreaNews, ...japanNews]);

        return {
            sections: {
                world: worldNews.slice(0, MAX_ARTICLES_PER_SECTION),
                korea: koreaNews.slice(0, MAX_ARTICLES_PER_SECTION),
                japan: japanNews.slice(0, MAX_ARTICLES_PER_SECTION),
                buzz: socialBuzz.slice(0, 20) // *** 버즈 섹션 추가
            },
            trending,
            exchangeRates,
            systemStatus: {
                version: '16.0.0-x-integrated',
                lastUpdate: this.lastUpdate,
                cacheSize: this.cache.size,
                updateCounter: this.updateCounter,
                features: [
                    'performance-optimization',
                    'parallel-processing',
                    'x-api-trends-integration', // 기능 추가
                    'realtime-social-buzz', // 기능 추가
                    'robust-caching',
                    'api-retry-mechanism',
                    'enhanced-translation-system'
                ],
                apiMetrics: this.getApiMetricsReport(),
                apiSources: {
                    newsApi: !!this.apis.newsApi,
                    naverApi: !!(this.apis.naverClientId && this.apis.naverClientSecret),
                    openAi: !!this.apis.openAi,
                    skyworkAi: !!this.apis.skyworkAi,
                    exchangeApi: true,
                    xApi: !!(this.apis.xApiKey && this.apis.xApiSecret) // X API 상태 추가
                }
            }
        };
    }

    // --- X (Twitter) API 통합 함수들 시작 ---

    // *** 신규: X API 인증 (Bearer Token 발급 및 캐싱)
    async getXBearerToken() {
        // 토큰이 유효하면 재사용 (만료 5분 전까지 유효)
        if (this.xBearerToken && Date.now() < this.xTokenExpiry - (5 * 60000)) {
            return this.xBearerToken;
        }

        if (!this.apis.xApiKey || !this.apis.xApiSecret) {
            console.warn('⚠️ X API 키가 설정되지 않았습니다.');
            return null;
        }

        // 자격 증명 Base64 인코딩
        const credentials = Buffer.from(`${encodeURIComponent(this.apis.xApiKey)}:${encodeURIComponent(this.apis.xApiSecret)}`).toString('base64');
        const url = 'https://api.twitter.com/oauth2/token';

        try {
            console.log('🔑 X API Bearer Token 발급 시도...');
            const response = await axios.post(url, 'grant_type=client_credentials', {
                headers: {
                    'Authorization': `Basic ${credentials}`,
                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
                },
                timeout: API_TIMEOUTS.X_API
            });

            if (response.data.token_type === 'bearer') {
                this.xBearerToken = response.data.access_token;
                // 토큰 만료 시간 설정 (안전하게 1시간으로 설정)
                this.xTokenExpiry = Date.now() + (60 * 60000);
                console.log('✅ X API Bearer Token 발급 성공');
                return this.xBearerToken;
            } else {
                throw new Error('Invalid token type received');
            }
        } catch (error) {
            const errorMessage = error.response ? `${error.response.status}: ${error.message}` : error.message;
            console.error('❌ X API 인증 실패:', errorMessage);
            this.updateApiMetrics('xApi', false, 0, 'Authentication failed');
            return null;
        }
    }

    // *** 신규: 소셜 버즈(X 트렌드) 수집
    async fetchSocialBuzz() {
        console.log('🔥 소셜 버즈(X 트렌드) 수집 중...');
        const token = await this.getXBearerToken();
        if (!token) return [];

        // 3개 지역 트렌드 병렬 수집
        const promises = Object.entries(this.xTrendLocations).map(([region, data]) => {
            return this.fetchXTrendsByLocation(token, data.woeid, region, data.name)
                .catch(error => {
                    console.error(`❌ ${data.name} 트렌드 수집 실패:`, error.message);
                    return [];
                });
        });

        const results = await Promise.all(promises);
        let allBuzz = results.flat();

        // 중복 제거 및 볼륨 합산 (여러 지역에서 동일 트렌드가 나타날 경우)
        const uniqueBuzzMap = new Map();
        allBuzz.forEach(buzz => {
            const key = buzz.name.toLowerCase().replace(/\s+/g, '');
            if (!uniqueBuzzMap.has(key)) {
                uniqueBuzzMap.set(key, buzz);
            } else {
                const existing = uniqueBuzzMap.get(key);
                if ((buzz.volume || 0) > (existing.volume || 0)) {
                    existing.volume = buzz.volume; // 더 큰 볼륨으로 갱신
                }
                // 지역 정보 병합
                if (!existing.regionName.includes(buzz.regionName)) {
                    existing.regionName += `, ${buzz.regionName}`;
                }
            }
        });

        const uniqueBuzz = Array.from(uniqueBuzzMap.values());

        // 트윗량(Volume) 순으로 정렬 (높은 순)
        uniqueBuzz.sort((a, b) => (b.volume || 0) - (a.volume || 0));

        // 번역 처리 (병렬)
        const processedBuzz = await this.processBuzzWithTranslation(uniqueBuzz);

        console.log(`✅ 소셜 버즈 수집 및 번역 완료: ${processedBuzz.length}개`);
        return processedBuzz;
    }

    // *** 신규: 특정 지역 X 트렌드 수집 (API v1.1 사용)
    async fetchXTrendsByLocation(token, woeid, region, regionName) {
        if (!this.checkRateLimit('xApi')) {
            return [];
        }

        const startTime = Date.now();
        // X API v1.1 Trends endpoint 사용 (v2는 제한적 접근만 허용)
        const url = `https://api.twitter.com/1.1/trends/place.json?id=${woeid}`;

        try {
            const response = await axios.get(url, {
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                timeout: API_TIMEOUTS.X_API
            });

            const trends = response.data[0]?.trends || [];

            // 데이터 구조화 (상위 15개만 사용)
            const buzzItems = trends.slice(0, 15).map(trend => ({
                id: this.generateId(trend.url),
                name: trend.name.replace(/^#/, ''), // 해시태그 제거
                translatedName: trend.name.replace(/^#/, ''), // 기본값은 원본 이름
                url: trend.url,
                volume: trend.tweet_volume,
                region: region,
                regionName: regionName,
                timestamp: Date.now()
            }));

            this.updateApiMetrics('xApi', true, Date.now() - startTime);
            return buzzItems;

        } catch (error) {
             // 토큰 만료 시 재인증 유도
            if (error.response && error.response.status === 401) {
                this.xBearerToken = null;
                this.xTokenExpiry = 0;
            }
            const errorMessage = error.response ? `${error.response.status}: ${error.message}` : error.message;
            this.updateApiMetrics('xApi', false, Date.now() - startTime, errorMessage);
            throw error;
        }
    }

    // *** 신규: 버즈 아이템 번역 처리 (병렬)
    async processBuzzWithTranslation(buzzItems) {
        const translationPromises = buzzItems.map(item => {
            // 한국 트렌드이거나 이미 한글이 포함된 경우 번역 생략 (효율성)
            if (item.region === 'korea' || /[가-힣]/.test(item.name)) {
                return Promise.resolve(item);
            }

            // AI 번역 시도 (기존 시스템 활용)
            return this.translateKeyword(item.name)
                .then(translated => {
                    if (translated && translated !== item.name) {
                        item.translatedName = translated;
                    }
                    return item;
                })
                .catch(() => {
                    // 번역 실패 시 원본 이름 사용
                    return item;
                });
        });

        return await Promise.all(translationPromises);
    }

    // *** 신규: 키워드 번역 전용 (AI 활용)
    async translateKeyword(keyword) {
        // OpenAI 사용 (Rate Limit 확인)
        if (this.apis.openAi && this.checkRateLimit('openAi')) {
            try {
                const startTime = Date.now();
                // 키워드 번역 전용 프롬프트 (단어만 번역하도록 유도)
                const prompt = `Translate the following social media trend keyword or hashtag into natural Korean. Provide ONLY the single best translation, without any explanation, quotation marks, or extra formatting.\n\nKeyword: ${keyword}\nTranslation:`;

                const response = await axios.post('https://api.openai.com/v1/chat/completions', {
                    model: 'gpt-3.5-turbo-0125',
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: 30, // 키워드이므로 짧게 설정
                    temperature: 0.1
                }, {
                    headers: { 'Authorization': `Bearer ${this.apis.openAi}` },
                    timeout: 5000 // 키워드 번역은 빠르게 처리
                });

                this.updateApiMetrics('openAi', true, Date.now() - startTime);
                const translatedText = response.data.choices[0].message.content.trim();

                // 결과값 정리 (혹시 모를 따옴표 제거)
                return translatedText.replace(/^["']|["']$/g, '');

            } catch (error) {
                this.updateApiMetrics('openAi', false, 0, error.message);
                // 실패 시 로깅만 하고 넘어감
            }
        }
        // (Skywork 등 다른 번역 엔진도 유사하게 추가 가능)

        return keyword; // 실패 시 원본 반환
    }

    // --- X (Twitter) API 통합 함수들 끝 ---
    
    // --- 기존 뉴스 수집 및 처리 함수들 (enhanced-news-system-optimized.js에서 가져옴) ---

    async fetchEnhancedWorldNews(forceRefresh = false) {
        console.log('🌍 세계뉴스 수집 중...');
        const sources = [
            { endpoint: 'top-headlines', params: { category: 'general', language: 'en', pageSize: 30, sources: 'bbc-news,reuters,associated-press,cnn' } },
            { endpoint: 'everything', params: { q: 'breaking OR urgent OR crisis OR government OR president', language: 'en', pageSize: 25, sortBy: 'publishedAt', sources: 'bbc-news,reuters,the-guardian-uk,bloomberg' } },
            { endpoint: 'top-headlines', params: { category: 'business', language: 'en', pageSize: 20, sources: 'bloomberg,financial-times,wall-street-journal' } }
        ];

        const apiPromises = sources.map(source => {
            if (!this.checkRateLimit('newsApi')) return Promise.resolve([]);
            return this.callNewsAPI(source.endpoint, source.params)
                .then(articles => articles.filter(article => !this.containsKeywords(article.title + ' ' + article.description, this.sportsKeywords)))
                .catch(error => {
                    console.error(`❌ 세계뉴스 수집 실패 (${source.endpoint}):`, error.message);
                    return [];
                });
        });

        const results = await Promise.all(apiPromises);
        const allArticles = results.flat();
        const qualityArticles = this.selectHighQualityNews(allArticles, 'world');
        const processedArticles = await this.processArticlesWithEnhancedTranslation(qualityArticles, 'world');
        console.log(`✅ 세계뉴스 처리 완료: ${processedArticles.length}개`);
        return processedArticles;
    }

    async fetchEnhancedKoreaNews(forceRefresh = false) {
        console.log('🇰🇷 한국뉴스 수집 중...');
        const promises = [];

        if (this.checkRateLimit('naver')) {
            promises.push(this.callEnhancedNaverAPI().catch(error => {
                console.error('❌ Naver API 수집 실패:', error.message);
                return [];
            }));
        }

        if (this.checkRateLimit('newsApi')) {
            promises.push(this.callNewsAPI('everything', {
                q: 'Korea OR Korean OR Seoul OR "South Korea" OR Samsung OR LG',
                language: 'en', pageSize: 20, sortBy: 'publishedAt',
                sources: 'bbc-news,reuters,cnn,bloomberg,associated-press'
            }).then(koreanArticles => koreanArticles.filter(article => {
                const content = article.title + ' ' + article.description;
                return this.containsKeywords(content, ['korea', 'korean', 'seoul', 'south korea']) && !this.containsKeywords(content, this.sportsKeywords);
            })).catch(error => {
                console.error('❌ NewsAPI 한국뉴스 수집 실패:', error.message);
                return [];
            }));
        }

        const results = await Promise.all(promises);
        const allArticles = results.flat();
        const qualityArticles = this.selectHighQualityNews(allArticles, 'korea');
        const processedArticles = await this.processArticlesWithEnhancedTranslation(qualityArticles, 'korea');
        console.log(`✅ 한국뉴스 처리 완료: ${processedArticles.length}개`);
        return processedArticles;
    }

    async fetchEnhancedJapanNews(forceRefresh = false) {
        console.log('🇯🇵 일본뉴스 수집 중...');
        const sources = [
            { endpoint: 'everything', params: { q: 'Japan OR Japanese OR Tokyo OR "Prime Minister Japan" OR Kishida OR Nikkei', language: 'en', pageSize: 25, sortBy: 'publishedAt', sources: 'bbc-news,reuters,cnn,bloomberg,associated-press' } },
            { endpoint: 'everything', params: { q: '(Japan OR Japanese) AND (economy OR politics OR society OR technology)', language: 'en', pageSize: 20, sortBy: 'publishedAt' } },
            { endpoint: 'top-headlines', params: { country: 'jp', pageSize: 10 } }
        ];

        const apiPromises = sources.map(source => {
            if (!this.checkRateLimit('newsApi')) return Promise.resolve([]);
            return this.callNewsAPI(source.endpoint, source.params)
                .then(articles => articles.filter(article => {
                    const content = (article.title + ' ' + article.description).toLowerCase();
                    const isRelevant = source.params.country === 'jp' || this.containsKeywords(content, ['japan', 'japanese', 'tokyo', 'nikkei', 'kishida']);
                    return isRelevant && !this.containsKeywords(content, this.sportsKeywords);
                }))
                .catch(error => {
                    console.error(`❌ 일본뉴스 수집 실패 (${source.endpoint}):`, error.message);
                    return [];
                });
        });

        const results = await Promise.all(apiPromises);
        const allArticles = results.flat();
        const qualityArticles = this.selectHighQualityNews(allArticles, 'japan');
        const processedArticles = await this.processArticlesWithEnhancedTranslation(qualityArticles, 'japan');
        console.log(`✅ 일본뉴스 처리 완료: ${processedArticles.length}개`);
        return processedArticles;
    }

    async processArticlesWithEnhancedTranslation(articles, section) {
        const articlesToProcess = articles.slice(0, MAX_ARTICLES_PER_SECTION);
        console.log(`🔄 ${section} 섹션 기사 처리 및 번역 시작 (${articlesToProcess.length}개 병렬 처리)`);
        const processingPromises = articlesToProcess.map(article =>
            this.processSingleArticle(article).catch(error => {
                console.error(`❌ 기사 처리 실패 (${article.title?.substring(0, 30)}):`, error.message);
                return this.fallbackProcessArticle(article);
            })
        );
        const processedArticles = await Promise.all(processingPromises);
        return processedArticles.filter(Boolean);
    }

    async processSingleArticle(article) {
        let translatedContent;
        if (article.isKorean) {
            translatedContent = {
                translatedTitle: article.title,
                summary: this.createEnhancedSummary(article),
                detailed: this.formatDetailedContent(article.description),
                fullContent: this.formatFullContent(article)
            };
        } else {
            translatedContent = await this.translateArticleEnhanced(article);
        }

        const contentForAnalysis = article.title + ' ' + article.description;
        const marks = this.analyzeAdvancedMarks(contentForAnalysis);
        const stars = Math.min(5, Math.max(1, Math.round(article.qualityScore / 20)));
        const category = this.classifyAdvancedCategory(contentForAnalysis);
        const timeAgo = this.calculateTimeAgo(article.publishedAt);
        const keywords = this.extractAdvancedKeywords(contentForAnalysis);

        return {
            ...article,
            translatedTitle: translatedContent.translatedTitle,
            summary: translatedContent.summary,
            description: translatedContent.detailed,
            fullContent: translatedContent.fullContent,
            marks,
            stars,
            category,
            timeAgo,
            keywords,
            mobileOptimized: {
                title: translatedContent.translatedTitle || article.title,
                shortDesc: (translatedContent.detailed || article.description || '').substring(0, 120) + '...',
                tags: [category, timeAgo, `★${stars}`].concat(marks)
            }
        };
    }

    fallbackProcessArticle(article) {
        const timeAgo = this.calculateTimeAgo(article.publishedAt);
        return {
            ...article,
            translatedTitle: article.title,
            summary: this.createEnhancedSummary(article),
            description: this.formatDetailedContent(article.description),
            fullContent: this.formatFullContent(article),
            marks: ['오류'],
            stars: 2,
            category: '일반',
            timeAgo: timeAgo,
            keywords: ['뉴스'],
            mobileOptimized: {
                title: article.title,
                shortDesc: (article.description || '').substring(0, 120) + '...',
                tags: ['일반', timeAgo, '★2', '처리 오류']
            }
        };
    }

    async translateArticleEnhanced(article) {
        const content = article.title + '\n\n' + article.description;
        if (this.apis.openAi && this.checkRateLimit('openAi')) {
            try {
                const result = await this.callOpenAIEnhancedTranslation(content);
                const parsed = this.parseEnhancedTranslationResult(result);
                if (parsed.translatedTitle && parsed.summary) return parsed;
            } catch (error) {
                console.error(`❌ OpenAI 번역 실패 (${article.title.substring(0, 20)}):`, error.message);
            }
        }
        if (this.apis.skyworkAi && this.checkRateLimit('skywork')) {
            try {
                const result = await this.callSkyworkAIEnhancedTranslation(content);
                const parsed = this.parseEnhancedTranslationResult(result);
                if (parsed.translatedTitle && parsed.summary) return parsed;
            } catch (error) {
                console.error(`❌ Skywork AI 번역 실패 (${article.title.substring(0, 20)}):`, error.message);
            }
        }
        console.log(`🔧 기본 번역 시스템 사용 (${article.title.substring(0, 20)})`);
        return this.basicEnhancedTranslateAndSummarize(article);
    }

    async callOpenAIEnhancedTranslation(content) {
        const startTime = Date.now();
        const prompt = `다음 영문 뉴스를 전문적이고 자연스러운 한국어로 번역해주세요. 모바일 및 PC 가독성을 위해 형식을 엄격히 준수해야 합니다.\n\n[영문 뉴스]\n${content}\n\n[요구사항]\n1. 문체: 간결하고 명확한 뉴스 보도 문체 사용 (예: ~했다, ~이다).\n2. 정확성: 원문의 의미와 뉘앙스를 정확하게 전달. 오역 및 누락 금지.\n3. 형식 준수: 아래 지정된 형식(제목:, 요약:, 상세:, 전문:)을 반드시 따를 것.\n4. 가독성: 문단 구분을 명확히 하고 들여쓰기 사용. 굵은 글씨, 특수 기호, 줄임표(...) 사용 금지.\n\n[번역 형식]\n제목: [완전하고 자연스러운 한국어 제목]\n\n요약:\n• 첫 번째 핵심 내용 (완전한 문장으로).\n• 두 번째 핵심 내용 (완전한 문장으로).\n• 세 번째 핵심 내용 (완전한 문장으로).\n\n상세:\n    [뉴스의 배경과 주요 사실을 설명하는 첫 번째 문단. 2-3문장으로 구성.]\n\n    [관련된 세부 사항과 추가 정보를 다루는 두 번째 문단. 2-3문장으로 구성.]\n\n    [영향, 전망, 또는 전문가 의견을 분석하는 세 번째 문단. 2-3문장으로 구성.]\n\n전문:\n    [원문 전체를 완전히 번역한 첫 번째 문단. 세부사항 포함.]\n\n    [원문 전체를 완전히 번역한 두 번째 문단. 세부사항 포함.]\n\n    [원문 전체를 완전히 번역한 세 번째 문단. 세부사항 포함.]`;
        try {
            const response = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-3.5-turbo-0125',
                messages: [
                    { role: 'system', content: '당신은 전문적인 뉴스 번역가이자 편집자입니다. 영문 뉴스를 한국어로 정확하게 번역하고 지정된 형식에 맞춰 정리합니다.' },
                    { role: 'user', content: prompt }
                ],
                max_tokens: 1500,
                temperature: 0.3
            }, {
                headers: { 'Authorization': `Bearer ${this.apis.openAi}`, 'Content-Type': 'application/json' },
                timeout: API_TIMEOUTS.OPENAI
            });
            this.updateApiMetrics('openAi', true, Date.now() - startTime);
            return response.data.choices[0].message.content;
        } catch (error) {
            this.updateApiMetrics('openAi', false, Date.now() - startTime, error.message);
            throw error;
        }
    }

    async callSkyworkAIEnhancedTranslation(content) {
        const startTime = Date.now();
        const prompt = `다음 영문 뉴스를 한국어로 정확하게 번역해주세요. 반드시 제목:, 요약:, 상세:, 전문: 형식으로 작성하고, 문단을 나누어 가독성 있게 편집해주세요. 줄임표는 사용하지 말고 모든 내용을 완전히 번역해야 합니다.\n\n[영문 뉴스]\n${content}`;
        try {
            const response = await axios.post('https://api.skywork.ai/v1/chat/completions', {
                model: 'skywork-lite',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 1200,
                temperature: 0.4
            }, {
                headers: { 'Authorization': `Bearer ${this.apis.skyworkAi}`, 'Content-Type': 'application/json' },
                timeout: API_TIMEOUTS.SKYWORK
            });
            this.updateApiMetrics('skyworkAi', true, Date.now() - startTime);
            return response.data.choices[0].message.content;
        } catch (error) {
            this.updateApiMetrics('skyworkAi', false, Date.now() - startTime, error.message);
            throw error;
        }
    }

    async fetchEnhancedExchangeRates() {
        const startTime = Date.now();
        try {
            console.log('💱 환율 정보 수집 중...');
            const response = await axios.get('https://api.exchangerate-api.com/v4/latest/USD', {
                timeout: API_TIMEOUTS.EXCHANGE_API,
                headers: { 'User-Agent': 'EmarkNews/16.0.0' }
            });
            const rates = response.data.rates;
            if (!rates.KRW || !rates.JPY) throw new Error('환율 데이터 누락');
            const exchangeRates = {
                USD_KRW: Math.round(rates.KRW * 100) / 100,
                JPY_KRW_100: Math.round((rates.KRW / rates.JPY) * 100 * 100) / 100,
                lastUpdate: new Date().toISOString(),
                source: 'ExchangeRate-API',
                timestamp: Date.now()
            };
            this.updateApiMetrics('exchangeApi', true, Date.now() - startTime);
            return exchangeRates;
        } catch (error) {
            console.error('❌ 환율 정보 수집 실패:', error.message);
            this.updateApiMetrics('exchangeApi', false, Date.now() - startTime, error.message);
            return this.getDefaultExchangeRates();
        }
    }

    async callEnhancedNaverAPI() {
        const queries = ['정치 속보', '경제 주요뉴스', '사회 사건사고', '국제 외교', 'IT 기술동향', '금융 시장'];
        const apiPromises = queries.map(query => {
            if (!this.checkRateLimit('naver')) return Promise.resolve([]);
            return this.fetchNaverNewsByQuery(query).catch(error => {
                console.error(`❌ Naver API 쿼리 실패 (${query}):`, error.message);
                return [];
            });
        });
        const results = await Promise.all(apiPromises);
        const allArticles = results.flat();
        const uniqueArticles = this.removeDuplicates(allArticles);
        uniqueArticles.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
        return uniqueArticles;
    }

    async fetchNaverNewsByQuery(query) {
        const startTime = Date.now();
        const config = {
            params: { query, display: 8, start: 1, sort: 'date' },
            headers: {
                'X-Naver-Client-Id': this.apis.naverClientId,
                'X-Naver-Client-Secret': this.apis.naverClientSecret,
                'User-Agent': 'EmarkNews/16.0.0'
            },
            timeout: API_TIMEOUTS.NAVER_API
        };
        try {
            const response = await axios.get('https://openapi.naver.com/v1/search/news.json', config);
            const articles = (response.data.items || []).map(item => {
                const sourceName = this.extractEnhancedSourceFromNaverLink(item.originallink || item.link);
                return {
                    id: this.generateId(item.link),
                    title: this.cleanNaverText(item.title),
                    description: this.cleanNaverText(item.description),
                    url: item.link,
                    originalUrl: item.originallink || item.link,
                    image: null,
                    publishedAt: item.pubDate,
                    source: { name: sourceName, display: this.getSourceDisplay(sourceName, item.pubDate) },
                    isKorean: true,
                    qualityScore: 75
                };
            });
            this.updateApiMetrics('naverApi', true, Date.now() - startTime);
            return articles;
        } catch (error) {
            this.updateApiMetrics('naverApi', false, Date.now() - startTime, error.message);
            throw error;
        }
    }

    async callNewsAPI(endpoint, params) {
        const url = `https://newsapi.org/v2/${endpoint}`;
        const startTime = Date.now();
        const config = {
            params: { ...params, apiKey: this.apis.newsApi },
            timeout: API_TIMEOUTS.NEWS_API,
            headers: { 'User-Agent': 'EmarkNews/16.0.0' }
        };
        let response;
        const MAX_RETRIES = 2;
        for (let i = 0; i < MAX_RETRIES; i++) {
            try {
                response = await axios.get(url, config);
                break;
            } catch (error) {
                const isLastAttempt = i === MAX_RETRIES - 1;
                const status = error.response ? error.response.status : null;
                if (isLastAttempt || (status && status < 500 && status !== 429)) {
                    const errorMessage = error.response ? `${status}: ${error.response.data.message || error.response.statusText}` : error.message;
                    this.updateApiMetrics('newsApi', false, Date.now() - startTime, errorMessage);
                    throw new Error(`NewsAPI 호출 실패 (${endpoint}): ${errorMessage}`);
                }
                console.warn(`⚠️ NewsAPI 재시도 (${endpoint}, 시도: ${i + 1})`);
                await this.sleep(500 * (i + 1));
            }
        }
        try {
            if (response.data.status !== 'ok') throw new Error(`NewsAPI 응답 오류: ${response.data.code} - ${response.data.message}`);
            const articles = (response.data.articles || [])
                .filter(article =>
                    article.title && article.title.trim() && article.title !== '[Removed]' &&
                    article.description && article.description.trim() && article.description !== '[Removed]' &&
                    article.url && article.url.startsWith('http') && !article.url.includes('removed.com') &&
                    article.source && article.source.name &&
                    article.description.length > 80
                )
                .map(article => ({
                    id: this.generateId(article.url),
                    title: article.title.trim(),
                    description: article.description.trim(),
                    url: article.url,
                    originalUrl: article.url,
                    image: article.urlToImage,
                    publishedAt: article.publishedAt,
                    source: { name: article.source.name, display: this.getSourceDisplay(article.source.name, article.publishedAt) },
                    isKorean: false
                }));
            this.updateApiMetrics('newsApi', true, Date.now() - startTime);
            return articles;
        } catch (error) {
            this.updateApiMetrics('newsApi', false, Date.now() - startTime, error.message);
            throw error;
        }
    }
    
    // --- 유틸리티 및 기타 함수들 ---

    extractEnhancedSourceFromNaverLink(link) {
        if (!link) return 'Unknown Source';
        try {
            const hostname = new URL(link).hostname.toLowerCase().replace('www.', '');
            for (const [domain, data] of Object.entries(this.koreanSources)) {
                if (hostname.includes(domain)) return data.name;
            }
            const additionalMapping = { 'news.naver.com': '네이버뉴스', 'v.daum.net': '다음뉴스', 'news.daum.net': '다음뉴스' };
            for (const [domain, name] of Object.entries(additionalMapping)) {
                if (hostname.includes(domain)) return name;
            }
            return hostname || 'Unknown Source';
        } catch (error) {
            return 'Invalid URL';
        }
    }

    createEnhancedSummary(article) {
        const description = article.description || '';
        const sentences = description.match(/[^.!?]+[.!?]*/g) || [];
        const filteredSentences = sentences.map(s => s.trim()).filter(s => s.length > 15);
        if (filteredSentences.length >= 3) return filteredSentences.slice(0, 4).map(s => `• ${s}`).join('\n');
        if (filteredSentences.length >= 1) return filteredSentences.map(s => `• ${s}`).join('\n');
        const words = description.split(' ');
        const chunks = [];
        for (let i = 0; i < words.length; i += 15) chunks.push(words.slice(i, i + 15).join(' '));
        return chunks.slice(0, 3).map(chunk => `• ${chunk.trim()}`).join('\n');
    }

    formatDetailedContent(content) {
        if (!content) return '    상세 내용이 없습니다.';
        const sentences = content.match(/[^.!?]+[.!?]*/g) || [];
        const filteredSentences = sentences.map(s => s.trim()).filter(s => s.length > 10);
        if (filteredSentences.length <= 2) return `    ${content.trim()}`;
        const paragraphs = [];
        for (let i = 0; i < filteredSentences.length; i += 3) {
            const paragraph = filteredSentences.slice(i, i + 3).join(' ').trim();
            if (paragraph) paragraphs.push(`    ${paragraph}`);
        }
        return paragraphs.join('\n\n');
    }

    formatFullContent(article) {
        const { title = '', description = '' } = article;
        if (!description) return `    ${title}\n\n    이 기사에 대한 더 자세한 정보는 원문을 참조하시기 바랍니다.`;
        const sentences = description.match(/[^.!?]+[.!?]*/g) || [];
        const filteredSentences = sentences.map(s => s.trim()).filter(s => s.length > 10);
        if (filteredSentences.length <= 3) return `    ${description.trim()}\n\n    더 자세한 내용은 원문을 참조하시기 바랍니다.`;
        const paragraphs = [];
        for (let i = 0; i < filteredSentences.length; i += 4) {
            const paragraph = filteredSentences.slice(i, i + 4).join(' ').trim();
            if (paragraph) paragraphs.push(`    ${paragraph}`);
        }
        return paragraphs.join('\n\n');
    }

    basicEnhancedTranslateAndSummarize(article) {
        const { title: translatedTitle, description: translatedDescription } = article;
        const summary = this.createEnhancedSummary({ description: translatedDescription });
        const detailed = this.formatDetailedContent(translatedDescription);
        const fullContent = this.formatFullContent({ title: translatedTitle, description: translatedDescription });
        return { translatedTitle, summary, detailed, fullContent };
    }

    parseEnhancedTranslationResult(result) {
        let translatedTitle = '', summary = '', detailed = '', fullContent = '', currentSection = '';
        const titleMatch = result.match(/제목:\s*(.*)/);
        if (titleMatch && titleMatch[1]) translatedTitle = titleMatch[1].trim();

        for (const line of result.split('\n')) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;
            if (trimmedLine.startsWith('제목:')) { currentSection = 'title'; continue; }
            if (trimmedLine.startsWith('요약:')) { currentSection = 'summary'; continue; }
            if (trimmedLine.startsWith('상세:')) { currentSection = 'detailed'; continue; }
            if (trimmedLine.startsWith('전문:')) { currentSection = 'full'; continue; }

            if (currentSection === 'summary') {
                if (trimmedLine.startsWith('•') || trimmedLine.startsWith('-') || trimmedLine.startsWith('*')) summary += trimmedLine.replace(/^[•\-*]\s*/, '• ') + '\n';
                else if (summary.length === 0) summary += '• ' + trimmedLine + '\n';
            } else if (currentSection === 'detailed') {
                detailed += '    ' + trimmedLine + '\n\n';
            } else if (currentSection === 'full') {
                fullContent += '    ' + trimmedLine + '\n\n';
            }
        }

        if (!translatedTitle) translatedTitle = result.split('\n').find(line => line.trim()) || '번역된 제목 없음';
        const fallbackDescription = result.substring(0, 500);
        return {
            translatedTitle: translatedTitle,
            summary: summary.trim() || this.createEnhancedSummary({ description: fallbackDescription }),
            detailed: detailed.trim() || this.formatDetailedContent(fallbackDescription),
            fullContent: fullContent.trim() || this.formatFullContent({ description: result })
        };
    }

    updateApiMetrics(apiName, success, duration, errorMessage = null) {
        const metric = this.apiMetrics[apiName];
        if (!metric) return;
        if (success) metric.success++;
        else {
            metric.failure++;
            metric.lastError = errorMessage ? errorMessage.substring(0, 150) : 'Unknown Error';
        }
        metric.totalTime += duration;
    }

    getApiMetricsReport() {
        const report = {};
        Object.entries(this.apiMetrics).forEach(([apiName, metrics]) => {
            const total = metrics.success + metrics.failure;
            report[apiName] = {
                successRate: total > 0 ? Math.round((metrics.success / total) * 100) : 0,
                totalCalls: total,
                avgResponseTime: total > 0 ? Math.round(metrics.totalTime / total) : 0,
                lastError: metrics.lastError
            };
        });
        return report;
    }

    isCacheExpired(key) {
        const cached = this.cache.get(key);
        return !cached || Date.now() - cached.timestamp > this.cacheExpiry;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    containsKeywords(text, keywords) {
        if (!text) return false;
        const lowerText = text.toLowerCase();
        return keywords.some(keyword => lowerText.includes(keyword.toLowerCase()));
    }

    removeDuplicates(articles) {
        const seenIds = new Set();
        const seenTitles = new Set();
        return articles.filter(article => {
            if (seenIds.has(article.id)) return false;
            seenIds.add(article.id);
            const titleKey = article.title.toLowerCase().replace(/\s+/g, '').substring(0, 40);
            if (seenTitles.has(titleKey)) return false;
            seenTitles.add(titleKey);
            return true;
        });
    }

    filterRecentNews(articles, hours = 48) {
        const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
        return articles.filter(article => {
            try {
                const publishedDate = new Date(article.publishedAt);
                return publishedDate >= cutoffTime && publishedDate <= new Date();
            } catch (e) { return false; }
        });
    }

    calculateTimeAgo(publishedAt) {
        try {
            const diffMs = Date.now() - new Date(publishedAt).getTime();
            if (diffMs < 0) return '방금 전';
            const diffMinutes = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            if (diffMinutes < 1) return '방금 전';
            if (diffMinutes < 60) return `${diffMinutes}분 전`;
            if (diffHours < 24) return `${diffHours}시간 전`;
            return `${Math.floor(diffHours / 24)}일 전`;
        } catch (e) {
            return '날짜 정보 없음';
        }
    }

    analyzeAdvancedMarks(content) {
        const marks = [];
        const lowerContent = content.toLowerCase();
        if (this.containsKeywords(lowerContent, ['breaking', 'urgent', 'emergency', 'crisis', 'alert', '긴급', '속보', '위기'])) marks.push('긴급');
        if (this.containsKeywords(lowerContent, ['president', 'government', 'minister', 'important', 'significant', 'major', '대통령', '정부', '장관', '중요'])) marks.push('중요');
        if (this.containsKeywords(lowerContent, ['viral', 'trending', 'popular', 'sensation', '화제', '인기', '트렌드'])) marks.push('Buzz');
        return marks;
    }

    classifyAdvancedCategory(content) {
        const lowerContent = content.toLowerCase();
        if (this.containsKeywords(lowerContent, ['정치', 'politics', 'government', 'president', 'minister', 'election', '국회', '의회'])) return '정치';
        if (this.containsKeywords(lowerContent, ['경제', 'economy', 'business', 'finance', 'market', 'stock', 'trade', '주가', '환율'])) return '경제';
        if (this.containsKeywords(lowerContent, ['기술', 'technology', 'tech', 'ai', 'artificial intelligence', 'innovation', '반도체', 'IT'])) return '기술';
        if (this.containsKeywords(lowerContent, ['과학', 'science', 'research', 'study', 'discovery', 'breakthrough'])) return '과학';
        if (this.containsKeywords(lowerContent, ['문화', 'culture', 'art', 'entertainment', 'movie', 'music', 'K-pop'])) return '문화';
        if (this.containsKeywords(lowerContent, ['건강', 'health', 'medical', 'hospital', 'disease', 'treatment', '의료'])) return '건강';
        if (this.containsKeywords(lowerContent, ['환경', 'environment', 'climate', 'weather', 'disaster', 'earthquake', '기후'])) return '환경';
        if (this.containsKeywords(lowerContent, ['국제', 'international', 'world', 'foreign', '외교', '전쟁'])) return '국제';
        if (this.containsKeywords(lowerContent, ['사회', 'society', 'social', 'community', 'people', '사건'])) return '사회';
        return '일반';
    }

    extractAdvancedKeywords(content) {
        const words = content.toLowerCase().match(/([a-zA-Z]{3,}|[가-힣]{2,})/g) || [];
        const keywordCount = new Map();
        const stopWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'up', 'about', 'into', 'over', 'after'];
        words.forEach(word => {
            if (/[a-zA-Z]/.test(word) && stopWords.includes(word)) return;
            if (word.length >= 2) keywordCount.set(word, (keywordCount.get(word) || 0) + 1);
        });
        return Array.from(keywordCount.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([word]) => word);
    }

    generateAdvancedTrendingKeywords(articles) {
        const keywordCount = new Map();
        const importantKeywords = new Set();
        articles.forEach(article => {
            const content = ((article.translatedTitle || article.title) + ' ' + (article.summary || article.description)).toLowerCase();
            const words = content.match(/([a-zA-Z]{3,}|[가-힣]{2,})/g) || [];
            const weight = article.qualityScore ? Math.max(1, Math.round(article.qualityScore / 25)) : 1;
            words.forEach(word => {
                if (!this.isStopWord(word)) {
                    keywordCount.set(word, (keywordCount.get(word) || 0) + weight);
                    if (this.isImportantKeyword(word)) importantKeywords.add(word);
                }
            });
        });
        return Array.from(keywordCount.entries()).sort((a, b) => {
            const aImportant = importantKeywords.has(a[0]) ? 1 : 0;
            const bImportant = importantKeywords.has(b[0]) ? 1 : 0;
            if (aImportant !== bImportant) return bImportant - aImportant;
            return b[1] - a[1];
        }).slice(0, 12).map(([keyword, count]) => [keyword, Math.min(count, 50)]);
    }

    isImportantKeyword(word) {
        const importantWords = ['president', 'government', 'economy', 'market', 'crisis', 'emergency', 'breaking', 'korea', 'japan', 'china', 'usa', '대통령', '정부', '경제', '위기', '속보', '한국', '일본', '중국', '미국'];
        return importantWords.includes(word.toLowerCase());
    }

    isStopWord(word) {
        const englishStopWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'up', 'about', 'into', 'over', 'after', 'this', 'that', 'these', 'those', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'said', 'says'];
        const koreanStopWords = ['있는', '있는', '하는', '그는', '그녀는', '것은', '것이', '등을', '등의', '관련', '대한', '위해'];
        if (/[a-zA-Z]/.test(word)) return englishStopWords.includes(word.toLowerCase()) || word.length < 3;
        return koreanStopWords.includes(word) || word.length < 2;
    }

    getSourceDisplay(sourceName, publishedAt) {
        const lowerSource = sourceName.toLowerCase().replace(/\s+/g, '-');
        const mappedName = this.premiumSources[lowerSource]?.name || sourceName;
        try {
            return `${mappedName} | ${new Date(publishedAt).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}`;
        } catch (e) {
            return `${mappedName} | 날짜 정보 없음`;
        }
    }

    cleanNaverText(text) {
        return text ? text.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, '').replace(/\s+/g, ' ').trim() : '';
    }

    generateId(url) {
        return crypto.createHash('sha256').update(url).digest('hex').substring(0, 16);
    }

    getDefaultExchangeRates() {
        return {
            USD_KRW: 1380.50,
            JPY_KRW_100: 890.25,
            lastUpdate: new Date().toISOString(),
            source: 'Fallback Default',
            timestamp: Date.now()
        };
    }

    selectHighQualityNews(articles, section) {
        const uniqueArticles = this.removeDuplicates(articles);
        const recentArticles = this.filterRecentNews(uniqueArticles, 48);
        const scoredArticles = recentArticles.map(article => ({ ...article, qualityScore: this.calculateAdvancedQualityScore(article) }));
        scoredArticles.sort((a, b) => b.qualityScore - a.qualityScore);
        return scoredArticles.slice(0, 15);
    }

    calculateAdvancedQualityScore(article) {
        let score = 50;
        const content = (article.title + ' ' + article.description).toLowerCase();
        score += this.getSourceReliabilityScore(article.source?.name);
        let keywordScore = 0;
        Object.values(this.qualityKeywords).forEach(data => {
            if (this.containsKeywords(content, data.keywords)) keywordScore += data.score;
        });
        score += Math.min(30, keywordScore);
        const titleLength = article.title?.length || 0;
        if (titleLength >= 30 && titleLength <= 120) score += 5;
        else if (titleLength < 20 || titleLength > 150) score -= 10;
        const descLength = article.description?.length || 0;
        if (descLength >= 150 && descLength <= 500) score += 10;
        else if (descLength < 80) score -= 15;
        if (article.image && article.image.includes('http')) score += 5;
        try {
            const hoursAgo = (Date.now() - new Date(article.publishedAt).getTime()) / 3600000;
            if (hoursAgo <= 3) score += 15;
            else if (hoursAgo <= 12) score += 8;
        } catch (e) { /* no score on date error */ }
        if (this.containsKeywords(content, ['click', 'viral', 'shocking', 'unbelievable', '충격', '경악', '단독입수'])) score -= 30;
        return Math.max(0, Math.min(100, score));
    }

    getSourceReliabilityScore(sourceName) {
        if (!sourceName) return 0;
        const lowerSource = sourceName.toLowerCase();
        for (const [key, data] of Object.entries(this.premiumSources)) {
            if (lowerSource.includes(key.replace(/-/g, ' ')) || lowerSource.includes(data.name.toLowerCase())) return Math.round(data.score / 5);
        }
        for (const data of Object.values(this.koreanSources)) {
            if (lowerSource.includes(data.name.toLowerCase())) return Math.round(data.score / 5);
        }
        for (const data of Object.values(this.japanSources)) {
            if (lowerSource.includes(data.name.toLowerCase())) return Math.round(data.score / 5);
        }
        if (['times', 'post', 'journal', 'herald', 'tribune', 'guardian'].some(p => lowerSource.includes(p))) return 12;
        return 5;
    }

    getEmergencyNews() {
        const now = new Date().toISOString();
        return {
            sections: {
                world: [{
                    id: 'emergency-1', title: '뉴스 시스템 점검 중', description: '현재 뉴스 수집 시스템에 문제가 발생하여 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.',
                    translatedTitle: '뉴스 시스템 점검 중', summary: '• 뉴스 수집 시스템 오류 발생\n• 데이터 로드 실패\n• 잠시 후 재시도 요청',
                    url: '#', publishedAt: now, source: { name: 'EmarkNews System', display: `EmarkNews System | ${new Date(now).toLocaleTimeString()}` },
                    stars: 1, category: '시스템', timeAgo: '방금 전',
                    mobileOptimized: { title: '시스템 점검 중', shortDesc: '데이터 로드 실패. 잠시 후 재시도해주세요.', tags: ['시스템', '오류'] }
                }],
                korea: [], japan: [], buzz: []
            },
            trending: [['점검중', 20], ['오류발생', 15]],
            exchangeRates: this.getDefaultExchangeRates(),
            systemStatus: {
                version: '16.0.0-x-integrated', lastUpdate: now, features: ['emergency-mode'], apiMetrics: this.getApiMetricsReport()
            }
        };
    }
    
    // *** Rate Limit 체크 함수 수정 (X API 주기 반영)
    checkRateLimit(apiName) {
        const limit = this.rateLimits[apiName];
        if (!limit) return true;

        const now = Date.now();
        let resetInterval;

        switch (apiName) {
            case 'newsApi':
                resetInterval = 3600000; // 1시간
                break;
            case 'xApi':
                resetInterval = 15 * 60000; // 15분
                break;
            default:
                resetInterval = 60000; // 1분 (Naver, AI)
        }

        if (now > limit.resetTime) {
            limit.requests = 0;
            limit.resetTime = now + resetInterval;
        }

        if (limit.requests >= limit.maxRequests) {
            console.warn(`⚠️ ${apiName} API Rate Limit 도달`);
            return false;
        }

        limit.requests++;
        return true;
    }

    getSystemStatus() {
        return {
            status: 'running',
            version: '16.0.0-x-integrated',
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            lastUpdate: this.lastUpdate,
            cacheSize: this.cache.size,
            isUpdating: this.isUpdating,
            updateCounter: this.updateCounter,
            features: [
               'performance-optimization',
               'parallel-news-fetching',
               'parallel-translation-processing',
               'robust-caching-with-promise-reuse',
               'x-api-trends-integration',
               'improved-error-handling-and-retry',
               'optimized-api-timeouts',
               'enhanced-translation-prompts',
               'enhanced-ui-formatting'
            ],
            apiMetrics: this.getApiMetricsReport(),
            rateLimits: this.rateLimits,
        };
    }
}

module.exports = EnhancedNewsSystemXIntegrated;