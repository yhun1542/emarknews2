
const axios = require('axios');
const cheerio = require('cheerio');

class PremiumNewsSystemFinal {
    constructor() {
        this.cache = new Map();
        this.cacheExpiry = 8 * 60 * 1000; // 8분
        this.lastUpdate = null;
        this.isUpdating = false;
        this.updateCounter = 0; // 업데이트 카운터 추가
        
        // API 설정
        this.apis = {
            newsApi: process.env.NEWS_API_KEY || '44d9347a149b40ad87b3deb8bba95183',
            openAi: process.env.OPENAI_API_KEY,
            skyworkAi: process.env.SKYWORK_API_KEY,
            naverClientId: process.env.NAVER_CLIENT_ID || '4lsPsi_je8UoGGcfTP1w',
            naverClientSecret: process.env.NAVER_CLIENT_SECRET || 'J3BHRgyWPc'
        };

        // 고품질 뉴스 소스 (신뢰도 점수 포함)
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

        // 한국 뉴스 소스 매핑
        this.koreanSources = {
            'chosun.com': { score: 85, name: '조선일보' },
            'joongang.co.kr': { score: 85, name: '중앙일보' },
            'donga.com': { score: 85, name: '동아일보' },
            'hankyoreh.com': { score: 80, name: '한겨레' },
            'khan.co.kr': { score: 80, name: '경향신문' },
            'ytn.co.kr': { score: 85, name: 'YTN' },
            'sbs.co.kr': { score: 85, name: 'SBS' },
            'kbs.co.kr': { score: 85, name: 'KBS' },
            'mbc.co.kr': { score: 85, name: 'MBC' },
            'jtbc.co.kr': { score: 80, name: 'JTBC' }
        };

        // 고품질 키워드 (중요도 점수)
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
            sports: {
                keywords: ['ohtani', 'shohei', 'world cup', 'olympics', 'championship', '오타니', '쇼헤이', '월드컵', '올림픽', '챔피언십'],
                score: 10
            }
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
            naver: { requests: 0, resetTime: Date.now() + 60000, maxRequests: 12 },
            newsApi: { requests: 0, resetTime: Date.now() + 3600000, maxRequests: 400 },
            openAi: { requests: 0, resetTime: Date.now() + 60000, maxRequests: 25 },
            skywork: { requests: 0, resetTime: Date.now() + 60000, maxRequests: 40 }
        };

