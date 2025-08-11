
const axios = require('axios');
const cheerio = require('cheerio');

class EmergencyFixedNewsSystem {
    constructor() {
        this.cache = new Map();
        this.cacheExpiry = 10 * 60 * 1000; // 10분
        this.lastUpdate = null;
        this.isUpdating = false;
        
        // API 설정
        this.apis = {
            newsApi: process.env.NEWS_API_KEY || '44d9347a149b40ad87b3deb8bba95183',
            openAi: process.env.OPENAI_API_KEY,
            skyworkAi: process.env.SKYWORK_API_KEY,
            naverClientId: process.env.NAVER_CLIENT_ID || '4lsPsi_je8UoGGcfTP1w',
            naverClientSecret: process.env.NAVER_CLIENT_SECRET || 'J3BHRgyWPc'
        };

        // API 메트릭
        this.apiMetrics = {
            newsApi: { success: 0, failure: 0, totalTime: 0, lastError: null },
            naverApi: { success: 0, failure: 0, totalTime: 0, lastError: null },
            openAi: { success: 0, failure: 0, totalTime: 0, lastError: null },
            skyworkAi: { success: 0, failure: 0, totalTime: 0, lastError: null },
            exchangeApi: { success: 0, failure: 0, totalTime: 0, lastError: null }
        };

        // Rate Limiting
        this.rateLimits = {
            naver: { requests: 0, resetTime: Date.now() + 60000, maxRequests: 15 },
            newsApi: { requests: 0, resetTime: Date.now() + 3600000, maxRequests: 500 },
            openAi: { requests: 0, resetTime: Date.now() + 60000, maxRequests: 30 },
            skywork: { requests: 0, resetTime: Date.now() + 60000, maxRequests: 50 }
        };

        // 기본 번역 사전
        this.translations = {
            'breaking': '속보', 'news': '뉴스', 'update': '업데이트', 'report': '보고서',
            'government': '정부', 'president': '대통령', 'company': '회사', 'market': '시장',
            'economy': '경제', 'business': '비즈니스', 'technology': '기술', 'science': '과학',
            'sports': '스포츠', 'politics': '정치', 'world': '세계', 'japan': '일본',
            'korea': '한국', 'ohtani': '오타니', 'shohei': '쇼헤이', 'baseball': '야구',
            'mlb': 'MLB', 'dodgers': '다저스', 'tokyo': '도쿄', 'seoul': '서울'
        };

        // 키워드 분류
        this.keywords = {
            urgent: ['긴급', '속보', '발생', '사고', '재해', 'breaking', 'urgent', 'emergency'],
            important: ['중요', '발표', '결정', '승인', 'important', 'significant', 'major'],
            buzz: ['화제', '인기', '트렌드', 'viral', 'trending', 'popular', 'buzz'],
            korea: ['한국', '서울', '부산', 'korea', 'seoul', 'korean', '손흥민'],
            japan: ['일본', '도쿄', '오사카', 'japan', 'tokyo', 'japanese', '오타니', 'ohtani', 'shohei']
        };

        console.log('🚨 긴급 수정된 뉴스 시스템 초기화');
        console.log('🔧 API 상태:', {
            newsApi: !!this.apis.newsApi,
            openAi: !!this.apis.openAi,
            skyworkAi: !!this.apis.skyworkAi,
            naver: !!(this.apis.naverClientId && this.apis.naverClientSecret)
        });
    }

    // 메인 뉴스 수집 함수
    async getNews(forceRefresh = false, timestamp = null) {
        const cacheKey = 'news_data';
        
        if (forceRefresh || timestamp || !this.cache.has(cacheKey) || this.isCacheExpired(cacheKey)) {
            console.log('🔄 실제 뉴스 데이터 수집 시작...', forceRefresh ? '(강제 새로고침)' : '');
            
            if (this.isUpdating && !forceRefresh) {
                console.log('⚠️ 이미 업데이트 중입니다.');
                return this.cache.get(cacheKey)?.data || this.getMinimalDefaultNews();
            }

            this.isUpdating = true;
            
            try {
                const newsData = await this.collectRealNews();
                
                // 실제 뉴스가 수집되었는지 확인
                const totalArticles = newsData.sections.world.length + 
                                    newsData.sections.korea.length + 
                                    newsData.sections.japan.length;

                if (totalArticles === 0) {
                    console.error('❌ 실제 뉴스 수집 실패 - 기본 데이터 사용');
                    return this.getMinimalDefaultNews();
                }

                this.cache.set(cacheKey, {
                    data: newsData,
                    timestamp: Date.now()
                });
                
                this.lastUpdate = new Date().toISOString();
                console.log(`✅ 실제 뉴스 수집 완료: ${totalArticles}개 기사`);
                
                return newsData;
            } catch (error) {
                console.error('❌ 뉴스 수집 중 오류:', error.message);
                return this.cache.get(cacheKey)?.data || this.getMinimalDefaultNews();
            } finally {
                this.isUpdating = false;
            }
        }

        return this.cache.get(cacheKey).data;
    }

