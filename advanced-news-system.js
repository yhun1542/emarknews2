const https = require('https');
const http = require('http');
const querystring = require('querystring');

class FreshNewsOnlySystem {
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
        
        // 최신성 기준 (48시간)
        this.maxNewsAge = 48 * 60 * 60 * 1000; // 48시간을 밀리초로
        this.preferredNewsAge = 24 * 60 * 60 * 1000; // 24시간을 밀리초로
        
        // 소스 신뢰도
        this.sourceReliability = new Map([
            // 글로벌 프리미엄
            ['bbc-news', 0.98], ['reuters', 0.98], ['associated-press', 0.97],
            ['bloomberg', 0.95], ['the-guardian-uk', 0.92], ['cnn', 0.90],
            ['the-new-york-times', 0.95], ['the-washington-post', 0.93],
            ['npr', 0.94], ['abc-news', 0.88], ['cbs-news', 0.88],
            // 한국 프리미엄
            ['연합뉴스', 0.95], ['조선일보', 0.90], ['중앙일보', 0.90],
            ['동아일보', 0.88], ['한국일보', 0.87], ['경향신문', 0.85],
            ['KBS', 0.92], ['MBC', 0.90], ['SBS', 0.88], ['JTBC', 0.87],
            // 일본 프리미엄
            ['NHK', 0.95], ['朝日新聞', 0.92], ['読売新聞', 0.92]
        ]);
        
        // 긴급 키워드
        this.urgentKeywords = {
            ko: ['속보', '긴급', '단독', '발표', '사망', '사고', '지진', '화재', '폭발', '테러', '붕괴', '침몰', '확진'],
            en: ['breaking', 'urgent', 'exclusive', 'dies', 'dead', 'earthquake', 'fire', 'explosion', 'terror', 'collapse', 'crash'],
            ja: ['速報', '緊急', '独占', '死亡', '事故', '地震', '火災', '爆発', 'テロ']
        };
        
        // 중요 키워드
        this.importantKeywords = {
            ko: ['대통령', '총리', '장관', '국회', '선거', '경제', '주식', '환율', '코로나', '백신', '북한', '중국', '미국'],
            en: ['president', 'minister', 'congress', 'election', 'economy', 'stock', 'covid', 'vaccine', 'china', 'russia', 'ukraine'],
            ja: ['総理', '大臣', '国会', '選挙', '経済', '株式', 'コロナ', 'ワクチン']
        };
        
