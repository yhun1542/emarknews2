const https = require('https');
const http = require('http');
const querystring = require('querystring');

class PremiumMultiAPINewsSystem {
    constructor() {
        this.newsCache = new Map();
        this.translationCache = new Map();
        this.duplicateCache = new Set();
        this.trendingTopics = new Map();
        
        // API 설정
        this.apis = {
            naver: {
                clientId: '4lsPsi_je8UoGGcfTP1w',
                clientSecret: 'J3BHRgyWPc',
                baseUrl: 'https://openapi.naver.com/v1/search/news'
            },
            newsapi: {
                apiKey: '44d9347a149b40ad87b3deb8bba95183',
                baseUrl: 'https://newsapi.org/v2'
            },
            youtube: {
                apiKey: process.env.YOUTUBE_API_KEY,
                baseUrl: 'https://www.googleapis.com/youtube/v3'
            }
        };
        
        // 소스 신뢰도 (프리미엄 소스 추가)
        this.sourceReliability = new Map([
            // 글로벌 프리미엄
            ['bbc-news', 0.98], ['reuters', 0.98], ['associated-press', 0.97],
            ['bloomberg', 0.95], ['the-guardian-uk', 0.92], ['cnn', 0.90],
            ['the-new-york-times', 0.95], ['the-washington-post', 0.93],
            ['npr', 0.94], ['abc-news', 0.88], ['cbs-news', 0.88],
            // 한국 프리미엄
            ['연합뉴스', 0.95], ['조선일보', 0.90], ['중앙일보', 0.90],
            ['동아일보', 0.88], ['한국일보', 0.87], ['경향신문', 0.85],
            ['KBS', 0.92], ['MBC', 0.90], ['SBS', 0.88],
            // 일본 프리미엄
            ['NHK', 0.95], ['朝日新聞', 0.92], ['読売新聞', 0.92],
            ['Japan Times', 0.88], ['Nikkei', 0.90]
        ]);
        
        // 긴급 키워드 (다국어)
        this.urgentKeywords = {
            ko: ['속보', '긴급', '단독', '발표', '사망', '사고', '지진', '화재', '폭발', '테러', '붕괴', '침몰'],
            en: ['breaking', 'urgent', 'exclusive', 'dies', 'dead', 'earthquake', 'fire', 'explosion', 'terror', 'collapse', 'crash'],
            ja: ['速報', '緊急', '独占', '死亡', '事故', '地震', '火災', '爆発', 'テロ', '崩壊']
        };
        
        // 중요 키워드
        this.importantKeywords = {
            ko: ['대통령', '총리', '장관', '국회', '선거', '경제', '주식', '환율', '코로나', '백신', '북한', '중국'],
            en: ['president', 'minister', 'congress', 'election', 'economy', 'stock', 'covid', 'vaccine', 'china', 'russia'],
            ja: ['総理', '大臣', '国会', '選挙', '経済', '株式', 'コロナ', 'ワクチン', '中国', '韓国']
        };
        
        console.log('🚀 프리미엄 다중 API 뉴스 시스템 초기화 완료');
        console.log('📡 연동 API: 네이버 뉴스, NewsAPI 유료, YouTube');
    }

    // 네이버 뉴스 API 호출
    async fetchNaverNews(query, display = 20, sort = 'date') {
        try {
            console.log(`📰 네이버 뉴스 검색: "${query}"`);
            
            const encodedQuery = encodeURIComponent(query);
            const url = `${this.apis.naver.baseUrl}?query=${encodedQuery}&display=${display}&sort=${sort}`;
            
            const options = {
                method: 'GET',
                headers: {
                    'X-Naver-Client-Id': this.apis.naver.clientId,
                    'X-Naver-Client-Secret': this.apis.naver.clientSecret,
                    'User-Agent': 'EmarkNews/3.0 Premium'
                }
            };
            
            const data = await this.makeAPIRequest(url, options);
            
            if (data && data.items) {
                console.log(`✅ 네이버 뉴스: ${data.items.length}개 기사 수집`);
                return this.normalizeNaverNews(data.items);
            }
            
            return [];
            
        } catch (error) {
            console.error('❌ 네이버 뉴스 API 오류:', error.message);
            return [];
        }
    }