    // 실제 뉴스 수집
    async collectRealNews() {
        console.log('📡 실제 뉴스 수집 시작...');
        
        const results = await Promise.allSettled([
            this.fetchRealWorldNews(),
            this.fetchRealKoreaNews(),
            this.fetchRealJapanNews(),
            this.fetchExchangeRates()
        ]);

        const worldNews = results[0].status === 'fulfilled' ? results[0].value : [];
        const koreaNews = results[1].status === 'fulfilled' ? results[1].value : [];
        const japanNews = results[2].status === 'fulfilled' ? results[2].value : [];
        const exchangeRates = results[3].status === 'fulfilled' ? results[3].value : this.getDefaultExchangeRates();

        // 결과 로깅
        results.forEach((result, index) => {
            const sections = ['세계뉴스', '한국뉴스', '일본뉴스', '환율정보'];
            if (result.status === 'rejected') {
                console.error(`❌ ${sections[index]} 수집 실패:`, result.reason?.message);
            } else {
                const count = Array.isArray(result.value) ? result.value.length : 'OK';
                console.log(`✅ ${sections[index]} 수집 성공: ${count}`);
            }
        });
        
        const trending = this.generateTrendingKeywords([...worldNews, ...koreaNews, ...japanNews]);

        return {
            sections: {
                world: worldNews.slice(0, 15),
                korea: koreaNews.slice(0, 15),
                japan: japanNews.slice(0, 15)
            },
            trending,
            exchangeRates,
            systemStatus: {
                version: '12.0.0-emergency-fixed',
                lastUpdate: this.lastUpdate,
                cacheSize: this.cache.size,
                features: ['real-news-collection', 'enhanced-translation', 'error-recovery', 'mobile-optimized'],
                apiMetrics: this.getApiMetricsReport(),
                apiSources: {
                    newsApi: !!this.apis.newsApi,
                    naverApi: !!(this.apis.naverClientId && this.apis.naverClientSecret),
                    openAi: !!this.apis.openAi,
                    skyworkAi: !!this.apis.skyworkAi,
                    exchangeApi: true
                }
            }
        };
    }

    // 실제 세계 뉴스 수집
    async fetchRealWorldNews() {
        console.log('🌍 실제 세계뉴스 수집 중...');
        
        const sources = [
            { endpoint: 'top-headlines', params: { category: 'general', language: 'en', pageSize: 20 } },
            { endpoint: 'everything', params: { q: 'breaking OR world OR global', language: 'en', pageSize: 15, sortBy: 'publishedAt' } }
        ];

        let allArticles = [];
        
        for (const source of sources) {
            try {
                if (!this.checkRateLimit('newsApi')) {
                    console.warn('⚠️ NewsAPI Rate Limit 도달');
                    continue;
                }

                const articles = await this.callNewsAPI(source.endpoint, source.params);
                console.log(`📰 ${source.endpoint}에서 ${articles.length}개 기사 수집`);
                allArticles = allArticles.concat(articles);
                
                await this.sleep(300);
            } catch (error) {
                console.error(`❌ 세계뉴스 수집 실패 (${source.endpoint}):`, error.message);
            }
        }

        const uniqueArticles = this.removeDuplicates(allArticles);
        const recentArticles = this.filterRecentNews(uniqueArticles);
        
        // 번역 처리
        const processedArticles = await this.processArticlesWithTranslation(recentArticles, 'world');

        console.log(`✅ 세계뉴스 처리 완료: ${processedArticles.length}개`);
        return processedArticles;
    }