        console.log('🚀 프리미엄 뉴스 시스템 최종판 초기화');
        console.log('🔧 API 상태:', {
            newsApi: !!this.apis.newsApi,
            openAi: !!this.apis.openAi,
            skyworkAi: !!this.apis.skyworkAi,
            naver: !!(this.apis.naverClientId && this.apis.naverClientSecret)
        });
    }

    // 메인 뉴스 수집 함수
    async getNews(forceRefresh = false, timestamp = null) {
        const cacheKey = 'premium_news_data';
        
        if (forceRefresh || timestamp || !this.cache.has(cacheKey) || this.isCacheExpired(cacheKey)) {
            console.log('🔄 프리미엄 뉴스 수집 시작...', forceRefresh ? '(강제 새로고침)' : '');
            
            if (this.isUpdating && !forceRefresh) {
                console.log('⚠️ 이미 업데이트 중입니다.');
                return this.cache.get(cacheKey)?.data || this.getEmergencyNews();
            }

            this.isUpdating = true;
            this.updateCounter++; // 업데이트 카운터 증가
            
            try {
                const newsData = await this.collectPremiumNews(forceRefresh);
                
                // 실제 뉴스가 수집되었는지 확인
                const totalArticles = newsData.sections.world.length + 
                                    newsData.sections.korea.length + 
                                    newsData.sections.japan.length;

                if (totalArticles < 5) {
                    console.error('❌ 충분한 뉴스 수집 실패 - 비상 모드');
                    return this.getEmergencyNews();
                }

                this.cache.set(cacheKey, {
                    data: newsData,
                    timestamp: Date.now()
                });
                
                this.lastUpdate = new Date().toISOString();
                console.log(`✅ 프리미엄 뉴스 수집 완료: ${totalArticles}개 고품질 기사`);
                
                return newsData;
            } catch (error) {
                console.error('❌ 뉴스 수집 중 오류:', error.message);
                return this.cache.get(cacheKey)?.data || this.getEmergencyNews();
            } finally {
                this.isUpdating = false;
            }
        }

        return this.cache.get(cacheKey).data;
    }

    // 프리미엄 뉴스 수집
    async collectPremiumNews(forceRefresh = false) {
        console.log('📡 프리미엄 뉴스 수집 시작...');
        
        const results = await Promise.allSettled([
            this.fetchPremiumWorldNews(forceRefresh),
            this.fetchPremiumKoreaNews(forceRefresh),
            this.fetchPremiumJapanNews(forceRefresh),
            this.fetchRealTimeExchangeRates()
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
        
        const trending = this.generateAdvancedTrendingKeywords([...worldNews, ...koreaNews, ...japanNews]);

        return {
            sections: {
                world: worldNews.slice(0, 12),
                korea: koreaNews.slice(0, 12),
                japan: japanNews.slice(0, 12)
            },
            trending,
            exchangeRates,
            systemStatus: {
                version: '13.0.0-premium-final',
                lastUpdate: this.lastUpdate,
                cacheSize: this.cache.size,
                updateCounter: this.updateCounter,
                features: [
                    'premium-news-selection',
                    'advanced-translation',
                    'real-time-exchange-rates',
                    'mobile-optimized-ui',
                    'quality-scoring-algorithm',
                    'forced-refresh-system'
                ],
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

    // 프리미엄 세계 뉴스 수집
    async fetchPremiumWorldNews(forceRefresh = false) {
        console.log('🌍 프리미엄 세계뉴스 수집 중...');
        
        const sources = [
            { 
                endpoint: 'top-headlines', 
                params: { 
                    category: 'general', 
                    language: 'en', 
                    pageSize: 30,
                    sources: 'bbc-news,reuters,associated-press,cnn'
                } 
            },
            { 
                endpoint: 'everything', 
                params: { 
                    q: 'breaking OR urgent OR crisis OR government OR president', 
                    language: 'en', 
                    pageSize: 25, 
                    sortBy: 'publishedAt',
                    sources: 'bbc-news,reuters,the-guardian-uk,bloomberg'
                } 
            },
            { 
                endpoint: 'top-headlines', 
                params: { 
                    category: 'business', 
                    language: 'en', 
                    pageSize: 20,
                    sources: 'bloomberg,financial-times,wall-street-journal'
                } 
            }
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
                
                await this.sleep(400);
            } catch (error) {
                console.error(`❌ 세계뉴스 수집 실패 (${source.endpoint}):`, error.message);
            }
        }

        // 고품질 뉴스 선별 및 처리
        const qualityArticles = this.selectHighQualityNews(allArticles, 'world');
        const processedArticles = await this.processArticlesWithDetailedTranslation(qualityArticles, 'world');

        console.log(`✅ 프리미엄 세계뉴스 처리 완료: ${processedArticles.length}개`);
        return processedArticles;
    }

    // 프리미엄 한국 뉴스 수집
    async fetchPremiumKoreaNews(forceRefresh = false) {
        console.log('🇰🇷 프리미엄 한국뉴스 수집 중...');
        
        let allArticles = [];

        // Naver API 수집 (고품질 쿼리)
        try {
            if (this.checkRateLimit('naver')) {
                const naverArticles = await this.callPremiumNaverAPI();
                console.log(`📰 Naver에서 ${naverArticles.length}개 고품질 기사 수집`);
                allArticles = allArticles.concat(naverArticles);
            }
        } catch (error) {
            console.error('❌ Naver API 수집 실패:', error.message);
        }

        // NewsAPI에서 한국 관련 고품질 뉴스
        try {
            if (this.checkRateLimit('newsApi')) {
                const koreanArticles = await this.callNewsAPI('everything', {
                    q: 'Korea OR Korean OR Seoul OR "South Korea" OR K-pop OR Samsung OR LG',
                    language: 'en',
                    pageSize: 15,
                    sortBy: 'publishedAt',
                    sources: 'bbc-news,reuters,cnn,bloomberg'
                });
                
                const filteredArticles = koreanArticles.filter(article => 
                    this.containsKeywords(article.title + ' ' + article.description, ['korea', 'korean', 'seoul', 'south korea'])
                );
                
                console.log(`📰 NewsAPI에서 ${filteredArticles.length}개 한국 관련 기사 수집`);
                allArticles = allArticles.concat(filteredArticles);
            }
        } catch (error) {
            console.error('❌ NewsAPI 한국뉴스 수집 실패:', error.message);
        }

        // 고품질 뉴스 선별 및 처리
        const qualityArticles = this.selectHighQualityNews(allArticles, 'korea');
        const processedArticles = await this.processArticlesWithDetailedTranslation(qualityArticles, 'korea');

        console.log(`✅ 프리미엄 한국뉴스 처리 완료: ${processedArticles.length}개`);
        return processedArticles;
    }

    // 프리미엄 일본 뉴스 수집
    async fetchPremiumJapanNews(forceRefresh = false) {
        console.log('🇯🇵 프리미엄 일본뉴스 수집 중...');
        
        const sources = [
            { 
                endpoint: 'everything', 
                params: { 
                    q: 'Japan OR Japanese OR Tokyo OR Ohtani OR Shohei OR "Prime Minister Japan"', 
                    language: 'en', 
                    pageSize: 20, 
                    sortBy: 'publishedAt',
                    sources: 'bbc-news,reuters,cnn'
                } 
            },
            { 
                endpoint: 'everything', 
                params: { 
                    q: 'MLB AND (Ohtani OR Shohei OR "Los Angeles Dodgers")', 
                    language: 'en', 
                    pageSize: 12, 
                    sortBy: 'publishedAt'
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
                if (!this.checkRateLimit('newsApi')) continue;

                const articles = await this.callNewsAPI(source.endpoint, source.params);
                
                const japanArticles = articles.filter(article => {
                    const content = (article.title + ' ' + article.description).toLowerCase();
                    return this.containsKeywords(content, ['japan', 'japanese', 'tokyo', 'ohtani', 'shohei']);
                });
                
                console.log(`📰 ${source.endpoint}에서 ${japanArticles.length}개 일본 관련 기사 수집`);
                allArticles = allArticles.concat(japanArticles);
                
                await this.sleep(400);
            } catch (error) {
                console.error(`❌ 일본뉴스 수집 실패:`, error.message);
            }
        }

        // 고품질 뉴스 선별 및 처리
        const qualityArticles = this.selectHighQualityNews(allArticles, 'japan');
        const processedArticles = await this.processArticlesWithDetailedTranslation(qualityArticles, 'japan');

        console.log(`✅ 프리미엄 일본뉴스 처리 완료: ${processedArticles.length}개`);
        return processedArticles;
    }

    // 고품질 뉴스 선별 알고리즘
    selectHighQualityNews(articles, section) {
        console.log(`🔍 ${section} 섹션 고품질 뉴스 선별 중... (${articles.length}개 중)`);
        
        // 중복 제거
        const uniqueArticles = this.removeDuplicates(articles);
        
        // 최신 뉴스 필터링 (24시간 이내)
        const recentArticles = this.filterRecentNews(uniqueArticles, 24);
        
        // 품질 점수 계산
        const scoredArticles = recentArticles.map(article => {
            const qualityScore = this.calculateAdvancedQualityScore(article);
            return { ...article, qualityScore };
        });
        
        // 품질 점수 기준 정렬 (높은 점수 우선)
        scoredArticles.sort((a, b) => b.qualityScore - a.qualityScore);
        
        // 상위 품질 기사만 선택
        const selectedArticles = scoredArticles.slice(0, 15);
        
        console.log(`✅ ${section} 섹션 고품질 뉴스 선별 완료: ${selectedArticles.length}개 (평균 점수: ${Math.round(selectedArticles.reduce((sum, a) => sum + a.qualityScore, 0) / selectedArticles.length)})`);
        
        return selectedArticles;
    }

    // 고급 품질 점수 계산
    calculateAdvancedQualityScore(article) {
        let score = 50; // 기본 점수
        
        const content = (article.title + ' ' + article.description).toLowerCase();
        
        // 소스 신뢰도 점수
        const sourceScore = this.getSourceReliabilityScore(article.source?.name);
        score += sourceScore;
        
        // 키워드 중요도 점수
        Object.entries(this.qualityKeywords).forEach(([category, data]) => {
            if (this.containsKeywords(content, data.keywords)) {
                score += data.score;
            }
        });
        
        // 제목 길이 점수 (너무 짧거나 길면 감점)
        const titleLength = article.title?.length || 0;
        if (titleLength >= 30 && titleLength <= 100) {
            score += 10;
        } else if (titleLength < 20 || titleLength > 150) {
            score -= 15;
        }
        
        // 설명 품질 점수
        const descLength = article.description?.length || 0;
        if (descLength >= 100 && descLength <= 300) {
            score += 15;
        } else if (descLength < 50) {
            score -= 20;
        }
        
        // 이미지 존재 점수
        if (article.image && article.image.includes('http')) {
            score += 8;
        }
        
        // 최신성 점수 (최근 6시간 이내 +10점)
        const publishedTime = new Date(article.publishedAt);
        const hoursAgo = (Date.now() - publishedTime.getTime()) / (1000 * 60 * 60);
        if (hoursAgo <= 6) {
            score += 10;
        } else if (hoursAgo <= 12) {
            score += 5;
        }
        
        // 스팸/저품질 콘텐츠 감점
        const spamKeywords = ['click', 'viral', 'shocking', 'unbelievable', 'you won\'t believe'];
        if (this.containsKeywords(content, spamKeywords)) {
            score -= 25;
        }
        
        return Math.max(0, Math.min(100, score));
    }

    // 소스 신뢰도 점수 계산
    getSourceReliabilityScore(sourceName) {
        if (!sourceName) return 0;
        
        const lowerSource = sourceName.toLowerCase();
        
        // 프리미엄 소스 확인
        for (const [key, data] of Object.entries(this.premiumSources)) {
            if (lowerSource.includes(key.replace('-', ' ')) || lowerSource.includes(data.name.toLowerCase())) {
                return Math.round(data.score / 5); // 0-20점 범위로 조정
            }
        }
        
        // 일반 신뢰할 만한 소스
        const reliableSources = ['times', 'post', 'news', 'herald', 'tribune', 'journal'];
        if (reliableSources.some(source => lowerSource.includes(source))) {
            return 10;
        }
        
        return 5; // 기본 점수
    }

    // 상세 번역 포함 기사 처리
    async processArticlesWithDetailedTranslation(articles, section) {
        const processed = [];

        for (const article of articles.slice(0, 12)) {
            try {
                let translatedContent;
                
                if (article.isKorean) {
                    // 한국어 기사는 번역 건너뛰기
                    translatedContent = {
                        summary: this.createAdvancedSummary(article),
                        detailed: article.description,
                        fullContent: this.createDetailedContent(article)
                    };
                } else {
                    // 영문 기사 상세 번역
                    translatedContent = await this.translateArticleDetailed(article);
                }
                
                const marks = this.analyzeAdvancedMarks(article.title + ' ' + article.description);
                const stars = Math.min(5, Math.max(1, Math.round(article.qualityScore / 20)));
                const category = this.classifyAdvancedCategory(article.title + ' ' + article.description);
                const timeAgo = this.calculateTimeAgo(article.publishedAt);

                processed.push({
                    ...article,
                    summary: translatedContent.summary,
                    description: translatedContent.detailed,
                    fullContent: translatedContent.fullContent,
                    marks,
                    stars,
                    category,
                    timeAgo,
                    keywords: this.extractAdvancedKeywords(article.title + ' ' + article.description),
                    mobileOptimized: {
                        title: translatedContent.summary.split('\n')[0]?.replace('• ', '') || article.title,
                        shortDesc: translatedContent.detailed.substring(0, 120) + '...',
                        tags: [category, timeAgo, `★${stars}`].concat(marks)
                    }
                });

            } catch (error) {
                console.error(`❌ 기사 처리 실패 (${article.title?.substring(0, 30)}):`, error.message);
                
                // 기본 처리
                processed.push({
                    ...article,
                    summary: this.createAdvancedSummary(article),
                    fullContent: this.createDetailedContent(article),
                    marks: [],
                    stars: 3,
                    category: '일반',
                    timeAgo: this.calculateTimeAgo(article.publishedAt),
                    keywords: ['뉴스'],
                    mobileOptimized: {
                        title: article.title,
                        shortDesc: article.description?.substring(0, 120) + '...',
                        tags: ['일반', this.calculateTimeAgo(article.publishedAt), '★3']
                    }
                });
            }
        }

        return processed;
    }

    // 상세 번역 시스템
    async translateArticleDetailed(article) {
        const content = article.title + '\n' + article.description;
        
        console.log(`🔄 상세 번역 시작: ${article.title.substring(0, 40)}...`);
        
        // OpenAI 상세 번역 시도
        try {
            if (this.apis.openAi && this.checkRateLimit('openAi')) {
                const result = await this.callOpenAIDetailedTranslation(content);
                const parsed = this.parseDetailedTranslationResult(result);
                console.log('✅ OpenAI 상세 번역 성공');
                return parsed;
            }
        } catch (error) {
            console.error('❌ OpenAI 상세 번역 실패:', error.message);
        }

        // Skywork AI 상세 번역 시도
        try {
            if (this.apis.skyworkAi && this.checkRateLimit('skywork')) {
                const result = await this.callSkyworkAIDetailedTranslation(content);
                const parsed = this.parseDetailedTranslationResult(result);
                console.log('✅ Skywork AI 상세 번역 성공');
                return parsed;
            }
        } catch (error) {
            console.error('❌ Skywork AI 상세 번역 실패:', error.message);
        }

        // 기본 상세 번역
        console.log('🔧 기본 상세 번역 시스템 사용');
        return this.basicDetailedTranslateAndSummarize(article);
    }

    // OpenAI 상세 번역 호출
    async callOpenAIDetailedTranslation(content) {
        const startTime = Date.now();
        
        try {
            const prompt = `다음 영문 뉴스를 한국어로 상세하게 번역하고 서술식으로 정리해주세요:

${content}

요구사항:
1. 자연스러운 한국어로 완전 번역
2. 핵심 내용을 3-4개 포인트로 요약 (각 포인트는 한 줄로)
3. 상세한 서술식 설명을 3-4문장으로 작성 (뉴스의 배경과 의미 포함)
4. 완전한 번역 내용을 5-6문장으로 상세하게 작성 (모든 세부사항 포함)
5. 굵은 글씨나 특수 기호 사용 금지
6. 스마트폰에서 읽기 쉽게 간결하고 명확하게 작성

형식:
요약: • 첫 번째 핵심 내용
• 두 번째 핵심 내용
• 세 번째 핵심 내용

상세: 이 뉴스는... (서술식 3-4문장, 배경과 의미 포함)

전문: 완전한 번역 내용... (5-6문장, 모든 세부사항 포함)`;

            const response = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 1000,
                temperature: 0.2
            }, {
                headers: {
                    'Authorization': `Bearer ${this.apis.openAi}`,
                    'Content-Type': 'application/json'
                },
                timeout: 20000
            });

            this.updateApiMetrics('openAi', true, Date.now() - startTime);
            return response.data.choices[0].message.content;

        } catch (error) {
            this.updateApiMetrics('openAi', false, Date.now() - startTime, error.message);
            throw error;
        }
    }

    // Skywork AI 상세 번역 호출
    async callSkyworkAIDetailedTranslation(content) {
        const startTime = Date.now();
        
        try {
            const response = await axios.post('https://api.skywork.ai/v1/chat/completions', {
                model: 'skywork-lite',
                messages: [{
                    role: 'user',
                    content: `다음 영문 뉴스를 한국어로 상세하게 번역하고 서술식으로 정리해주세요. 요약, 상세, 전문 형식으로 작성해주세요: ${content}`
                }],
                max_tokens: 800
            }, {
                headers: {
                    'Authorization': `Bearer ${this.apis.skyworkAi}`,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            });

            this.updateApiMetrics('skyworkAi', true, Date.now() - startTime);
            return response.data.choices[0].message.content;

        } catch (error) {
            this.updateApiMetrics('skyworkAi', false, Date.now() - startTime, error.message);
            throw error;
        }
    }

    // 실시간 환율 정보 수집
    async fetchRealTimeExchangeRates() {
        try {
            console.log('💱 실시간 환율 정보 수집 중...');
            
            const response = await axios.get('https://api.exchangerate-api.com/v4/latest/USD', {
                timeout: 10000,
                headers: { 'User-Agent': 'EmarkNews/13.0.0' }
            });

            const rates = response.data.rates;
            const krw = rates.KRW;
            const jpy = rates.JPY;
            const jpyToKrw = Math.round((krw / jpy) * 10) / 10;

            const exchangeRates = {
                USD_KRW: Math.round(krw),
                JPY_KRW: jpyToKrw,
                lastUpdate: new Date().toISOString(),
                source: 'ExchangeRate-API',
                timestamp: Date.now()
            };

            this.updateApiMetrics('exchangeApi', true, 0);
            console.log('✅ 실시간 환율 수집 완료:', exchangeRates);
            return exchangeRates;

        } catch (error) {
            console.error('❌ 환율 정보 수집 실패:', error.message);
            this.updateApiMetrics('exchangeApi', false, 0, error.message);
            return this.getDefaultExchangeRates();
        }
    }

    // 프리미엄 Naver API 호출
    async callPremiumNaverAPI() {
        const queries = ['정치', '경제', '사회', '국제', '긴급뉴스'];
        let allArticles = [];

        for (const query of queries) {
            try {
                if (!this.checkRateLimit('naver')) break;

                const startTime = Date.now();
                
                const config = {
                    params: {
                        query,
                        display: 6,
                        start: 1,
                        sort: 'date'
                    },
                    headers: {
                        'X-Naver-Client-Id': this.apis.naverClientId,
                        'X-Naver-Client-Secret': this.apis.naverClientSecret,
                        'User-Agent': 'EmarkNews/13.0.0'
                    },
                    timeout: 12000
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
                    isKorean: true,
                    qualityScore: 70 // 기본 품질 점수
                }));

                allArticles = allArticles.concat(articles);
                this.updateApiMetrics('naverApi', true, Date.now() - startTime);
                
                await this.sleep(250);
                
            } catch (error) {
                this.updateApiMetrics('naverApi', false, Date.now() - Date.now(), error.message);
                console.error(`❌ Naver API 쿼리 실패 (${query}):`, error.message);
            }
        }

        return allArticles;
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
                timeout: 15000,
                headers: {
                    'User-Agent': 'EmarkNews/13.0.0'
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
                    !article.url.includes('removed.com') &&
                    article.description.length > 50
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
            const key = article.title.substring(0, 60);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    filterRecentNews(articles, hours = 24) {
        const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
        return articles.filter(article => {
            const publishedDate = new Date(article.publishedAt);
            return publishedDate >= cutoffTime;
        });
    }

    calculateTimeAgo(publishedAt) {
        const now = Date.now();
        const published = new Date(publishedAt).getTime();
        const diffMs = now - published;
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffMinutes = Math.floor(diffMs / (1000 * 60));

        if (diffMinutes < 60) {
            return `${diffMinutes}분 전`;
        } else if (diffHours < 24) {
            return `${diffHours}시간 전`;
        } else {
            const diffDays = Math.floor(diffHours / 24);
            return `${diffDays}일 전`;
        }
    }

    createAdvancedSummary(article) {
        const description = article.description || '';
        const sentences = description.split(/[.!?]/).filter(s => s.trim().length > 15);
        
        if (sentences.length >= 3) {
            return sentences.slice(0, 3).map(s => `• ${s.trim()}`).join('\n');
        } else if (sentences.length >= 2) {
            return sentences.slice(0, 2).map(s => `• ${s.trim()}`).join('\n') + `\n• ${description.substring(0, 80)}...`;
        }
        
        return `• ${description.substring(0, 120)}...`;
    }

    createDetailedContent(article) {
        return `${article.title}\n\n${article.description}\n\n이 기사에 대한 더 자세한 정보는 원문을 참조하시기 바랍니다.`;
    }

    analyzeAdvancedMarks(content) {
        const marks = [];
        const lowerContent = content.toLowerCase();
        
        // 긴급 키워드 확인
        const urgentKeywords = ['breaking', 'urgent', 'emergency', 'crisis', 'alert', '긴급', '속보', '위기'];
        if (this.containsKeywords(lowerContent, urgentKeywords)) marks.push('긴급');
        
        // 중요 키워드 확인
        const importantKeywords = ['president', 'government', 'minister', 'important', 'significant', 'major', '대통령', '정부', '장관', '중요'];
        if (this.containsKeywords(lowerContent, importantKeywords)) marks.push('중요');
        
        // 버즈 키워드 확인
        const buzzKeywords = ['viral', 'trending', 'popular', 'sensation', '화제', '인기', '트렌드'];
        if (this.containsKeywords(lowerContent, buzzKeywords)) marks.push('Buzz');
        
        return marks;
    }

    classifyAdvancedCategory(content) {
        const lowerContent = content.toLowerCase();
        
        if (this.containsKeywords(lowerContent, ['정치', 'politics', 'government', 'president', 'minister', 'election'])) return '정치';
        if (this.containsKeywords(lowerContent, ['경제', 'economy', 'business', 'finance', 'market', 'stock', 'trade'])) return '경제';
        if (this.containsKeywords(lowerContent, ['스포츠', 'sports', 'baseball', 'mlb', 'ohtani', 'football', 'soccer'])) return '스포츠';
        if (this.containsKeywords(lowerContent, ['기술', 'technology', 'tech', 'ai', 'artificial intelligence', 'innovation'])) return '기술';
        if (this.containsKeywords(lowerContent, ['과학', 'science', 'research', 'study', 'discovery', 'breakthrough'])) return '과학';
        if (this.containsKeywords(lowerContent, ['문화', 'culture', 'art', 'entertainment', 'movie', 'music'])) return '문화';
        if (this.containsKeywords(lowerContent, ['건강', 'health', 'medical', 'hospital', 'disease', 'treatment'])) return '건강';
        if (this.containsKeywords(lowerContent, ['환경', 'environment', 'climate', 'weather', 'disaster', 'earthquake'])) return '환경';
        
        return '일반';
    }

    extractAdvancedKeywords(content) {
        const words = content.toLowerCase().match(/\b\w{3,}\b/g) || [];
        const keywordCount = new Map();
        
        // 불용어 목록 확장
        const stopWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'up', 'about', 'into', 'over', 'after'];
        
        words.forEach(word => {
            if (!stopWords.includes(word) && word.length >= 3) {
                keywordCount.set(word, (keywordCount.get(word) || 0) + 1);
            }
        });
        
        return Array.from(keywordCount.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([word]) => word);
    }

    generateAdvancedTrendingKeywords(articles) {
        const keywordCount = new Map();
        const importantKeywords = new Set();
        
        articles.forEach(article => {
            const content = (article.title + ' ' + article.description).toLowerCase();
            const words = content.match(/\b\w{2,}\b/g) || [];
            
            // 품질 점수가 높은 기사의 키워드에 가중치 부여
            const weight = article.qualityScore ? Math.max(1, Math.round(article.qualityScore / 30)) : 1;
            
            words.forEach(word => {
                if (word.length > 2 && !this.isStopWord(word)) {
                    keywordCount.set(word, (keywordCount.get(word) || 0) + weight);
                    
                    // 중요 키워드 식별
                    if (this.isImportantKeyword(word)) {
                        importantKeywords.add(word);
                    }
                }
            });
        });

        // 중요 키워드 우선 정렬
        return Array.from(keywordCount.entries())
            .sort((a, b) => {
                const aImportant = importantKeywords.has(a[0]) ? 1 : 0;
                const bImportant = importantKeywords.has(b[0]) ? 1 : 0;
                
                if (aImportant !== bImportant) {
                    return bImportant - aImportant;
                }
                
                return b[1] - a[1];
            })
            .slice(0, 12)
            .map(([keyword, count]) => [keyword, Math.min(count, 50)]);
    }

    isImportantKeyword(word) {
        const importantWords = ['president', 'government', 'economy', 'market', 'crisis', 'emergency', 'breaking', 'ohtani', 'korea', 'japan', 'china', 'usa'];
        return importantWords.includes(word.toLowerCase());
    }

    isStopWord(word) {
        const stopWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'up', 'about', 'into', 'over', 'after', 'this', 'that', 'these', 'those', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'said', 'says'];
        return stopWords.includes(word.toLowerCase()) || word.length < 3;
    }

    basicDetailedTranslateAndSummarize(article) {
        console.log('🔧 기본 상세 번역 시스템 사용');
        
        // 기본 번역 사전 확장
        const translations = {
            'breaking': '속보', 'news': '뉴스', 'update': '업데이트', 'report': '보고서',
            'government': '정부', 'president': '대통령', 'minister': '장관', 'company': '회사',
            'market': '시장', 'economy': '경제', 'business': '비즈니스', 'technology': '기술',
            'science': '과학', 'sports': '스포츠', 'politics': '정치', 'world': '세계',
            'japan': '일본', 'japanese': '일본의', 'korea': '한국', 'korean': '한국의',
            'ohtani': '오타니', 'shohei': '쇼헤이', 'baseball': '야구', 'mlb': 'MLB',
            'dodgers': '다저스', 'tokyo': '도쿄', 'seoul': '서울', 'crisis': '위기',
            'emergency': '비상사태', 'important': '중요한', 'significant': '중요한'
        };
        
        let translatedTitle = article.title;
        let translatedDescription = article.description;
        
        // 기본 번역 적용
        Object.entries(translations).forEach(([english, korean]) => {
            const regex = new RegExp(`\\b${english}\\b`, 'gi');
            translatedTitle = translatedTitle.replace(regex, korean);
            translatedDescription = translatedDescription.replace(regex, korean);
        });
        
        // 상세 요약 생성
        const sentences = translatedDescription.split(/[.!?]/).filter(s => s.trim().length > 10);
        let summary = '';
        
        if (sentences.length >= 3) {
            summary = sentences.slice(0, 3).map(s => `• ${s.trim()}`).join('\n');
        } else {
            summary = `• ${translatedDescription.substring(0, 100)}...\n• 더 자세한 내용은 원문을 참조하시기 바랍니다.`;
        }
        
        // 상세 설명 생성
        const detailed = `이 뉴스는 ${translatedTitle}에 관한 내용입니다. ${translatedDescription.substring(0, 200)}${translatedDescription.length > 200 ? '...' : ''}`;
        
        // 전문 내용 생성
        const fullContent = `${translatedTitle}\n\n${translatedDescription}\n\n이 기사는 기본 번역 시스템으로 처리되었습니다. 더 정확한 번역과 상세한 내용은 원문을 참조하시기 바랍니다.`;
        
        return { summary, detailed, fullContent };
    }

    parseDetailedTranslationResult(result) {
        const lines = result.split('\n').filter(line => line.trim());
        
        let summary = '';
        let detailed = '';
        let fullContent = '';
        let currentSection = '';

        for (const line of lines) {
            if (line.includes('요약:') || line.includes('Summary:')) {
                currentSection = 'summary';
                continue;
            } else if (line.includes('상세:') || line.includes('Detail:')) {
                currentSection = 'detailed';
                continue;
            } else if (line.includes('전문:') || line.includes('Full:')) {
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
            summary: summary.trim() || result.substring(0, 300) + '...',
            detailed: detailed.trim() || result.substring(0, 400) + '...',
            fullContent: fullContent.trim() || detailed.trim() || result
        };
    }

    getSourceDisplay(sourceName, publishedAt) {
        const mappedName = this.premiumSources[sourceName.toLowerCase()]?.name || 
                          this.koreanSources[sourceName.toLowerCase()]?.name || 
                          sourceName;
        
        const date = new Date(publishedAt);
        const timeString = date.toLocaleString('ko-KR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
        return `${mappedName} ${timeString}`;
    }

    extractSourceFromNaverLink(link) {
        if (!link) return 'Naver News';
        
        try {
            const url = new URL(link);
            const hostname = url.hostname;
            
            for (const [domain, data] of Object.entries(this.koreanSources)) {
                if (hostname.includes(domain)) {
                    return data.name;
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

    getDefaultExchangeRates() {
        return {
            USD_KRW: 1340,
            JPY_KRW: 9.2,
            lastUpdate: new Date().toISOString(),
            source: 'Default',
            timestamp: Date.now()
        };
    }

    // 비상 뉴스 (모든 수집 실패 시)
    getEmergencyNews() {
        const now = new Date().toISOString();
        
        return {
            sections: {
                world: [],
                korea: [],
                japan: []
            },
            trending: [['뉴스', 15], ['실시간', 12], ['업데이트', 10], ['시스템', 8]],
            exchangeRates: this.getDefaultExchangeRates(),
            systemStatus: {
                version: '13.0.0-premium-final',
                lastUpdate: now,
                cacheSize: 0,
                updateCounter: this.updateCounter,
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
            version: '13.0.0-premium-final',
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            lastUpdate: this.lastUpdate,
            cacheSize: this.cache.size,
            isUpdating: this.isUpdating,
            updateCounter: this.updateCounter,
            features: [
                'premium-news-selection-algorithm',
                'advanced-quality-scoring-system',
                'detailed-translation-system',
                'real-time-exchange-rates',
                'mobile-optimized-ui-data',
                'forced-refresh-mechanism',
                'multi-source-integration',
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

module.exports = PremiumNewsSystemFinal;