    // NewsAPI 유료 버전 호출
    async fetchNewsAPI(endpoint, params = {}) {
        try {
            console.log(`📡 NewsAPI 유료 호출: ${endpoint}`);
            
            const queryParams = {
                ...params,
                apiKey: this.apis.newsapi.apiKey
            };
            
            const url = `${this.apis.newsapi.baseUrl}/${endpoint}?${querystring.stringify(queryParams)}`;
            
            const data = await this.makeAPIRequest(url);
            
            if (data && data.articles) {
                console.log(`✅ NewsAPI: ${data.articles.length}개 기사 수집`);
                return this.normalizeNewsAPIData(data.articles);
            }
            
            return [];
            
        } catch (error) {
            console.error('❌ NewsAPI 오류:', error.message);
            return [];
        }
    }

    // YouTube 뉴스 채널 수집
    async fetchYouTubeNews(region = 'US', maxResults = 8) {
        if (!this.apis.youtube.apiKey) {
            console.warn('⚠️ YouTube API 키 없음');
            return [];
        }
        
        try {
            console.log(`📺 YouTube 뉴스 수집: ${region}`);
            
            const params = {
                part: 'snippet',
                chart: 'mostPopular',
                regionCode: region,
                videoCategoryId: '25', // News & Politics
                maxResults,
                key: this.apis.youtube.apiKey
            };
            
            const url = `${this.apis.youtube.baseUrl}/videos?${querystring.stringify(params)}`;
            const data = await this.makeAPIRequest(url);
            
            if (data && data.items) {
                console.log(`✅ YouTube: ${data.items.length}개 영상 수집`);
                return this.normalizeYouTubeData(data.items);
            }
            
            return [];
            
        } catch (error) {
            console.error('❌ YouTube API 오류:', error.message);
            return [];
        }
    }