    // 실제 한국 뉴스 수집
    async fetchRealKoreaNews() {
        console.log('🇰🇷 실제 한국뉴스 수집 중...');
        
        let allArticles = [];

        // Naver API 수집
        try {
            if (this.checkRateLimit('naver')) {
                const naverArticles = await this.callNaverAPI();
                console.log(`📰 Naver에서 ${naverArticles.length}개 기사 수집`);
                allArticles = allArticles.concat(naverArticles);
            }
        } catch (error) {
            console.error('❌ Naver API 수집 실패:', error.message);
        }

        // NewsAPI에서 한국 관련 뉴스
        try {
            if (this.checkRateLimit('newsApi')) {
                const koreanArticles = await this.callNewsAPI('everything', {
                    q: 'Korea OR Korean OR Seoul',
                    language: 'en',
                    pageSize: 10,
                    sortBy: 'publishedAt'
                });
                
                const filteredArticles = koreanArticles.filter(article => 
                    this.containsKeywords(article.title + ' ' + article.description, this.keywords.korea)
                );
                
                console.log(`📰 NewsAPI에서 ${filteredArticles.length}개 한국 관련 기사 수집`);
                allArticles = allArticles.concat(filteredArticles);
            }
        } catch (error) {
            console.error('❌ NewsAPI 한국뉴스 수집 실패:', error.message);
        }

        const uniqueArticles = this.removeDuplicates(allArticles);
        const recentArticles = this.filterRecentNews(uniqueArticles);
        
        // 번역 처리 (영문 기사만)
        const processedArticles = await this.processArticlesWithTranslation(recentArticles, 'korea');

        console.log(`✅ 한국뉴스 처리 완료: ${processedArticles.length}개`);
        return processedArticles;
    }

    // 실제 일본 뉴스 수집
    async fetchRealJapanNews() {
        console.log('🇯🇵 실제 일본뉴스 수집 중...');
        
        const sources = [
            { 
                endpoint: 'everything', 
                params: { 
                    q: 'Japan OR Japanese OR Tokyo OR Ohtani OR Shohei', 
                    language: 'en', 
                    pageSize: 15, 
                    sortBy: 'publishedAt'
                } 
            },
            { 
                endpoint: 'everything', 
                params: { 
                    q: 'MLB AND Ohtani', 
                    language: 'en', 
                    pageSize: 8, 
                    sortBy: 'publishedAt'
                } 
            }
        ];

        let allArticles = [];
        
        for (const source of sources) {
            try {
                if (!this.checkRateLimit('newsApi')) continue;

                const articles = await this.callNewsAPI(source.endpoint, source.params);
                
                const japanArticles = articles.filter(article => {
                    const content = (article.title + ' ' + article.description).toLowerCase();
                    return this.containsKeywords(content, this.keywords.japan);
                });
                
                console.log(`📰 ${source.endpoint}에서 ${japanArticles.length}개 일본 관련 기사 수집`);
                allArticles = allArticles.concat(japanArticles);
                
                await this.sleep(300);
            } catch (error) {
                console.error(`❌ 일본뉴스 수집 실패:`, error.message);
            }
        }

        const uniqueArticles = this.removeDuplicates(allArticles);
        const recentArticles = this.filterRecentNews(uniqueArticles);
        
        // 번역 처리
        const processedArticles = await this.processArticlesWithTranslation(recentArticles, 'japan');

        console.log(`✅ 일본뉴스 처리 완료: ${processedArticles.length}개`);
        return processedArticles;
    }

    // NewsAPI 호출
    async callNewsAPI(endpoint, params) {
        const baseUrl = 'https://newsapi.org/v2';
        const url = `${baseUrl}/${endpoint}`;
        
        const startTime = Date.now();
        
        try {
            const config = {
                params: {
                    ...params,
                    apiKey: this.apis.newsApi
                },
                timeout: 12000,
                headers: {
                    'User-Agent': 'EmarkNews/12.0.0'
                }
            };

            const response = await axios.get(url, config);
            
            if (response.data.status !== 'ok') {
                throw new Error(`NewsAPI 오류: ${response.data.message}`);
            }

            const articles = (response.data.articles || [])
                .filter(article => 
                    article.title && 
                    article.title !== '[Removed]' && 
                    article.description && 
                    article.description !== '[Removed]' &&
                    article.url &&
                    !article.url.includes('removed.com')
                )
                .map(article => ({
                    id: this.generateId(article.url),
                    title: article.title,
                    description: article.description,
                    url: article.url,
                    originalUrl: article.url,
                    image: article.urlToImage,
                    publishedAt: article.publishedAt,
                    source: {
                        name: article.source.name,
                        display: this.getSourceDisplay(article.source.name, article.publishedAt)
                    },
                    isKorean: false
                }));

            this.updateApiMetrics('newsApi', true, Date.now() - startTime);
            return articles;

        } catch (error) {
            this.updateApiMetrics('newsApi', false, Date.now() - startTime, error.message);
            throw error;
        }
    }

