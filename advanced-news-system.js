const axios = require('axios');
const cheerio = require('cheerio');

class RobustNewsSystemWithMonitoring {
    constructor() {
        this.cache = new Map();
        this.cacheExpiry = 10 * 60 * 1000; // 10분
        this.lastUpdate = null;
        this.isUpdating = false;
        
        // API 모니터링 시스템
        this.apiMetrics = {
            naver: { calls: 0, errors: 0, lastError: null, rateLimitHits: 0 },
            newsApi: { calls: 0, errors: 0, lastError: null, rateLimitHits: 0 },
            openAi: { calls: 0, errors: 0, lastError: null, rateLimitHits: 0 },
            skyworkAi: { calls: 0, errors: 0, lastError: null, rateLimitHits: 0 },
            xApi: { calls: 0, errors: 0, lastError: null, rateLimitHits: 0 }
        };
        
        // API 설정
        this.apis = {
            newsApi: process.env.NEWS_API_KEY || '44d9347a149b40ad87b3deb8bba95183',
            openAi: process.env.OPENAI_API_KEY,
            skyworkAi: process.env.SKYWORK_API_KEY,
            xApi: process.env.X_API_KEY || '0E6c9hk1rPnoJiQBzaRX5owAH',
            naverClientId: process.env.NAVER_CLIENT_ID || '4lsPsi_je8UoGGcfTP1w',
            naverClientSecret: process.env.NAVER_CLIENT_SECRET || 'J3BHRgyWPc'
        };

        // Rate Limiting 설정
        this.rateLimits = {
            naver: { maxCalls: 25000, window: 24 * 60 * 60 * 1000, calls: [], lastReset: Date.now() },
            newsApi: { maxCalls: 1000, window: 24 * 60 * 60 * 1000, calls: [], lastReset: Date.now() },
            openAi: { maxCalls: 3000, window: 60 * 60 * 1000, calls: [], lastReset: Date.now() },
            skyworkAi: { maxCalls: 1000, window: 60 * 60 * 1000, calls: [], lastReset: Date.now() }
        };

        // Exponential Backoff 설정
        this.backoffConfig = {
            initialDelay: 1000,
            maxDelay: 30000,
            multiplier: 2,
            maxRetries: 5
        };

        // 뉴스 소스 매핑
        this.sourceMapping = {
            'bbc-news': 'BBC News',
            'cnn': 'CNN',
            'reuters': 'Reuters',
            'associated-press': 'AP 통신',
            'the-guardian-uk': 'The Guardian',
            'the-new-york-times': 'New York Times',
            'bloomberg': 'Bloomberg',
            'japan-times': 'Japan Times',
            'nhk-world': 'NHK World',
            'asahi-shimbun': '아사히신문',
            'yonhap-news-agency': '연합뉴스'
        };

        // 키워드 분류 (개선된 일본 키워드)
        this.keywords = {
            urgent: ['긴급', '속보', '발생', '사고', '재해', '위기', 'breaking', 'urgent', 'alert', 'emergency'],
            important: ['중요', '발표', '결정', '승인', '합의', 'important', 'significant', 'major', 'key'],
            buzz: ['화제', '인기', '트렌드', '바이럴', '논란', 'viral', 'trending', 'popular', 'buzz'],
            
            korea: ['한국', '서울', '부산', '대구', '인천', '광주', '대전', 'korea', 'seoul', 'korean', 'south korea'],
            japan: ['일본', '도쿄', '오사카', '교토', '요코하마', '나고야', '오타니', '쇼헤이', 'japan', 'tokyo', 'japanese', 'ohtani', 'shohei', 'osaka', 'kyoto'],
            japanSports: ['오타니', '쇼헤이', '다르비시', '마에다', '스즈키', 'ohtani', 'shohei', 'darvish', 'maeda', 'suzuki', 'yamamoto']
        };

        console.log('🚀 RobustNewsSystemWithMonitoring 초기화 완료');
    }