    // 통합 API 요청 함수
    async makeAPIRequest(url, options = {}) {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const protocol = urlObj.protocol === 'https:' ? https : http;
            
            const requestOptions = {
                hostname: urlObj.hostname,
                port: urlObj.port,
                path: urlObj.pathname + urlObj.search,
                method: options.method || 'GET',
                headers: options.headers || {},
                timeout: 6000
            };
            
            const req = protocol.request(requestOptions, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const jsonData = JSON.parse(data);
                        resolve(jsonData);
                    } catch (error) {
                        reject(new Error(`JSON 파싱 오류: ${error.message}`));
                    }
                });
            });
            
            req.on('error', (error) => {
                reject(new Error(`요청 오류: ${error.message}`));
            });
            
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('요청 타임아웃'));
            });
            
            if (options.body) {
                req.write(options.body);
            }
            
            req.end();
        });
    }

    // AI 번역 함수 (OpenAI)
    async translateToKorean(text, isLongText = false) {
        if (!text || text.length < 5) return text;
        
        // 이미 한국어인 경우 체크
        if (this.isKorean(text)) return text;
        
        // 캐시 확인
        const cacheKey = text.substring(0, 100);
        if (this.translationCache.has(cacheKey)) {
            return this.translationCache.get(cacheKey);
        }
        
        try {
            let translatedText = text;
            
            // OpenAI 번역 시도
            if (process.env.OPENAI_API_KEY) {
                translatedText = await this.translateWithOpenAI(text, isLongText);
            } else {
                // 기본 번역 사용
                translatedText = this.basicTranslation(text);
            }
            
            // 캐시 저장
            this.translationCache.set(cacheKey, translatedText);
            return translatedText;
            
        } catch (error) {
            console.warn('번역 실패, 기본 번역 사용:', error.message);
            return this.basicTranslation(text);
        }
    }

    // 한국어 체크
    isKorean(text) {
        const koreanRegex = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/;
        return koreanRegex.test(text);
    }

    // OpenAI 번역
    async translateWithOpenAI(text, isLongText) {
        const prompt = isLongText 
            ? `다음 영어 뉴스 기사를 자연스러운 한국어로 번역해주세요. 문단 구분과 들여쓰기를 유지하고, 읽기 쉽게 정리해주세요:\n\n${text}`
            : `다음 영어 텍스트를 자연스러운 한국어로 번역해주세요:\n\n${text}`;
        
        const requestBody = JSON.stringify({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: "당신은 전문 번역가입니다. 영어를 자연스럽고 읽기 쉬운 한국어로 번역해주세요."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            max_tokens: isLongText ? 1500 : 400,
            temperature: 0.3
        });

        return new Promise((resolve, reject) => {
            const req = https.request({
                hostname: 'api.openai.com',
                path: '/v1/chat/completions',
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(requestBody)
                },
                timeout: 8000
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);
                        if (response.choices && response.choices[0]) {
                            resolve(response.choices[0].message.content.trim());
                        } else {
                            reject(new Error('OpenAI 응답 오류'));
                        }
                    } catch (error) {
                        reject(error);
                    }
                });
            });

            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('번역 타임아웃'));
            });
            
            req.write(requestBody);
            req.end();
        });
    }

    // 기본 번역 (API 실패 시)
    basicTranslation(text) {
        const translations = {
            'breaking news': '속보',
            'breaking': '속보',
            'urgent': '긴급',
            'exclusive': '단독',
            'update': '업데이트',
            'report': '보고서',
            'president': '대통령',
            'government': '정부',
            'economy': '경제',
            'technology': '기술',
            'health': '건강',
            'sports': '스포츠',
            'world': '세계',
            'international': '국제',
            'business': '비즈니스',
            'politics': '정치',
            'says': '발표',
            'announces': '발표',
            'dies': '사망',
            'killed': '사망',
            'earthquake': '지진',
            'fire': '화재',
            'explosion': '폭발'
        };
        
        let translated = text;
        for (const [en, ko] of Object.entries(translations)) {
            const regex = new RegExp(`\\b${en}\\b`, 'gi');
            translated = translated.replace(regex, ko);
        }
        
        return translated;
    }

    // 네이버 뉴스 데이터 정규화
    normalizeNaverNews(items) {
        return items.map(item => ({
            id: this.generateId(item.title + item.link),
            title: this.cleanHTML(item.title),
            originalTitle: this.cleanHTML(item.title),
            description: this.cleanHTML(item.description),
            originalDescription: this.cleanHTML(item.description),
            url: item.link,
            urlToImage: null, // 네이버 뉴스는 이미지 제공 안함
            publishedAt: this.parseNaverDate(item.pubDate),
            source: {
                id: 'naver',
                name: this.extractNaverSource(item.title) || '네이버뉴스'
            },
            category: '한국',
            apiSource: 'naver',
            qualityScore: this.calculateNaverQuality(item),
            isKorean: true
        }));
    }

    // NewsAPI 데이터 정규화
    normalizeNewsAPIData(articles) {
        return articles.map(article => ({
            id: this.generateId(article.title + article.url),
            title: article.title,
            originalTitle: article.title,
            description: article.description,
            originalDescription: article.description,
            url: article.url,
            urlToImage: article.urlToImage,
            publishedAt: article.publishedAt,
            source: {
                id: article.source.id || 'newsapi',
                name: article.source.name || 'NewsAPI'
            },
            category: this.detectCategory(article.title + ' ' + article.description),
            apiSource: 'newsapi',
            qualityScore: this.calculateNewsAPIQuality(article),
            isKorean: false
        }));
    }

    // YouTube 데이터 정규화
    normalizeYouTubeData(items) {
        return items.map(item => ({
            id: this.generateId(item.snippet.title + item.id),
            title: item.snippet.title,
            originalTitle: item.snippet.title,
            description: item.snippet.description,
            originalDescription: item.snippet.description,
            url: `https://www.youtube.com/watch?v=${item.id}&cc_load_policy=1&cc_lang_pref=ko&hl=ko`,
            urlToImage: item.snippet.thumbnails?.medium?.url,
            publishedAt: item.snippet.publishedAt,
            source: {
                id: 'youtube',
                name: item.snippet.channelTitle
            },
            category: '영상뉴스',
            apiSource: 'youtube',
            isVideo: true,
            qualityScore: this.calculateYouTubeQuality(item),
            isKorean: false
        }));
    }

    // HTML 태그 제거
    cleanHTML(text) {
        if (!text) return '';
        return text
            .replace(/<[^>]*>/g, '')
            .replace(/&[^;]+;/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    // 네이버 날짜 파싱
    parseNaverDate(pubDate) {
        try {
            return new Date(pubDate).toISOString();
        } catch {
            return new Date().toISOString();
        }
    }

    // 네이버 소스 추출
    extractNaverSource(title) {
        const sources = ['연합뉴스', '조선일보', '중앙일보', '동아일보', '한국일보', '경향신문', 'KBS', 'MBC', 'SBS', '한겨레', '서울신문'];
        for (const source of sources) {
            if (title.includes(source)) {
                return source;
            }
        }
        return null;
    }

    // 카테고리 감지
    detectCategory(text) {
        const lowerText = text.toLowerCase();
        
        const categories = {
            '정치': [...this.importantKeywords.ko.slice(0, 4), ...this.importantKeywords.en.slice(0, 4)],
            '경제': ['경제', '주식', '환율', '금리', 'economy', 'stock', 'market', 'finance', 'business'],
            '기술': ['기술', '테크', 'AI', '인공지능', 'tech', 'ai', 'digital', 'cyber', 'software'],
            '스포츠': ['스포츠', '축구', '야구', '농구', 'sport', 'soccer', 'baseball', 'basketball'],
            '건강': ['건강', '의료', '코로나', '백신', 'health', 'medical', 'covid', 'vaccine'],
            '국제': ['국제', '세계', '외교', 'world', 'international', 'global', 'diplomatic']
        };
        
        for (const [category, keywords] of Object.entries(categories)) {
            if (keywords.some(keyword => lowerText.includes(keyword))) {
                return category;
            }
        }
        
        return '일반';
    }

    // 품질 점수 계산
    calculateNaverQuality(item) {
        let score = 12; // 네이버 프리미엄 기본 점수
        
        if (item.title && item.title.length >= 20) score += 2;
        if (item.description && item.description.length >= 50) score += 2;
        
        // 긴급성 체크
        const title = item.title.toLowerCase();
        if (this.urgentKeywords.ko.some(keyword => title.includes(keyword))) {
            score += 4;
        }
        
        // 소스 신뢰도
        const sourceName = this.extractNaverSource(item.title);
        if (sourceName) {
            const reliability = this.sourceReliability.get(sourceName) || 0.8;
            score += Math.round(reliability * 3);
        }
        
        return Math.min(score, 20);
    }

    calculateNewsAPIQuality(article) {
        let score = 14; // NewsAPI 유료 프리미엄 기본 점수
        
        if (article.title && article.title.length >= 20) score += 2;
        if (article.description && article.description.length >= 100) score += 2;
        if (article.urlToImage) score += 1;
        
        // 소스 신뢰도
        const sourceId = article.source?.id || '';
        const reliability = this.sourceReliability.get(sourceId) || 0.7;
        score += Math.round(reliability * 4);
        
        return Math.min(score, 20);
    }

    calculateYouTubeQuality(item) {
        let score = 10; // YouTube 프리미엄 기본 점수
        
        if (item.snippet.title && item.snippet.title.length >= 20) score += 2;
        if (item.snippet.description && item.snippet.description.length >= 100) score += 2;
        if (item.snippet.thumbnails?.medium) score += 1;
        
        return Math.min(score, 18);
    }

    // 중복 제거 (고급 알고리즘)
    removeDuplicates(articles) {
        const uniqueArticles = [];
        const seenTitles = new Set();
        const seenUrls = new Set();
        
        for (const article of articles) {
            // URL 기반 중복 체크
            if (seenUrls.has(article.url)) continue;
            
            // 제목 유사도 기반 중복 체크
            const titleKey = this.normalizeTitle(article.title);
            if (seenTitles.has(titleKey)) continue;
            
            seenUrls.add(article.url);
            seenTitles.add(titleKey);
            uniqueArticles.push(article);
        }
        
        console.log(`🔄 중복 제거: ${articles.length} → ${uniqueArticles.length}`);
        return uniqueArticles;
    }

    // 제목 정규화 (중복 감지용)
    normalizeTitle(title) {
        return title
            .toLowerCase()
            .replace(/[^\w\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 30);
    }

    // 긴급도 분석
    analyzeUrgency(article) {
        const text = (article.title + ' ' + article.description).toLowerCase();
        let urgency = 2;
        
        // 언어별 긴급 키워드 체크
        const allUrgentKeywords = [
            ...this.urgentKeywords.ko,
            ...this.urgentKeywords.en,
            ...this.urgentKeywords.ja
        ];
        
        const urgentMatches = allUrgentKeywords.filter(keyword => text.includes(keyword)).length;
        
        if (urgentMatches >= 2) urgency = 5;
        else if (urgentMatches >= 1) urgency = 4;
        else if (this.importantKeywords.ko.some(keyword => text.includes(keyword))) urgency = 3;
        
        return urgency;
    }

    // 중요도 분석
    analyzeImportance(article) {
        const text = (article.title + ' ' + article.description).toLowerCase();
        let importance = 3;
        
        // 소스 신뢰도 반영
        const sourceReliability = this.sourceReliability.get(article.source.name) || 0.5;
        importance += Math.round(sourceReliability * 2);
        
        // 중요 키워드 체크
        const allImportantKeywords = [
            ...this.importantKeywords.ko,
            ...this.importantKeywords.en,
            ...this.importantKeywords.ja
        ];
        
        const importantMatches = allImportantKeywords.filter(keyword => text.includes(keyword)).length;
        if (importantMatches >= 2) importance += 2;
        else if (importantMatches >= 1) importance += 1;
        
        return Math.min(importance, 5);
    }

    // 메인 뉴스 수집 함수
    async collectAllNews() {
        const cacheKey = 'premium_multi_api_news_v3';
        const cacheExpiry = 5 * 60 * 1000; // 5분 캐시
        
        // 캐시 확인
        if (this.newsCache.has(cacheKey)) {
            const cached = this.newsCache.get(cacheKey);
            if (Date.now() - cached.timestamp < cacheExpiry) {
                console.log('📦 프리미엄 v3 캐시 데이터 사용');
                return cached.data;
            }
        }
        
        console.log('🚀 프리미엄 다중 API 뉴스 수집 v3.0 시작...');
        const startTime = Date.now();
        
        try {
            // 병렬로 모든 API 호출
            const [
                // 세계 뉴스 (NewsAPI 유료)
                worldNewsAPI,
                worldBusinessAPI,
                worldTechAPI,
                
                // 한국 뉴스 (네이버 + NewsAPI)
                koreaNaverGeneral,
                koreaNaverUrgent,
                koreaNewsAPI,
                
                // 일본 뉴스 (NewsAPI)
                japanNewsAPI,
                
                // YouTube 뉴스
                youtubeUS,
                youtubeKR,
                youtubeJP
            ] = await Promise.allSettled([
                // 세계 뉴스
                this.fetchNewsAPI('top-headlines', { country: 'us', pageSize: 25 }),
                this.fetchNewsAPI('top-headlines', { category: 'business', pageSize: 20 }),
                this.fetchNewsAPI('top-headlines', { category: 'technology', pageSize: 20 }),
                
                // 한국 뉴스
                this.fetchNaverNews('뉴스', 25, 'date'),
                this.fetchNaverNews('속보 OR 긴급 OR 단독', 15, 'date'),
                this.fetchNewsAPI('top-headlines', { country: 'kr', pageSize: 20 }),
                
                // 일본 뉴스
                this.fetchNewsAPI('top-headlines', { country: 'jp', pageSize: 20 }),
                
                // YouTube
                this.fetchYouTubeNews('US', 8),
                this.fetchYouTubeNews('KR', 8),
                this.fetchYouTubeNews('JP', 8)
            ]);
            
            // 성공한 결과만 추출
            const extractValue = (result) => result.status === 'fulfilled' ? result.value : [];
            
            // 지역별 기사 통합
            const worldArticles = [
                ...extractValue(worldNewsAPI),
                ...extractValue(worldBusinessAPI),
                ...extractValue(worldTechAPI),
                ...extractValue(youtubeUS)
            ];
            
            const koreaArticles = [
                ...extractValue(koreaNaverGeneral),
                ...extractValue(koreaNaverUrgent),
                ...extractValue(koreaNewsAPI),
                ...extractValue(youtubeKR)
            ];
            
            const japanArticles = [
                ...extractValue(japanNewsAPI),
                ...extractValue(youtubeJP)
            ];
            
            console.log(`📊 수집 완료: 세계 ${worldArticles.length}, 한국 ${koreaArticles.length}, 일본 ${japanArticles.length}`);
            
            // 각 섹션 처리 (번역 포함)
            const processedSections = await Promise.all([
                this.processSection(worldArticles, 6, '세계뉴스'),
                this.processSection(koreaArticles, 6, '한국뉴스'),
                this.processSection(japanArticles, 6, '일본뉴스')
            ]);
            
            // 트렌딩 키워드 생성
            const allArticles = [...worldArticles, ...koreaArticles, ...japanArticles];
            const trending = this.generateTrending(allArticles);
            
            const result = {
                sections: {
                    world: processedSections[0],
                    korea: processedSections[1],
                    japan: processedSections[2]
                },
                trending,
                lastUpdated: new Date().toISOString(),
                totalArticles: processedSections.reduce((sum, section) => sum + section.length, 0),
                systemStatus: this.getSystemStatus(),
                processingTime: Date.now() - startTime,
                apiSources: ['naver-premium', 'newsapi-premium', 'youtube-premium'],
                version: '3.0.0-premium-translation'
            };
            
            // 캐시 저장
            this.newsCache.set(cacheKey, {
                data: result,
                timestamp: Date.now()
            });
            
            console.log(`✅ 프리미엄 뉴스 처리 완료 (${Date.now() - startTime}ms)`);
            return result;
            
        } catch (error) {
            console.error('❌ 프리미엄 뉴스 수집 오류:', error);
            return this.getDefaultNewsData();
        }
    }

    // 섹션 처리 (고급 분석 + 번역 포함)
    async processSection(articles, maxCount, sectionName) {
        console.log(`📰 ${sectionName} 프리미엄 처리 시작: ${articles.length}개`);
        
        if (!articles || articles.length === 0) return [];
        
        // 중복 제거
        const uniqueArticles = this.removeDuplicates(articles);
        
        // 품질 필터링
        const qualityFiltered = uniqueArticles.filter(article => 
            article.qualityScore >= 12 &&
            article.title &&
            article.title.length >= 15
        );
        
        // 병렬 분석 및 번역 처리
        const analyzedPromises = qualityFiltered.map(async (article) => {
            try {
                const urgency = this.analyzeUrgency(article);
                const importance = this.analyzeImportance(article);
                const buzz = Math.min(urgency + Math.floor(Math.random() * 2), 5);
                
                // 번역 처리 (영어 기사만)
                let translatedTitle = article.title;
                let translatedDescription = article.description;
                
                if (!article.isKorean) {
                    translatedTitle = await this.translateToKorean(article.title);
                    translatedDescription = await this.translateToKorean(article.description, true);
                }
                
                return {
                    ...article,
                    title: translatedTitle,
                    description: translatedDescription,
                    urgency,
                    importance,
                    buzz,
                    stars: Math.min(Math.round((urgency + importance) / 2), 5),
                    keywords: this.extractKeywords(translatedTitle + ' ' + translatedDescription),
                    sentiment: this.analyzeSentiment(translatedTitle + ' ' + translatedDescription),
                    finalScore: article.qualityScore + urgency + importance,
                    isTranslated: !article.isKorean
                };
            } catch (error) {
                console.warn(`기사 분석 실패: ${article.title}`);
                return null;
            }
        });
        
        const analyzedArticles = (await Promise.all(analyzedPromises))
            .filter(article => article !== null);
        
        const result = analyzedArticles
            .sort((a, b) => b.finalScore - a.finalScore)
            .slice(0, maxCount);
        
        console.log(`✅ ${sectionName} 프리미엄 처리 완료: ${result.length}개 (번역 포함)`);
        return result;
    }

    // 키워드 추출
    extractKeywords(text) {
        const words = text.toLowerCase().match(/\b\w{2,}\b/g) || [];
        const wordCount = new Map();
        
        const stopWords = new Set(['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'man', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'its', 'let', 'put', 'say', 'she', 'too', 'use', '이', '그', '저', '것', '수', '등', '및', '또', '더', '한', '를', '을', '의', '가', '에', '로', '으로']);
        
        words.forEach(word => {
            if (!stopWords.has(word) && word.length >= 2) {
                wordCount.set(word, (wordCount.get(word) || 0) + 1);
            }
        });
        
        return [...wordCount.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([word]) => word);
    }

    // 감정 분석
    analyzeSentiment(text) {
        const positive = ['good', 'great', 'success', 'win', 'positive', 'growth', '성공', '좋은', '긍정', '발전', '증가', '상승'];
        const negative = ['bad', 'crisis', 'fail', 'negative', 'decline', 'problem', '위기', '실패', '부정', '감소', '하락', '문제'];
        
        const lowerText = text.toLowerCase();
        const positiveCount = positive.filter(word => lowerText.includes(word)).length;
        const negativeCount = negative.filter(word => lowerText.includes(word)).length;
        
        if (positiveCount > negativeCount) return '긍정';
        if (negativeCount > positiveCount) return '부정';
        return '중립';
    }

    // 트렌딩 키워드 생성
    generateTrending(articles) {
        const wordCount = new Map();
        
        articles.forEach(article => {
            const keywords = this.extractKeywords(article.title + ' ' + article.description);
            keywords.forEach(keyword => {
                wordCount.set(keyword, (wordCount.get(keyword) || 0) + 1);
            });
        });
        
        return [...wordCount.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 15);
    }

    // ID 생성
    generateId(text) {
        return require('crypto')
            .createHash('md5')
            .update(text)
            .digest('hex')
            .substring(0, 8);
    }

    // 시스템 상태
    getSystemStatus() {
        return {
            cacheSize: this.newsCache.size,
            translationCacheSize: this.translationCache.size,
            lastUpdate: new Date().toISOString(),
            apiSources: {
                naver: !!this.apis.naver.clientId,
                newsapi: !!this.apis.newsapi.apiKey,
                youtube: !!this.apis.youtube.apiKey,
                openai: !!process.env.OPENAI_API_KEY
            },
            premiumFeatures: ['multi-api', 'ai-translation', 'duplicate-removal', 'quality-scoring', 'urgency-analysis'],
            version: '3.0.0-premium-translation'
        };
    }

    // 기본 데이터
    getDefaultNewsData() {
        const now = new Date().toISOString();
        const defaultArticle = {
            id: 'premium-v3-1',
            title: 'EmarkNews 프리미엄 v3.0 AI 번역 시스템 활성화',
            description: '네이버 뉴스 API, NewsAPI 유료 버전, YouTube API를 통합하고 OpenAI 번역 시스템을 추가하여 실시간 다국어 뉴스를 한국어로 제공합니다. 고급 품질 평가, 긴급도 분석, 중복 제거 등 프리미엄 기능이 포함되어 있습니다.',
            url: '#',
            urlToImage: null,
            publishedAt: now,
            source: { id: 'emarknews', name: 'EmarkNews Premium v3.0' },
            category: '시스템',
            urgency: 4,
            importance: 5,
            buzz: 4,
            stars: 5,
            keywords: ['프리미엄', 'AI번역', '다중API', '고품질'],
            sentiment: '긍정',
            qualityScore: 20,
            isTranslated: false
        };

        return {
            sections: {
                world: [defaultArticle],
                korea: [{ ...defaultArticle, id: 'premium-v3-2', title: '네이버 뉴스 API 프리미엄 연동 완료' }],
                japan: [{ ...defaultArticle, id: 'premium-v3-3', title: 'NewsAPI 유료 + YouTube 프리미엄 활성화' }]
            },
            trending: [['프리미엄', 15], ['AI번역', 12], ['다중API', 10], ['고품질', 8]],
            lastUpdated: now,
            totalArticles: 3,
            systemStatus: this.getSystemStatus(),
            version: '3.0.0-premium-translation'
        };
    }

    // 캐시 클리어
    clearCache() {
        this.newsCache.clear();
        this.translationCache.clear();
        this.duplicateCache.clear();
        console.log('🗑️ 프리미엄 v3 캐시 클리어 완료');
    }
}

module.exports = PremiumMultiAPINewsSystem;