    // Naver API 호출
    async callNaverAPI() {
        const queries = ['뉴스', '정치', '경제'];
        let allArticles = [];

        for (const query of queries) {
            try {
                if (!this.checkRateLimit('naver')) break;

                const startTime = Date.now();
                
                const config = {
                    params: {
                        query,
                        display: 8,
                        start: 1,
                        sort: 'date'
                    },
                    headers: {
                        'X-Naver-Client-Id': this.apis.naverClientId,
                        'X-Naver-Client-Secret': this.apis.naverClientSecret,
                        'User-Agent': 'EmarkNews/12.0.0'
                    },
                    timeout: 10000
                };

                const response = await axios.get('https://openapi.naver.com/v1/search/news.json', config);
                
                const articles = (response.data.items || []).map(item => ({
                    id: this.generateId(item.link),
                    title: this.cleanNaverText(item.title),
                    description: this.cleanNaverText(item.description),
                    url: item.link,
                    originalUrl: item.originallink || item.link,
                    image: null,
                    publishedAt: item.pubDate,
                    source: {
                        name: this.extractSourceFromNaverLink(item.link),
                        display: this.getSourceDisplay(this.extractSourceFromNaverLink(item.link), item.pubDate)
                    },
                    isKorean: true
                }));

                allArticles = allArticles.concat(articles);
                this.updateApiMetrics('naverApi', true, Date.now() - startTime);
                
                await this.sleep(200);
                
            } catch (error) {
                this.updateApiMetrics('naverApi', false, Date.now() - Date.now(), error.message);
                console.error(`❌ Naver API 쿼리 실패 (${query}):`, error.message);
            }
        }

        return allArticles;
    }

    // 번역 포함 기사 처리
    async processArticlesWithTranslation(articles, section) {
        const processed = [];

        for (const article of articles.slice(0, 10)) { // 처리량 제한
            try {
                let translatedContent;
                
                if (article.isKorean) {
                    // 한국어 기사는 번역 건너뛰기
                    translatedContent = {
                        summary: this.createBasicSummary(article),
                        detailed: article.description,
                        fullContent: article.description + '\n\n더 자세한 내용은 원문을 참조하시기 바랍니다.'
                    };
                } else {
                    // 영문 기사 번역
                    translatedContent = await this.translateArticle(article);
                }
                
                const marks = this.analyzeMarks(article.title + ' ' + article.description);
                const stars = this.calculateQualityScore(article, marks);
                const category = this.classifyCategory(article.title + ' ' + article.description);

                processed.push({
                    ...article,
                    summary: translatedContent.summary,
                    description: translatedContent.detailed,
                    fullContent: translatedContent.fullContent,
                    marks,
                    stars,
                    category,
                    keywords: this.extractKeywords(article.title + ' ' + article.description)
                });

            } catch (error) {
                console.error(`❌ 기사 처리 실패 (${article.title?.substring(0, 30)}):`, error.message);
                
                // 기본 처리
                processed.push({
                    ...article,
                    summary: this.createBasicSummary(article),
                    fullContent: article.description + '\n\n더 자세한 내용은 원문을 참조하시기 바랍니다.',
                    marks: [],
                    stars: 3,
                    category: '일반',
                    keywords: ['뉴스']
                });
            }
        }

        return processed;
    }