    // 메인 뉴스 수집 함수 (강화된 오류 처리)
    async getNews(forceRefresh = false, timestamp = null) {
        const cacheKey = 'news_data';
        
        if (forceRefresh || timestamp || !this.cache.has(cacheKey) || this.isCacheExpired(cacheKey)) {
            console.log('🔄 뉴스 데이터 새로 수집 중...', forceRefresh ? '(강제 새로고침)' : '');
            
            if (this.isUpdating && !forceRefresh) {
                console.log('⚠️ 이미 업데이트 중입니다.');
                return this.cache.get(cacheKey)?.data || this.getDefaultNews();
            }

            this.isUpdating = true;
            
            try {
                const newsData = await this.collectAllNewsWithErrorHandling();
                
                this.cache.set(cacheKey, {
                    data: newsData,
                    timestamp: Date.now()
                });
                
                this.lastUpdate = new Date().toISOString();
                console.log('✅ 뉴스 데이터 수집 완료');
                
                return newsData;
            } catch (error) {
                console.error('❌ 뉴스 수집 실패:', error);
                this.logApiError('system', error);
                return this.cache.get(cacheKey)?.data || this.getDefaultNews();
            } finally {
                this.isUpdating = false;
            }
        }

        return this.cache.get(cacheKey).data;
    }

    // 강화된 뉴스 수집 (오류 처리 포함)
    async collectAllNewsWithErrorHandling() {
        console.log('📡 강화된 다중 소스 뉴스 수집 시작...');
        
        const results = await Promise.allSettled([
            this.fetchWorldNewsRobust(),
            this.fetchKoreaNewsRobust(),
            this.fetchJapanNewsRobust()
        ]);

        let worldNews = [];
        let koreaNews = [];
        let japanNews = [];

        // 결과 처리
        if (results[0].status === 'fulfilled') {
            worldNews = results[0].value;
        } else {
            console.error('❌ 세계뉴스 수집 실패:', results[0].reason);
            worldNews = this.getDefaultWorldNews();
        }

        if (results[1].status === 'fulfilled') {
            koreaNews = results[1].value;
        } else {
            console.error('❌ 한국뉴스 수집 실패:', results[1].reason);
            koreaNews = this.getDefaultKoreaNews();
        }

        if (results[2].status === 'fulfilled') {
            japanNews = results[2].value;
        } else {
            console.error('❌ 일본뉴스 수집 실패:', results[2].reason);
            japanNews = this.getDefaultJapanNews();
        }

        // 트렌딩 키워드 생성
        const trending = await this.generateTrendingKeywordsRobust([...worldNews, ...koreaNews, ...japanNews]);

        const result = {
            sections: {
                world: worldNews.slice(0, 15),
                korea: koreaNews.slice(0, 15),
                japan: japanNews.slice(0, 15)
            },
            trending,
            systemStatus: {
                version: '8.1.0-error-fixed',
                lastUpdate: this.lastUpdate,
                cacheSize: this.cache.size,
                features: ['error-recovery', 'exponential-backoff', 'api-monitoring', 'rate-limiting'],
                apiMetrics: this.getApiMetricsSummary(),
                apiSources: {
                    newsApi: !!this.apis.newsApi,
                    naverApi: !!(this.apis.naverClientId && this.apis.naverClientSecret),
                    xApi: !!this.apis.xApi,
                    openAi: !!this.apis.openAi,
                    skyworkAi: !!this.apis.skyworkAi
                }
            }
        };

        console.log('📊 수집 완료 (오류 복구 포함):', {
            world: result.sections.world.length,
            korea: result.sections.korea.length,
            japan: result.sections.japan.length,
            trending: result.trending.length
        });

        return result;
    }