        console.log('🚀 최신 뉴스 전용 프리미엄 시스템 초기화 완료');
        console.log('⏰ 뉴스 수집 기준: 최근 48시간 이내만');
    }

    // 날짜 신선도 체크 (핵심 기능)
    isNewsFresh(publishedAt, strictMode = false) {
        if (!publishedAt) return false;
        
        try {
            const newsDate = new Date(publishedAt);
            const now = new Date();
            const ageInMs = now - newsDate;
            
            // 미래 날짜 거부
            if (ageInMs < 0) {
                console.warn(`⚠️ 미래 날짜 뉴스 거부: ${publishedAt}`);
                return false;
            }
            
            // 엄격 모드 (24시간)
            if (strictMode) {
                const isFresh = ageInMs <= this.preferredNewsAge;
                if (!isFresh) {
                    console.log(`❌ 24시간 초과 뉴스 거부: ${this.formatAge(ageInMs)} 전`);
                }
                return isFresh;
            }
            
            // 일반 모드 (48시간)
            const isFresh = ageInMs <= this.maxNewsAge;
            if (!isFresh) {
                console.log(`❌ 48시간 초과 뉴스 거부: ${this.formatAge(ageInMs)} 전`);
            }
            return isFresh;
            
        } catch (error) {
            console.error('날짜 파싱 오류:', error);
            return false;
        }
    }

    // 나이 포맷팅
    formatAge(ageInMs) {
        const hours = Math.floor(ageInMs / (1000 * 60 * 60));
        const days = Math.floor(hours / 24);
        
        if (days > 0) return `${days}일 ${hours % 24}시간`;
        return `${hours}시간`;
    }

    // 네이버 뉴스 API 호출 (최신 뉴스만)
    async fetchNaverNews(query, display = 30, sort = 'date') {
        try {
            console.log(`📰 네이버 최신 뉴스 검색: "${query}"`);
            
            const encodedQuery = encodeURIComponent(query);
            const url = `${this.apis.naver.baseUrl}?query=${encodedQuery}&display=${display}&sort=${sort}`;
            
            const options = {
                method: 'GET',
                headers: {
                    'X-Naver-Client-Id': this.apis.naver.clientId,
                    'X-Naver-Client-Secret': this.apis.naver.clientSecret,
                    'User-Agent': 'EmarkNews/3.1 Fresh-Only'
                }
            };
            
            const data = await this.makeAPIRequest(url, options);
            
            if (data && data.items) {
                console.log(`📊 네이버 원본: ${data.items.length}개`);
                
                // 최신성 필터링
                const freshItems = data.items.filter(item => {
                    const isFresh = this.isNewsFresh(item.pubDate);
                    if (!isFresh) {
                        console.log(`🗑️ 오래된 뉴스 제거: ${item.title.substring(0, 50)}... (${item.pubDate})`);
                    }
                    return isFresh;
                });
                
                console.log(`✅ 네이버 최신 뉴스: ${freshItems.length}개 (${data.items.length - freshItems.length}개 제거)`);
                return this.normalizeNaverNews(freshItems);
            }
            
            return [];
            
        } catch (error) {
            console.error('❌ 네이버 뉴스 API 오류:', error.message);
            return [];
        }
    }

    // NewsAPI 유료 버전 호출 (최신 뉴스만)
    async fetchNewsAPI(endpoint, params = {}) {
        try {
            console.log(`📡 NewsAPI 최신 뉴스 호출: ${endpoint}`);
            
            // 최신 뉴스만 가져오기 위한 날짜 필터 추가
            const twoDaysAgo = new Date(Date.now() - this.maxNewsAge).toISOString();
            
            const queryParams = {
                ...params,
                from: twoDaysAgo, // 48시간 전부터
                sortBy: 'publishedAt', // 최신순 정렬
                apiKey: this.apis.newsapi.apiKey
            };
            
            const url = `${this.apis.newsapi.baseUrl}/${endpoint}?${querystring.stringify(queryParams)}`;
            
            const data = await this.makeAPIRequest(url);
            
            if (data && data.articles) {
                console.log(`📊 NewsAPI 원본: ${data.articles.length}개`);
                
                // 추가 최신성 필터링 (API 필터가 완벽하지 않을 수 있음)
                const freshArticles = data.articles.filter(article => {
                    const isFresh = this.isNewsFresh(article.publishedAt);
                    if (!isFresh) {
                        console.log(`🗑️ 오래된 뉴스 제거: ${article.title.substring(0, 50)}... (${article.publishedAt})`);
                    }
                    return isFresh;
                });
                
                console.log(`✅ NewsAPI 최신 뉴스: ${freshArticles.length}개 (${data.articles.length - freshArticles.length}개 제거)`);
                return this.normalizeNewsAPIData(freshArticles);
            }
            
            return [];
            
        } catch (error) {
            console.error('❌ NewsAPI 오류:', error.message);
            return [];
        }
    }

    // YouTube 뉴스 채널 수집 (최신만)
    async fetchYouTubeNews(region = 'US', maxResults = 10) {
        if (!this.apis.youtube.apiKey) {
            console.warn('⚠️ YouTube API 키 없음');
            return [];
        }
        
        try {
            console.log(`📺 YouTube 최신 뉴스 수집: ${region}`);
            
            const params = {
                part: 'snippet',
                chart: 'mostPopular',
                regionCode: region,
                videoCategoryId: '25', // News & Politics
                maxResults: maxResults * 2, // 필터링을 고려해 더 많이 가져옴
                key: this.apis.youtube.apiKey
            };
            
            const url = `${this.apis.youtube.baseUrl}/videos?${querystring.stringify(params)}`;
            const data = await this.makeAPIRequest(url);
            
            if (data && data.items) {
                console.log(`📊 YouTube 원본: ${data.items.length}개`);
                
                // 최신성 필터링
                const freshItems = data.items.filter(item => {
                    const isFresh = this.isNewsFresh(item.snippet.publishedAt);
                    if (!isFresh) {
                        console.log(`🗑️ 오래된 영상 제거: ${item.snippet.title.substring(0, 50)}... (${item.snippet.publishedAt})`);
                    }
                    return isFresh;
                });
                
                console.log(`✅ YouTube 최신 영상: ${freshItems.length}개 (${data.items.length - freshItems.length}개 제거)`);
                return this.normalizeYouTubeData(freshItems.slice(0, maxResults));
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
                timeout: 8000
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

    // AI 번역 함수
    async translateToKorean(text, isLongText = false) {
        if (!text || text.length < 5) return text;
        if (this.isKorean(text)) return text;
        
        const cacheKey = text.substring(0, 100);
        if (this.translationCache.has(cacheKey)) {
            return this.translationCache.get(cacheKey);
        }
        
        try {
            let translatedText = text;
            
            if (process.env.OPENAI_API_KEY) {
                translatedText = await this.translateWithOpenAI(text, isLongText);
            } else {
                translatedText = this.basicTranslation(text);
            }
            
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
            ? `다음 영어 뉴스를 자연스러운 한국어로 번역해주세요:\n\n${text}`
            : `다음을 한국어로 번역해주세요:\n\n${text}`;
        
        const requestBody = JSON.stringify({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: "당신은 전문 뉴스 번역가입니다. 영어를 자연스러운 한국어로 번역해주세요."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            max_tokens: isLongText ? 1000 : 300,
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
                timeout: 10000
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

    // 기본 번역
    basicTranslation(text) {
        const translations = {
            'breaking news': '속보',
            'breaking': '속보',
            'urgent': '긴급',
            'exclusive': '단독',
            'update': '업데이트',
            'president': '대통령',
            'government': '정부',
            'economy': '경제',
            'technology': '기술',
            'health': '건강',
            'sports': '스포츠',
            'world': '세계',
            'business': '비즈니스',
            'politics': '정치'
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
            urlToImage: null,
            publishedAt: this.parseNaverDate(item.pubDate),
            source: {
                id: 'naver',
                name: this.extractNaverSource(item.title) || '네이버뉴스'
            },
            category: '한국',
            apiSource: 'naver',
            qualityScore: this.calculateNaverQuality(item),
            isKorean: true,
            newsAge: this.calculateNewsAge(item.pubDate)
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
            isKorean: false,
            newsAge: this.calculateNewsAge(article.publishedAt)
        }));
    }

    // YouTube 데이터 정규화
    normalizeYouTubeData(items) {
        return items.map(item => ({
            id: this.generateId(item.snippet.title + item.id.videoId),
            title: item.snippet.title,
            originalTitle: item.snippet.title,
            description: item.snippet.description,
            originalDescription: item.snippet.description,
            url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
            urlToImage: item.snippet.thumbnails?.medium?.url,
            publishedAt: item.snippet.publishedAt,
            source: {
                id: 'youtube',
                name: item.snippet.channelTitle || 'YouTube'
            },
            category: this.detectCategory(item.snippet.title + ' ' + item.snippet.description),
            apiSource: 'youtube',
            qualityScore: this.calculateYouTubeQuality(item),
            isKorean: false,
            newsAge: this.calculateNewsAge(item.snippet.publishedAt)
        }));
    }

    // HTML 태그 제거
    cleanHTML(text) {
        if (!text) return '';
        return text.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').trim();
    }

    // 네이버 날짜 파싱
    parseNaverDate(dateStr) {
        try {
            // 네이버 날짜 형식: "Mon, 09 Aug 2025 12:34:56 +0900"
            return new Date(dateStr).toISOString();
        } catch (error) {
            console.warn('네이버 날짜 파싱 오류:', dateStr);
            return new Date().toISOString();
        }
    }

    // 뉴스 나이 계산
    calculateNewsAge(publishedAt) {
        try {
            const newsDate = new Date(publishedAt);
            const now = new Date();
            const ageInHours = Math.floor((now - newsDate) / (1000 * 60 * 60));
            return ageInHours;
        } catch (error) {
            return 999; // 파싱 실패 시 매우 오래된 것으로 처리
        }
    }

    // 네이버 소스 추출
    extractNaverSource(title) {
        const sources = ['KBS', 'MBC', 'SBS', 'JTBC', 'YTN', '연합뉴스', '조선일보', '중앙일보', '동아일보'];
        for (const source of sources) {
            if (title.includes(source)) return source;
        }
        return null;
    }

    // 카테고리 감지
    detectCategory(text) {
        const categories = {
            '정치': ['대통령', '국회', '정부', '장관', '선거', '정치'],
            '경제': ['경제', '주식', '환율', '금리', '투자', '기업'],
            '사회': ['사회', '사건', '사고', '범죄', '재판'],
            '국제': ['미국', '중국', '일본', '러시아', '유럽', '국제'],
            '스포츠': ['축구', '야구', '농구', '올림픽', '월드컵'],
            '기술': ['IT', '기술', '인공지능', 'AI', '스마트폰']
        };
        
        for (const [category, keywords] of Object.entries(categories)) {
            if (keywords.some(keyword => text.includes(keyword))) {
                return category;
            }
        }
        
        return '일반';
    }

    // 품질 점수 계산
    calculateNaverQuality(item) {
        let score = 10; // 기본 점수
        
        // 제목 길이
        if (item.title && item.title.length > 20) score += 2;
        if (item.title && item.title.length > 40) score += 3;
        
        // 설명 길이
        if (item.description && item.description.length > 50) score += 3;
        if (item.description && item.description.length > 100) score += 2;
        
        // 최신성 보너스
        const ageInHours = this.calculateNewsAge(item.pubDate);
        if (ageInHours < 1) score += 5; // 1시간 이내
        else if (ageInHours < 6) score += 3; // 6시간 이내
        else if (ageInHours < 24) score += 1; // 24시간 이내
        
        return Math.min(score, 20); // 최대 20점
    }

    calculateNewsAPIQuality(article) {
        let score = 12; // NewsAPI는 기본적으로 높은 품질
        
        // 소스 신뢰도
        const sourceId = article.source?.id || '';
        const reliability = this.sourceReliability.get(sourceId) || 0.5;
        score += Math.floor(reliability * 5);
        
        // 이미지 존재
        if (article.urlToImage) score += 2;
        
        // 최신성
        const ageInHours = this.calculateNewsAge(article.publishedAt);
        if (ageInHours < 1) score += 3;
        else if (ageInHours < 6) score += 2;
        else if (ageInHours < 24) score += 1;
        
        return Math.min(score, 20);
    }

    calculateYouTubeQuality(item) {
        let score = 8; // YouTube는 기본 점수가 낮음
        
        // 채널 신뢰도 (뉴스 채널인지 확인)
        const channelTitle = item.snippet.channelTitle || '';
        const newsChannels = ['BBC', 'CNN', 'Reuters', 'AP', 'NBC', 'CBS', 'ABC'];
        if (newsChannels.some(channel => channelTitle.includes(channel))) {
            score += 5;
        }
        
        // 최신성
        const ageInHours = this.calculateNewsAge(item.snippet.publishedAt);
        if (ageInHours < 1) score += 4;
        else if (ageInHours < 6) score += 3;
        else if (ageInHours < 24) score += 2;
        
        return Math.min(score, 20);
    }

    // 긴급도 계산
    calculateUrgency(title, description) {
        const text = (title + ' ' + description).toLowerCase();
        let urgency = 1;
        
        // 긴급 키워드 체크
        for (const keywords of Object.values(this.urgentKeywords)) {
            for (const keyword of keywords) {
                if (text.includes(keyword.toLowerCase())) {
                    urgency = Math.max(urgency, 5);
                    break;
                }
            }
        }
        
        // 중요 키워드 체크
        for (const keywords of Object.values(this.importantKeywords)) {
            for (const keyword of keywords) {
                if (text.includes(keyword.toLowerCase())) {
                    urgency = Math.max(urgency, 3);
                    break;
                }
            }
        }
        
        return urgency;
    }

    // 중요도 계산
    calculateImportance(article) {
        let importance = 2; // 기본값
        
        // 소스 신뢰도 기반
        const sourceId = article.source?.id || '';
        const reliability = this.sourceReliability.get(sourceId) || 0.5;
        importance += Math.floor(reliability * 3);
        
        // 최신성 기반
        const ageInHours = this.calculateNewsAge(article.publishedAt);
        if (ageInHours < 1) importance += 2;
        else if (ageInHours < 6) importance += 1;
        
        return Math.min(importance, 5);
    }

    // 화제성 계산
    calculateBuzz(title, description) {
        const text = (title + ' ' + description).toLowerCase();
        let buzz = 2;
        
        // 화제성 키워드
        const buzzKeywords = ['독점', 'exclusive', '최초', 'first', '충격', 'shock', '논란', 'controversy'];
        
        for (const keyword of buzzKeywords) {
            if (text.includes(keyword)) {
                buzz += 1;
            }
        }
        
        return Math.min(buzz, 5);
    }

    // 별점 계산
    calculateStars(qualityScore, urgency, importance, buzz) {
        const totalScore = qualityScore + urgency + importance + buzz;
        
        if (totalScore >= 25) return 5;
        if (totalScore >= 20) return 4;
        if (totalScore >= 15) return 3;
        if (totalScore >= 10) return 2;
        return 1;
    }

    // 감정 분석
    analyzeSentiment(title, description) {
        const text = (title + ' ' + description).toLowerCase();
        
        const positive = ['성공', '승리', '발전', '성장', '개선', '해결', 'success', 'victory', 'growth', 'improvement'];
        const negative = ['사망', '사고', '실패', '위기', '문제', '논란', 'death', 'accident', 'failure', 'crisis', 'problem'];
        
        const positiveCount = positive.filter(word => text.includes(word)).length;
        const negativeCount = negative.filter(word => text.includes(word)).length;
        
        if (positiveCount > negativeCount) return '긍정';
        if (negativeCount > positiveCount) return '부정';
        return '중립';
    }

    // 키워드 추출
    extractKeywords(text) {
        if (!text) return [];
        
        // 한국어와 영어 키워드 추출
        const words = text.toLowerCase()
            .replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 1);
        
        // 불용어 제거
        const stopWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', '이', '가', '을', '를', '에', '의', '와', '과'];
        
        return words
            .filter(word => !stopWords.includes(word))
            .slice(0, 5); // 상위 5개만
    }

    // 중복 제거
    removeDuplicates(articles) {
        const seen = new Set();
        return articles.filter(article => {
            const key = article.title.substring(0, 50);
            if (seen.has(key)) {
                console.log(`🗑️ 중복 뉴스 제거: ${article.title.substring(0, 50)}...`);
                return false;
            }
            seen.add(key);
            return true;
        });
    }

    // 뉴스 처리 및 번역
    async processArticles(articles) {
        const processedArticles = [];
        
        for (const article of articles) {
            try {
                // 기본 점수 계산
                const urgency = this.calculateUrgency(article.title, article.description);
                const importance = this.calculateImportance(article);
                const buzz = this.calculateBuzz(article.title, article.description);
                const stars = this.calculateStars(article.qualityScore, urgency, importance, buzz);
                const sentiment = this.analyzeSentiment(article.title, article.description);
                const keywords = this.extractKeywords(article.title + ' ' + article.description);
                
                // 번역 (영어 뉴스만)
                let translatedTitle = article.title;
                let translatedDescription = article.description;
                let isTranslated = false;
                
                if (!article.isKorean && article.title) {
                    try {
                        translatedTitle = await this.translateToKorean(article.title);
                        if (article.description) {
                            translatedDescription = await this.translateToKorean(article.description, true);
                        }
                        isTranslated = true;
                        console.log(`🌐 번역 완료: ${article.title.substring(0, 30)}... → ${translatedTitle.substring(0, 30)}...`);
                    } catch (error) {
                        console.warn('번역 실패, 원문 유지:', error.message);
                    }
                }
                
                const processedArticle = {
                    ...article,
                    title: translatedTitle,
                    description: translatedDescription,
                    urgency,
                    importance,
                    buzz,
                    stars,
                    keywords,
                    sentiment,
                    qualityScore: article.qualityScore,
                    finalScore: article.qualityScore + urgency + importance + buzz,
                    isTranslated
                };
                
                processedArticles.push(processedArticle);
                
            } catch (error) {
                console.error('뉴스 처리 오류:', error);
                // 오류가 발생해도 원본 기사는 포함
                processedArticles.push({
                    ...article,
                    urgency: 2,
                    importance: 2,
                    buzz: 2,
                    stars: 2,
                    keywords: [],
                    sentiment: '중립',
                    finalScore: article.qualityScore + 6,
                    isTranslated: false
                });
            }
        }
        
        return processedArticles;
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

    // 메인 뉴스 수집 함수
    async collectAllNews() {
        console.log('🚀 최신 뉴스 전용 수집 시작...');
        const startTime = Date.now();
        
        try {
            // 병렬로 모든 소스에서 뉴스 수집
            const [
                koreanNews,
                worldNews,
                usNews,
                techNews,
                youtubeNews
            ] = await Promise.all([
                this.fetchNaverNews('최신뉴스', 20),
                this.fetchNewsAPI('top-headlines', { country: 'us', pageSize: 15 }),
                this.fetchNewsAPI('everything', { q: 'breaking news', language: 'en', pageSize: 10 }),
                this.fetchNewsAPI('everything', { q: 'technology', language: 'en', pageSize: 8 }),
                this.fetchYouTubeNews('US', 5)
            ]);
            
            console.log(`📊 수집 결과: 한국 ${koreanNews.length}, 세계 ${worldNews.length}, 미국 ${usNews.length}, 기술 ${techNews.length}, YouTube ${youtubeNews.length}`);
            
            // 모든 뉴스 합치기
            let allNews = [
                ...koreanNews,
                ...worldNews,
                ...usNews,
                ...techNews,
                ...youtubeNews
            ];
            
            console.log(`📰 전체 수집: ${allNews.length}개`);
            
            // 중복 제거
            allNews = this.removeDuplicates(allNews);
            console.log(`🔄 중복 제거 후: ${allNews.length}개`);
            
            // 최신성 재확인 (엄격 모드)
            const freshNews = allNews.filter(article => this.isNewsFresh(article.publishedAt, true));
            console.log(`⏰ 24시간 이내 최신 뉴스: ${freshNews.length}개 (${allNews.length - freshNews.length}개 추가 제거)`);
            
            // 뉴스 처리 및 번역
            const processedNews = await this.processArticles(freshNews);
            
            // 점수순 정렬
            processedNews.sort((a, b) => b.finalScore - a.finalScore);
            
            // 카테고리별 분류
            const sections = {
                world: processedNews.filter(article => !article.isKorean).slice(0, 6),
                korea: processedNews.filter(article => article.isKorean).slice(0, 6),
                japan: [] // 일본 뉴스는 별도 API 필요
            };
            
            // 트렌딩 키워드 생성
            const trending = this.generateTrending(processedNews);
            
            const result = {
                sections,
                trending,
                lastUpdated: new Date().toISOString(),
                totalArticles: processedNews.length,
                systemStatus: this.getSystemStatus(),
                processingTime: Date.now() - startTime,
                apiSources: ['naver-premium', 'newsapi-premium', 'youtube-premium'],
                version: '3.1.0-fresh-only'
            };
            
            console.log(`✅ 최신 뉴스 수집 완료: ${Date.now() - startTime}ms`);
            console.log(`📈 최종 결과: 세계 ${sections.world.length}, 한국 ${sections.korea.length}, 일본 ${sections.japan.length}`);
            
            return result;
            
        } catch (error) {
            console.error('❌ 뉴스 수집 오류:', error);
            return this.getDefaultNewsData();
        }
    }

    // 시스템 상태
    getSystemStatus() {
        return {
            cacheSize: this.newsCache.size,
            translationCacheSize: this.translationCache.size,
            lastUpdate: new Date().toISOString(),
            cacheVersion: Date.now(),
            apiSources: {
                naver: !!this.apis.naver.clientId,
                newsapi: !!this.apis.newsapi.apiKey,
                youtube: !!this.apis.youtube.apiKey,
                openai: !!process.env.OPENAI_API_KEY
            },
            premiumFeatures: ['fresh-only-48h', 'ai-translation', 'duplicate-removal', 'quality-scoring', 'urgency-analysis', 'cache-busting'],
            version: '3.1.0-fresh-only',
            freshnessPolicy: {
                maxAge: '48 hours',
                preferredAge: '24 hours',
                strictMode: true
            }
        };
    }

    // 기본 데이터
    getDefaultNewsData() {
        const now = new Date().toISOString();
        const defaultArticle = {
            id: 'fresh-v3-1',
            title: 'EmarkNews 최신 뉴스 전용 시스템 v3.1 활성화',
            description: '48시간 이내 최신 뉴스만 수집하는 프리미엄 시스템이 활성화되었습니다. 네이버 뉴스 API, NewsAPI 유료 버전, YouTube API를 통합하여 실시간 최신 뉴스만을 엄선해서 제공합니다.',
            url: '#',
            urlToImage: null,
            publishedAt: now,
            source: { id: 'emarknews', name: 'EmarkNews Fresh v3.1' },
            category: '시스템',
            urgency: 4,
            importance: 5,
            buzz: 4,
            stars: 5,
            keywords: ['최신뉴스', '48시간', '프리미엄', '실시간'],
            sentiment: '긍정',
            qualityScore: 20,
            isTranslated: false,
            newsAge: 0
        };

        return {
            sections: {
                world: [defaultArticle],
                korea: [{ ...defaultArticle, id: 'fresh-v3-2', title: '네이버 최신 뉴스 API 연동 완료 (48시간 이내만)' }],
                japan: [{ ...defaultArticle, id: 'fresh-v3-3', title: 'NewsAPI + YouTube 최신 뉴스 활성화' }]
            },
            trending: [['최신뉴스', 15], ['48시간', 12], ['프리미엄', 10], ['실시간', 8]],
            lastUpdated: now,
            totalArticles: 3,
            systemStatus: this.getSystemStatus(),
            version: '3.1.0-fresh-only'
        };
    }

    // 캐시 클리어
    clearCache() {
        this.newsCache.clear();
        this.translationCache.clear();
        this.duplicateCache.clear();
        console.log('🗑️ 최신 뉴스 전용 시스템 캐시 클리어 완료');
    }
}

module.exports = FreshNewsOnlySystem;