    // 기사 번역
    async translateArticle(article) {
        const content = article.title + '\n' + article.description;
        
        // OpenAI 번역 시도
        try {
            if (this.apis.openAi && this.checkRateLimit('openAi')) {
                const result = await this.callOpenAITranslation(content);
                return this.parseTranslationResult(result);
            }
        } catch (error) {
            console.error('❌ OpenAI 번역 실패:', error.message);
        }

        // Skywork AI 번역 시도
        try {
            if (this.apis.skyworkAi && this.checkRateLimit('skywork')) {
                const result = await this.callSkyworkAITranslation(content);
                return this.parseTranslationResult(result);
            }
        } catch (error) {
            console.error('❌ Skywork AI 번역 실패:', error.message);
        }

        // 기본 번역
        return this.basicTranslateAndSummarize(article);
    }

    // OpenAI 번역 호출
    async callOpenAITranslation(content) {
        const startTime = Date.now();
        
        try {
            const prompt = `다음 영문 뉴스를 한국어로 번역하고 요약해주세요:

${content}

형식:
요약: • 첫 번째 핵심 내용
• 두 번째 핵심 내용
• 세 번째 핵심 내용

상세: 더 자세한 설명 (2-3문장)

전문: 완전한 번역 내용 (3-4문장)`;

            const response = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 600,
                temperature: 0.3
            }, {
                headers: {
                    'Authorization': `Bearer ${this.apis.openAi}`,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            });

            this.updateApiMetrics('openAi', true, Date.now() - startTime);
            return response.data.choices[0].message.content;

        } catch (error) {
            this.updateApiMetrics('openAi', false, Date.now() - startTime, error.message);
            throw error;
        }
    }

    // Skywork AI 번역 호출
    async callSkyworkAITranslation(content) {
        const startTime = Date.now();
        
        try {
            const response = await axios.post('https://api.skywork.ai/v1/chat/completions', {
                model: 'skywork-lite',
                messages: [{
                    role: 'user',
                    content: `다음 영문 뉴스를 한국어로 번역하고 요약해주세요: ${content}`
                }],
                max_tokens: 500
            }, {
                headers: {
                    'Authorization': `Bearer ${this.apis.skyworkAi}`,
                    'Content-Type': 'application/json'
                },
                timeout: 12000
            });

            this.updateApiMetrics('skyworkAi', true, Date.now() - startTime);
            return response.data.choices[0].message.content;

        } catch (error) {
            this.updateApiMetrics('skyworkAi', false, Date.now() - startTime, error.message);
            throw error;
        }
    }

    // 기본 번역 시스템
    basicTranslateAndSummarize(article) {
        console.log('🔧 기본 번역 시스템 사용');
        
        let translatedTitle = this.basicTranslateText(article.title);
        let translatedDescription = this.basicTranslateText(article.description);
        
        const sentences = translatedDescription.split('.').filter(s => s.trim().length > 10);
        let summary = '';
        
        if (sentences.length >= 2) {
            summary = sentences.slice(0, 3).map(s => `• ${s.trim()}`).join('\n');
        } else {
            summary = `• ${translatedDescription.substring(0, 100)}...`;
        }
        
        const detailed = translatedDescription.length > 200 ? 
            translatedDescription.substring(0, 200) + '...' : 
            translatedDescription;
        
        const fullContent = `${translatedTitle}\n\n${translatedDescription}\n\n기본 번역 시스템으로 처리되었습니다.`;
        
        return { summary, detailed, fullContent };
    }

    // 기본 텍스트 번역
    basicTranslateText(text) {
        let translated = text;
        
        Object.entries(this.translations).forEach(([english, korean]) => {
            const regex = new RegExp(`\\b${english}\\b`, 'gi');
            translated = translated.replace(regex, korean);
        });
        
        return translated;
    }

    // 번역 결과 파싱
    parseTranslationResult(result) {
        const lines = result.split('\n').filter(line => line.trim());
        
        let summary = '';
        let detailed = '';
        let fullContent = '';
        let currentSection = '';

        for (const line of lines) {
            if (line.includes('요약:')) {
                currentSection = 'summary';
                continue;
            } else if (line.includes('상세:')) {
                currentSection = 'detailed';
                continue;
            } else if (line.includes('전문:')) {
                currentSection = 'full';
                continue;
            }

            if (currentSection === 'summary' && line.trim().startsWith('•')) {
                summary += line.trim() + '\n';
            } else if (currentSection === 'detailed') {
                detailed += line.trim() + ' ';
            } else if (currentSection === 'full') {
                fullContent += line.trim() + ' ';
            }
        }

        return {
            summary: summary.trim() || result.substring(0, 200) + '...',
            detailed: detailed.trim() || result.substring(0, 300) + '...',
            fullContent: fullContent.trim() || detailed.trim() || result
        };
    }

    // 환율 정보 수집
    async fetchExchangeRates() {
        try {
            const response = await axios.get('https://api.exchangerate-api.com/v4/latest/USD', {
                timeout: 8000,
                headers: { 'User-Agent': 'EmarkNews/12.0.0' }
            });

            const rates = response.data.rates;
            const krw = rates.KRW || 1340;
            const jpy = rates.JPY || 145;

            this.updateApiMetrics('exchangeApi', true, 0);
            
            return {
                USD_KRW: Math.round(krw),
                JPY_KRW: Math.round((krw / jpy) * 10) / 10,
                lastUpdate: new Date().toISOString(),
                source: 'ExchangeRate-API'
            };

        } catch (error) {
            this.updateApiMetrics('exchangeApi', false, 0, error.message);
            return this.getDefaultExchangeRates();
        }
    }

    // 기본 환율 정보
    getDefaultExchangeRates() {
        return {
            USD_KRW: 1340,
            JPY_KRW: 9.2,
            lastUpdate: new Date().toISOString(),
            source: 'Default'
        };
    }

    // 유틸리티 함수들
    checkRateLimit(apiName) {
        const limit = this.rateLimits[apiName];
        if (!limit) return true;

        const now = Date.now();
        if (now > limit.resetTime) {
            limit.requests = 0;
            limit.resetTime = now + (apiName === 'naver' ? 60000 : apiName === 'newsApi' ? 3600000 : 60000);
        }

        if (limit.requests >= limit.maxRequests) {
            console.warn(`⚠️ ${apiName} API Rate Limit 도달`);
            return false;
        }

        limit.requests++;
        return true;
    }

    updateApiMetrics(apiName, success, duration, errorMessage = null) {
        const metric = this.apiMetrics[apiName];
        if (!metric) return;

        if (success) {
            metric.success++;
        } else {
            metric.failure++;
            metric.lastError = errorMessage;
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
        if (!cached) return true;
        return Date.now() - cached.timestamp > this.cacheExpiry;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    containsKeywords(text, keywords) {
        const lowerText = text.toLowerCase();
        return keywords.some(keyword => lowerText.includes(keyword.toLowerCase()));
    }

    removeDuplicates(articles) {
        const seen = new Set();
        return articles.filter(article => {
            const key = article.title.substring(0, 50);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    filterRecentNews(articles) {
        const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
        return articles.filter(article => {
            const publishedDate = new Date(article.publishedAt);
            return publishedDate >= twoDaysAgo;
        });
    }

    createBasicSummary(article) {
        const description = article.description || '';
        const sentences = description.split('.').filter(s => s.trim().length > 10);
        
        if (sentences.length >= 2) {
            return sentences.slice(0, 3).map(s => `• ${s.trim()}`).join('\n');
        }
        
        return `• ${description.substring(0, 100)}...`;
    }

    analyzeMarks(content) {
        const marks = [];
        const lowerContent = content.toLowerCase();
        
        if (this.containsKeywords(lowerContent, this.keywords.urgent)) marks.push('긴급');
        if (this.containsKeywords(lowerContent, this.keywords.important)) marks.push('중요');
        if (this.containsKeywords(lowerContent, this.keywords.buzz)) marks.push('Buzz');
        
        return marks;
    }

    calculateQualityScore(article, marks) {
        let score = 3;
        
        if (marks.includes('긴급')) score += 1;
        if (marks.includes('중요')) score += 1;
        if (marks.includes('Buzz')) score += 0.5;
        if (article.image) score += 0.5;
        if (article.description && article.description.length > 100) score += 0.5;
        
        return Math.min(Math.round(score), 5);
    }

    classifyCategory(content) {
        const lowerContent = content.toLowerCase();
        
        if (this.containsKeywords(lowerContent, ['정치', 'politics', 'government'])) return '정치';
        if (this.containsKeywords(lowerContent, ['경제', 'economy', 'business'])) return '경제';
        if (this.containsKeywords(lowerContent, ['스포츠', 'sports', 'baseball', 'mlb'])) return '스포츠';
        if (this.containsKeywords(lowerContent, ['기술', 'technology', 'tech'])) return '기술';
        if (this.containsKeywords(lowerContent, ['과학', 'science', 'research'])) return '과학';
        
        return '일반';
    }

    extractKeywords(content) {
        const words = content.toLowerCase().match(/\b\w{3,}\b/g) || [];
        const keywordCount = new Map();
        
        words.forEach(word => {
            if (!this.isStopWord(word)) {
                keywordCount.set(word, (keywordCount.get(word) || 0) + 1);
            }
        });
        
        return Array.from(keywordCount.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([word]) => word);
    }

    isStopWord(word) {
        const stopWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
        return stopWords.includes(word.toLowerCase()) || word.length < 3;
    }

    getSourceDisplay(sourceName, publishedAt) {
        const date = new Date(publishedAt);
        const timeString = date.toLocaleString('ko-KR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
        return `${sourceName} ${timeString}`;
    }

    extractSourceFromNaverLink(link) {
        if (!link) return 'Naver News';
        
        try {
            const url = new URL(link);
            const hostname = url.hostname;
            
            const sourceMap = {
                'chosun.com': '조선일보',
                'joongang.co.kr': '중앙일보',
                'donga.com': '동아일보',
                'hankyoreh.com': '한겨레',
                'ytn.co.kr': 'YTN',
                'sbs.co.kr': 'SBS'
            };
            
            for (const [domain, source] of Object.entries(sourceMap)) {
                if (hostname.includes(domain)) {
                    return source;
                }
            }
            
            return hostname.replace('www.', '') || 'Naver News';
        } catch (error) {
            return 'Naver News';
        }
    }

    cleanNaverText(text) {
        return text.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, '').trim();
    }

    generateId(url) {
        return Buffer.from(url).toString('base64').substring(0, 16);
    }

    generateTrendingKeywords(articles) {
        const keywordCount = new Map();
        
        articles.forEach(article => {
            const content = (article.title + ' ' + article.description).toLowerCase();
            const words = content.match(/\b\w{2,}\b/g) || [];
            
            words.forEach(word => {
                if (word.length > 2 && !this.isStopWord(word)) {
                    keywordCount.set(word, (keywordCount.get(word) || 0) + 1);
                }
            });
        });

        return Array.from(keywordCount.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([keyword, count]) => [keyword, Math.min(count, 30)]);
    }

    // 최소한의 기본 뉴스 (실제 뉴스 수집 실패 시에만 사용)
    getMinimalDefaultNews() {
        const now = new Date().toISOString();
        
        return {
            sections: {
                world: [],
                korea: [],
                japan: []
            },
            trending: [['뉴스', 10], ['실시간', 8], ['업데이트', 6]],
            exchangeRates: this.getDefaultExchangeRates(),
            systemStatus: {
                version: '12.0.0-emergency-fixed',
                lastUpdate: now,
                cacheSize: 0,
                features: ['emergency-mode'],
                apiMetrics: this.getApiMetricsReport(),
                apiSources: {
                    newsApi: !!this.apis.newsApi,
                    naverApi: !!(this.apis.naverClientId && this.apis.naverClientSecret),
                    openAi: !!this.apis.openAi,
                    skyworkAi: !!this.apis.skyworkAi,
                    exchangeApi: true
                }
            }
        };
    }

    // 시스템 상태 확인
    getSystemStatus() {
        return {
            status: 'running',
            version: '12.0.0-emergency-fixed',
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            lastUpdate: this.lastUpdate,
            cacheSize: this.cache.size,
            isUpdating: this.isUpdating,
            features: [
                'real-news-collection',
                'enhanced-translation-system',
                'error-recovery-mechanism',
                'mobile-optimized-summaries',
                'rate-limiting-protection'
            ],
            apiMetrics: this.getApiMetricsReport(),
            rateLimits: this.rateLimits,
            apiSources: {
                newsApi: !!this.apis.newsApi,
                naverApi: !!(this.apis.naverClientId && this.apis.naverClientSecret),
                openAi: !!this.apis.openAi,
                skyworkAi: !!this.apis.skyworkAi,
                exchangeApi: true
            }
        };
    }
}

module.exports = EmergencyFixedNewsSystem;