    // Exponential Backoff를 적용한 API 호출
    async makeRobustApiCall(apiName, requestFunction, ...args) {
        let delay = this.backoffConfig.initialDelay;
        let lastError = null;

        for (let attempt = 1; attempt <= this.backoffConfig.maxRetries; attempt++) {
            try {
                // Rate Limit 확인
                if (!this.checkRateLimit(apiName)) {
                    throw new Error(`Rate limit exceeded for ${apiName}`);
                }

                const startTime = Date.now();
                const result = await requestFunction(...args);
                const responseTime = Date.now() - startTime;

                // 성공 로깅
                this.logApiSuccess(apiName, responseTime);
                return result;

            } catch (error) {
                lastError = error;
                const responseTime = Date.now() - (Date.now() - delay);
                
                // 오류 로깅
                this.logApiError(apiName, error, responseTime);

                // 429 (Rate Limit) 오류 특별 처리
                if (error.response?.status === 429) {
                    console.log(`⏳ ${apiName} Rate Limit 도달, 대기 중... (시도 ${attempt}/${this.backoffConfig.maxRetries})`);
                    this.apiMetrics[apiName].rateLimitHits++;
                    delay = Math.min(delay * 3, 60000); // Rate Limit의 경우 더 긴 대기
                } 
                // 400 오류 (잘못된 요청) - 재시도하지 않음
                else if (error.response?.status === 400) {
                    console.error(`❌ ${apiName} 잘못된 요청 (400):`, error.response.data);
                    throw error; // 400 오류는 재시도해도 소용없음
                }
                // 503, 502, 500 등 서버 오류
                else if (error.response?.status >= 500) {
                    console.log(`🔄 ${apiName} 서버 오류 (${error.response.status}), 재시도 중... (시도 ${attempt}/${this.backoffConfig.maxRetries})`);
                }
                // 네트워크 오류
                else if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
                    console.log(`🌐 ${apiName} 네트워크 오류, 재시도 중... (시도 ${attempt}/${this.backoffConfig.maxRetries})`);
                }

                // 마지막 시도가 아니면 대기
                if (attempt < this.backoffConfig.maxRetries) {
                    console.log(`⏱️ ${delay}ms 대기 후 재시도...`);
                    await this.sleep(delay);
                    delay = Math.min(delay * this.backoffConfig.multiplier, this.backoffConfig.maxDelay);
                }
            }
        }

        throw lastError;
    }

    // 강화된 세계뉴스 수집
    async fetchWorldNewsRobust() {
        const sources = [
            { endpoint: 'top-headlines', params: { category: 'general', language: 'en', pageSize: 20 } },
            { endpoint: 'everything', params: { q: 'world OR global OR international', language: 'en', pageSize: 15, sortBy: 'publishedAt' } },
            { endpoint: 'top-headlines', params: { category: 'business', language: 'en', pageSize: 10 } }
        ];

        let allArticles = [];
        
        for (const source of sources) {
            try {
                const articles = await this.makeRobustApiCall('newsApi', this.fetchFromNewsAPI.bind(this), source.endpoint, source.params);
                allArticles = allArticles.concat(articles);
            } catch (error) {
                console.error(`❌ 세계뉴스 수집 실패 (${source.endpoint}):`, error.message);
                // 하나의 소스가 실패해도 계속 진행
            }
        }

        if (allArticles.length === 0) {
            console.log('⚠️ 모든 세계뉴스 소스 실패, 기본 데이터 사용');
            return this.getDefaultWorldNews();
        }

        const uniqueArticles = this.removeDuplicates(allArticles);
        const recentArticles = this.filterRecentNews(uniqueArticles);
        const processedArticles = await this.processArticlesForMobileRobust(recentArticles, 'world');

        return processedArticles.slice(0, 12);
    }

    // 강화된 한국뉴스 수집 (Naver API 429 오류 해결)
    async fetchKoreaNewsRobust() {
        let allArticles = [];

        // Naver API 수집 (429 오류 대응)
        try {
            const naverArticles = await this.makeRobustApiCall('naver', this.fetchFromNaverAPIRobust.bind(this));
            allArticles = allArticles.concat(naverArticles);
        } catch (error) {
            console.error('❌ Naver API 수집 실패:', error.message);
            // Naver 실패 시 NewsAPI로 대체
        }

        // NewsAPI에서 한국 관련 뉴스 수집 (백업)
        const newsApiSources = [
            { endpoint: 'everything', params: { q: 'Korea OR Korean OR Seoul', language: 'en', pageSize: 15, sortBy: 'publishedAt' } }
        ];

        for (const source of newsApiSources) {
            try {
                const articles = await this.makeRobustApiCall('newsApi', this.fetchFromNewsAPI.bind(this), source.endpoint, source.params);
                const koreanArticles = articles.filter(article => 
                    this.containsKeywords(article.title + ' ' + article.description, this.keywords.korea)
                );
                allArticles = allArticles.concat(koreanArticles);
            } catch (error) {
                console.error(`❌ 한국뉴스 NewsAPI 수집 실패:`, error.message);
            }
        }

        if (allArticles.length === 0) {
            console.log('⚠️ 모든 한국뉴스 소스 실패, 기본 데이터 사용');
            return this.getDefaultKoreaNews();
        }

        const uniqueArticles = this.removeDuplicates(allArticles);
        const recentArticles = this.filterRecentNews(uniqueArticles);
        const processedArticles = await this.processArticlesForMobileRobust(recentArticles, 'korea');

        return processedArticles.slice(0, 12);
    }

    // 강화된 일본뉴스 수집 (400 오류 해결)
    async fetchJapanNewsRobust() {
        // 400 오류 방지를 위한 검증된 파라미터 사용
        const sources = [
            { 
                endpoint: 'everything', 
                params: { 
                    q: 'Japan OR Japanese OR Tokyo OR Ohtani', 
                    language: 'en', 
                    pageSize: 20, 
                    sortBy: 'publishedAt',
                    from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 7일 전부터
                } 
            },
            { 
                endpoint: 'top-headlines', 
                params: { 
                    country: 'jp', 
                    pageSize: 15 
                } 
            }
        ];

        let allArticles = [];
        
        for (const source of sources) {
            try {
                // 파라미터 검증
                const validatedParams = this.validateNewsApiParams(source.params);
                console.log(`📝 일본뉴스 요청 파라미터:`, JSON.stringify(validatedParams, null, 2));
                
                const articles = await this.makeRobustApiCall('newsApi', this.fetchFromNewsAPI.bind(this), source.endpoint, validatedParams);
                
                // 일본 관련 키워드로 필터링
                const japanArticles = articles.filter(article => {
                    const content = (article.title + ' ' + article.description).toLowerCase();
                    return this.containsKeywords(content, this.keywords.japan) || 
                           this.containsKeywords(content, this.keywords.japanSports);
                });
                
                allArticles = allArticles.concat(japanArticles);
                console.log(`✅ 일본뉴스 수집 성공 (${source.endpoint}): ${japanArticles.length}개`);
                
            } catch (error) {
                console.error(`❌ 일본뉴스 수집 실패 (${source.endpoint}):`, error.message);
                if (error.response?.status === 400) {
                    console.error('📋 400 오류 상세:', error.response.data);
                }
            }
        }

        if (allArticles.length === 0) {
            console.log('⚠️ 모든 일본뉴스 소스 실패, 기본 데이터 사용');
            return this.getDefaultJapanNews();
        }

        const uniqueArticles = this.removeDuplicates(allArticles);
        const recentArticles = this.filterRecentNews(uniqueArticles);
        const processedArticles = await this.processArticlesForMobileRobust(recentArticles, 'japan');

        return processedArticles.slice(0, 12);
    }

    // NewsAPI 파라미터 검증 (400 오류 방지)
    validateNewsApiParams(params) {
        const validated = { ...params };
        
        // 필수 파라미터 확인
        if (!validated.q && !validated.sources && !validated.country && !validated.category) {
            validated.q = 'news'; // 기본 쿼리
        }
        
        // 쿼리 길이 제한 (500자)
        if (validated.q && validated.q.length > 500) {
            validated.q = validated.q.substring(0, 500);
        }
        
        // pageSize 제한 (1-100)
        if (validated.pageSize) {
            validated.pageSize = Math.min(Math.max(validated.pageSize, 1), 100);
        }
        
        // 날짜 형식 검증
        if (validated.from && !this.isValidDate(validated.from)) {
            delete validated.from;
        }
        if (validated.to && !this.isValidDate(validated.to)) {
            delete validated.to;
        }
        
        // 언어 코드 검증
        const validLanguages = ['ar', 'de', 'en', 'es', 'fr', 'he', 'it', 'nl', 'no', 'pt', 'ru', 'sv', 'ud', 'zh'];
        if (validated.language && !validLanguages.includes(validated.language)) {
            validated.language = 'en';
        }
        
        return validated;
    }

    // 강화된 Naver API 호출 (429 오류 대응)
    async fetchFromNaverAPIRobust() {
        const queries = ['한국', '정치', '경제', '사회', '국제'];
        let allArticles = [];

        for (const query of queries) {
            try {
                const articles = await this.makeRobustApiCall('naver', this.fetchNaverQuery.bind(this), query);
                allArticles = allArticles.concat(articles);
                
                // Rate Limit 방지를 위한 대기
                await this.sleep(200);
                
            } catch (error) {
                console.error(`❌ Naver API 쿼리 실패 (${query}):`, error.message);
                if (error.response?.status === 429) {
                    console.log('⏳ Naver API Rate Limit, 더 긴 대기...');
                    await this.sleep(5000); // 5초 대기
                }
            }
        }

        return allArticles;
    }

    // 개별 Naver 쿼리 실행
    async fetchNaverQuery(query) {
        const url = 'https://openapi.naver.com/v1/search/news.json';
        const params = {
            query: query,
            display: 10,
            start: 1,
            sort: 'date'
        };

        const response = await axios.get(url, {
            params,
            headers: {
                'X-Naver-Client-Id': this.apis.naverClientId,
                'X-Naver-Client-Secret': this.apis.naverClientSecret
            },
            timeout: 10000
        });

        return response.data.items.map(item => ({
            title: this.cleanHtml(item.title),
            description: this.cleanHtml(item.description),
            url: item.link,
            publishedAt: item.pubDate,
            source: { name: '네이버뉴스' },
            urlToImage: null
        }));
    }

    // NewsAPI 호출
    async fetchFromNewsAPI(endpoint, params) {
        const url = `https://newsapi.org/v2/${endpoint}`;
        
        const response = await axios.get(url, {
            params: {
                ...params,
                apiKey: this.apis.newsApi
            },
            timeout: 15000
        });

        if (response.data.status !== 'ok') {
            throw new Error(`NewsAPI Error: ${response.data.message}`);
        }

        return response.data.articles || [];
    }

    // 강화된 기사 처리
    async processArticlesForMobileRobust(articles, section) {
        const processed = [];
        
        for (const article of articles) {
            try {
                const processedArticle = await this.processArticleRobust(article, section);
                if (processedArticle) {
                    processed.push(processedArticle);
                }
            } catch (error) {
                console.error('❌ 기사 처리 실패:', error.message);
                // 처리 실패한 기사는 기본 형태로 추가
                processed.push(this.createFallbackArticle(article, section));
            }
        }

        return processed;
    }

    // 강화된 개별 기사 처리
    async processArticleRobust(article, section) {
        const marks = this.generateMarks(article);
        const category = this.categorizeNews(article);
        const qualityScore = this.calculateQualityScore(article);
        
        let summary = article.description || article.title;
        
        // AI 번역 시도 (실패 시 기본 처리)
        try {
            if (this.apis.openAi) {
                summary = await this.makeRobustApiCall('openAi', this.translateWithOpenAI.bind(this), summary);
            } else if (this.apis.skyworkAi) {
                summary = await this.makeRobustApiCall('skyworkAi', this.translateWithSkywork.bind(this), summary);
            }
        } catch (error) {
            console.error('❌ AI 번역 실패, 기본 처리 사용:', error.message);
            summary = this.basicTranslate(summary);
        }

        return {
            title: this.cleanText(article.title),
            summary: this.formatSummary(summary),
            url: this.mapToRealUrl(article.url, article.source?.name),
            publishedAt: this.formatDate(article.publishedAt),
            source: this.mapSource(article.source?.name),
            marks,
            category,
            qualityScore,
            section
        };
    }

    // OpenAI 번역
    async translateWithOpenAI(text) {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-3.5-turbo',
            messages: [{
                role: 'user',
                content: `다음 뉴스를 한국어로 번역하고 3-5개의 핵심 포인트로 요약해주세요. 각 포인트는 "• "로 시작하세요:\n\n${text}`
            }],
            max_tokens: 300,
            temperature: 0.3
        }, {
            headers: {
                'Authorization': `Bearer ${this.apis.openAi}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });

        return response.data.choices[0].message.content;
    }

    // Skywork AI 번역
    async translateWithSkywork(text) {
        const response = await axios.post('https://api.skywork.ai/v1/chat/completions', {
            model: 'skywork-lite',
            messages: [{
                role: 'user',
                content: `다음 뉴스를 한국어로 번역하고 3-5개의 핵심 포인트로 요약해주세요:\n\n${text}`
            }],
            max_tokens: 300
        }, {
            headers: {
                'Authorization': `Bearer ${this.apis.skyworkAi}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });

        return response.data.choices[0].message.content;
    }

    // 강화된 트렌딩 키워드 생성
    async generateTrendingKeywordsRobust(articles) {
        try {
            const keywords = this.extractKeywords(articles);
            const scored = this.scoreKeywords(keywords, articles);
            return scored.slice(0, 10);
        } catch (error) {
            console.error('❌ 트렌딩 키워드 생성 실패:', error);
            return this.getDefaultTrendingKeywords();
        }
    }

    // Rate Limit 확인
    checkRateLimit(apiName) {
        const limit = this.rateLimits[apiName];
        if (!limit) return true;

        const now = Date.now();
        
        // 윈도우 리셋 확인
        if (now - limit.lastReset > limit.window) {
            limit.calls = [];
            limit.lastReset = now;
        }

        // 현재 윈도우 내 호출 수 확인
        limit.calls = limit.calls.filter(callTime => now - callTime < limit.window);
        
        if (limit.calls.length >= limit.maxCalls) {
            return false;
        }

        limit.calls.push(now);
        return true;
    }

    // API 성공 로깅
    logApiSuccess(apiName, responseTime) {
        if (this.apiMetrics[apiName]) {
            this.apiMetrics[apiName].calls++;
        }
        console.log(`✅ ${apiName} API 성공 (${responseTime}ms)`);
    }

    // API 오류 로깅
    logApiError(apiName, error, responseTime = 0) {
        if (this.apiMetrics[apiName]) {
            this.apiMetrics[apiName].errors++;
            this.apiMetrics[apiName].lastError = {
                message: error.message,
                status: error.response?.status,
                timestamp: new Date().toISOString()
            };
        }
        console.error(`❌ ${apiName} API 오류 (${responseTime}ms):`, error.message);
    }

    // API 메트릭 요약
    getApiMetricsSummary() {
        const summary = {};
        for (const [api, metrics] of Object.entries(this.apiMetrics)) {
            summary[api] = {
                successRate: metrics.calls > 0 ? ((metrics.calls - metrics.errors) / metrics.calls * 100).toFixed(1) + '%' : '0%',
                totalCalls: metrics.calls,
                totalErrors: metrics.errors,
                rateLimitHits: metrics.rateLimitHits,
                lastError: metrics.lastError?.message || null
            };
        }
        return summary;
    }

    // 기본 뉴스 데이터 (모든 소스 실패 시)
    getDefaultNews() {
        return {
            sections: {
                world: this.getDefaultWorldNews(),
                korea: this.getDefaultKoreaNews(),
                japan: this.getDefaultJapanNews()
            },
            trending: this.getDefaultTrendingKeywords(),
            systemStatus: {
                version: '8.1.0-error-fixed',
                lastUpdate: new Date().toISOString(),
                cacheSize: 0,
                features: ['error-recovery', 'fallback-data'],
                apiMetrics: this.getApiMetricsSummary(),
                apiSources: {
                    newsApi: !!this.apis.newsApi,
                    naverApi: !!(this.apis.naverClientId && this.apis.naverClientSecret),
                    xApi: !!this.apis.xApi,
                    openAi: !!this.apis.openAi,
                    skyworkAi: !!this.apis.skyworkAi
                }
            }
        };
    }

    getDefaultWorldNews() {
        return [
            {
                title: "글로벌 경제 동향 분석",
                summary: "• 주요 경제 지표 발표 예정\n• 국제 금융 시장 변동성 지속\n• 각국 중앙은행 정책 주목",
                url: "https://www.reuters.com",
                publishedAt: "방금 전",
                source: "Reuters",
                marks: ["중요"],
                category: "경제",
                qualityScore: 4,
                section: "world"
            },
            {
                title: "기후변화 대응 국제회의",
                summary: "• 탄소중립 목표 달성 방안 논의\n• 재생에너지 투자 확대 합의\n• 개발도상국 지원 방안 검토",
                url: "https://www.bbc.com",
                publishedAt: "1시간 전",
                source: "BBC News",
                marks: ["중요"],
                category: "환경",
                qualityScore: 5,
                section: "world"
            }
        ];
    }

    getDefaultKoreaNews() {
        return [
            {
                title: "한국 경제 성장률 전망",
                summary: "• 올해 경제성장률 예측 발표\n• 내수 회복세 지속 전망\n• 수출 증가율 둔화 우려",
                url: "https://www.yonhapnews.co.kr",
                publishedAt: "30분 전",
                source: "연합뉴스",
                marks: ["중요"],
                category: "경제",
                qualityScore: 4,
                section: "korea"
            },
            {
                title: "디지털 혁신 정책 발표",
                summary: "• AI 산업 육성 방안 공개\n• 디지털 인프라 투자 확대\n• 스타트업 지원 정책 강화",
                url: "https://www.kbs.co.kr",
                publishedAt: "2시간 전",
                source: "KBS",
                marks: ["중요"],
                category: "기술",
                qualityScore: 4,
                section: "korea"
            }
        ];
    }

    getDefaultJapanNews() {
        return [
            {
                title: "일본 경제 회복 신호",
                summary: "• 제조업 생산지수 상승\n• 소비자 신뢰도 개선\n• 관광업 회복세 지속",
                url: "https://www3.nhk.or.jp",
                publishedAt: "1시간 전",
                source: "NHK World",
                marks: ["중요"],
                category: "경제",
                qualityScore: 4,
                section: "japan"
            },
            {
                title: "오타니 쇼헤이 시즌 성과",
                summary: "• 투타 양면에서 뛰어난 활약\n• MVP 후보로 거론\n• 팬들의 뜨거운 관심 지속",
                url: "https://www.asahi.com",
                publishedAt: "3시간 전",
                source: "아사히신문",
                marks: ["Buzz", "중요"],
                category: "스포츠",
                qualityScore: 5,
                section: "japan"
            }
        ];
    }

    getDefaultTrendingKeywords() {
        return [
            { keyword: "경제성장", score: 25 },
            { keyword: "디지털혁신", score: 22 },
            { keyword: "기후변화", score: 20 },
            { keyword: "오타니", score: 18 },
            { keyword: "AI기술", score: 15 },
            { keyword: "국제회의", score: 12 },
            { keyword: "투자확대", score: 10 },
            { keyword: "정책발표", score: 8 },
            { keyword: "시장동향", score: 6 },
            { keyword: "혁신기술", score: 4 }
        ];
    }

    // 유틸리티 함수들
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    isValidDate(dateString) {
        const date = new Date(dateString);
        return date instanceof Date && !isNaN(date);
    }

    isCacheExpired(key) {
        const cached = this.cache.get(key);
        return !cached || (Date.now() - cached.timestamp) > this.cacheExpiry;
    }

    cleanHtml(text) {
        return text.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').trim();
    }

    cleanText(text) {
        return text.replace(/\*\*/g, '').trim();
    }

    containsKeywords(text, keywords) {
        const lowerText = text.toLowerCase();
        return keywords.some(keyword => lowerText.includes(keyword.toLowerCase()));
    }

    generateMarks(article) {
        const marks = [];
        const content = (article.title + ' ' + article.description).toLowerCase();
        
        if (this.containsKeywords(content, this.keywords.urgent)) marks.push('긴급');
        if (this.containsKeywords(content, this.keywords.important)) marks.push('중요');
        if (this.containsKeywords(content, this.keywords.buzz)) marks.push('Buzz');
        
        return marks.length > 0 ? marks : ['중요'];
    }

    categorizeNews(article) {
        const content = (article.title + ' ' + article.description).toLowerCase();
        
        if (content.includes('economy') || content.includes('경제') || content.includes('market')) return '경제';
        if (content.includes('politics') || content.includes('정치') || content.includes('government')) return '정치';
        if (content.includes('technology') || content.includes('기술') || content.includes('ai')) return '기술';
        if (content.includes('sports') || content.includes('스포츠') || content.includes('오타니')) return '스포츠';
        if (content.includes('culture') || content.includes('문화') || content.includes('entertainment')) return '문화';
        
        return '사회';
    }

    calculateQualityScore(article) {
        let score = 3; // 기본 점수
        
        if (article.description && article.description.length > 100) score++;
        if (article.urlToImage) score++;
        if (article.source?.name && this.sourceMapping[article.source.name]) score++;
        
        return Math.min(score, 5);
    }

    formatSummary(summary) {
        if (!summary) return '• 상세 내용을 확인해주세요';
        
        // 이미 포맷된 경우
        if (summary.includes('•')) return summary;
        
        // 기본 포맷팅
        const sentences = summary.split(/[.!?]/).filter(s => s.trim().length > 10);
        return sentences.slice(0, 3).map(s => `• ${s.trim()}`).join('\n');
    }

    formatDate(dateString) {
        try {
            const date = new Date(dateString);
            const now = new Date();
            const diffMs = now - date;
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            
            if (diffHours < 1) return '방금 전';
            if (diffHours < 24) return `${diffHours}시간 전`;
            
            const diffDays = Math.floor(diffHours / 24);
            if (diffDays < 7) return `${diffDays}일 전`;
            
            return date.toLocaleDateString('ko-KR');
        } catch {
            return '최근';
        }
    }

    mapSource(sourceName) {
        return this.sourceMapping[sourceName] || sourceName || '뉴스 소스';
    }

    mapToRealUrl(url, sourceName) {
        const realUrls = {
            'BBC News': 'https://www.bbc.com',
            'CNN': 'https://www.cnn.com',
            'Reuters': 'https://www.reuters.com',
            'AP 통신': 'https://apnews.com',
            'The Guardian': 'https://www.theguardian.com',
            'New York Times': 'https://www.nytimes.com',
            'Bloomberg': 'https://www.bloomberg.com',
            'Japan Times': 'https://www.japantimes.co.jp',
            'NHK World': 'https://www3.nhk.or.jp',
            '아사히신문': 'https://www.asahi.com',
            '연합뉴스': 'https://www.yonhapnews.co.kr',
            '네이버뉴스': 'https://news.naver.com'
        };
        
        return realUrls[sourceName] || url || '#';
    }

    removeDuplicates(articles) {
        const seen = new Set();
        return articles.filter(article => {
            const key = article.title.toLowerCase().substring(0, 50);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    filterRecentNews(articles) {
        const twoDaysAgo = Date.now() - (2 * 24 * 60 * 60 * 1000);
        return articles.filter(article => {
            try {
                return new Date(article.publishedAt).getTime() > twoDaysAgo;
            } catch {
                return true; // 날짜 파싱 실패 시 포함
            }
        });
    }

    extractKeywords(articles) {
        const keywords = new Map();
        
        articles.forEach(article => {
            const text = (article.title + ' ' + article.description).toLowerCase();
            const words = text.match(/[가-힣a-z]{2,}/g) || [];
            
            words.forEach(word => {
                if (word.length > 1 && !this.isStopWord(word)) {
                    keywords.set(word, (keywords.get(word) || 0) + 1);
                }
            });
        });
        
        return keywords;
    }

    scoreKeywords(keywords, articles) {
        const scored = [];
        
        for (const [keyword, count] of keywords.entries()) {
            let score = count;
            
            // 중요 키워드 가중치
            if (this.keywords.urgent.includes(keyword)) score *= 2;
            if (this.keywords.important.includes(keyword)) score *= 1.5;
            if (this.keywords.buzz.includes(keyword)) score *= 1.8;
            
            scored.push({ keyword, score });
        }
        
        return scored.sort((a, b) => b.score - a.score);
    }

    isStopWord(word) {
        const stopWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', '이', '가', '을', '를', '에', '의', '와', '과', '도', '는', '은'];
        return stopWords.includes(word);
    }

    basicTranslate(text) {
        // 기본 키워드 번역
        const translations = {
            'breaking': '속보',
            'urgent': '긴급',
            'important': '중요',
            'economy': '경제',
            'politics': '정치',
            'technology': '기술',
            'sports': '스포츠',
            'culture': '문화'
        };
        
        let translated = text;
        for (const [en, ko] of Object.entries(translations)) {
            translated = translated.replace(new RegExp(en, 'gi'), ko);
        }
        
        return translated;
    }

    createFallbackArticle(article, section) {
        return {
            title: this.cleanText(article.title || '제목 없음'),
            summary: '• 상세 내용을 확인해주세요',
            url: article.url || '#',
            publishedAt: this.formatDate(article.publishedAt),
            source: this.mapSource(article.source?.name),
            marks: ['중요'],
            category: '일반',
            qualityScore: 3,
            section
        };
    }

    // 메인 메서드 (server.js에서 호출)
    async collectAllNews() {
        return await this.getNews();
    }
}

module.exports = RobustNewsSystemWithMonitoring;

