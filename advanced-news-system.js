const https = require('https');
const http = require('http');
const crypto = require('crypto'); // crypto 모듈을 상단으로 이동
// const querystring = require('querystring'); // URLSearchParams로 대체

class StableNewsSystem {
    constructor() {
        this.newsCache = new Map();
        this.translationCache = new Map();
        this.duplicateCache = new Set();
        
        // API 설정 (안정성 우선)
        this.apis = {
            naver: {
                clientId: '4lsPsi_je8UoGGcfTP1w',
                clientSecret: 'J3BHRgyWPc',
                baseUrl: 'https://openapi.naver.com/v1/search/news'
            },
            newsapi: {
                // 환경 변수를 우선 사용하고, 없을 경우 기본값 사용
                apiKey: process.env.NEWS_API_KEY || '44d9347a149b40ad87b3deb8bba95183',
                baseUrl: 'https://newsapi.org/v2'
            },
            youtube: {
                // YouTube는 환경 변수가 필수
                apiKey: process.env.YOUTUBE_API_KEY,
                baseUrl: 'https://www.googleapis.com/youtube/v3'
            }
        };
        
        // 안정성 설정
        this.maxNewsAge = 48 * 60 * 60 * 1000; // 48시간
        this.requestTimeout = 5000; // 5초 타임아웃
        this.maxRetries = 2; // 최대 재시도
        
        console.log('🛡️ 안정화된 프리미엄 뉴스 시스템 초기화 (v3.2.2)');
        
        // [개선] API 키 로드 여부 상세 로깅 (마지막 4자리 출력으로 확인)
        const newsApiKey = this.apis.newsapi.apiKey;
        console.log(`📡 NewsAPI 키: ${newsApiKey ? '✅ 설정됨 (끝 4자리: ' + newsApiKey.slice(-4) + ')' : '⚠️ 없음 (NEWS_API_KEY 환경 변수 확인 필요)'}`);
        
        const youtubeApiKey = this.apis.youtube.apiKey;
        console.log(`📺 YouTube 키: ${youtubeApiKey ? '✅ 설정됨 (끝 4자리: ' + youtubeApiKey.slice(-4) + ')' : '⚠️ 없음 (YOUTUBE_API_KEY 환경 변수 확인 필요)'}`);
    }

    // [개선됨] 안전한 HTTP 요청 (상세 오류 로깅 및 지능적 재시도)
    async makeStableRequest(url, options = {}, retries = 0) {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const protocol = urlObj.protocol === 'https:' ? https : http;
            
            const requestOptions = {
                hostname: urlObj.hostname,
                port: urlObj.port,
                path: urlObj.pathname + urlObj.search,
                method: options.method || 'GET',
                headers: {
                    'User-Agent': 'EmarkNews/3.2.2-Stable',
                    'Accept': 'application/json',
                    'Connection': 'close',
                    ...options.headers
                },
                timeout: this.requestTimeout
            };
            
            const req = protocol.request(requestOptions, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    try {
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            const jsonData = JSON.parse(data);
                            resolve(jsonData);
                        } else {
                            // *** 핵심 개선: 상세 오류 로깅 ***
                            console.warn(`⚠️ HTTP ${res.statusCode} 오류 발생: ${url}`);
                            // 외부 API의 응답 본문(에러 메시지)을 출력하여 원인 파악
                            console.warn(`⚠️ 응답 본문: ${data.substring(0, 500)}...`);

                            // 5xx 서버 오류 또는 429(Rate Limit)일 경우에만 재시도
                            if (retries < this.maxRetries && (res.statusCode >= 500 || res.statusCode === 429)) {
                                // Rate Limit(429) 시 더 길게 대기 (Exponential Backoff)
                                const delay = 1000 * Math.pow(2, retries) * (res.statusCode === 429 ? 2 : 1); 
                                console.log(`🔄 재시도 ${retries + 1}/${this.maxRetries} (${delay}ms 후): ${url}`);
                                setTimeout(() => {
                                    this.makeStableRequest(url, options, retries + 1)
                                        .then(resolve)
                                        .catch(reject);
                                }, delay);
                            } else {
                                // 4xx 오류(인증 실패 등) 또는 재시도 초과 시 즉시 실패 처리
                                const error = new Error(`HTTP ${res.statusCode}`);
                                error.statusCode = res.statusCode;
                                error.responseBody = data;
                                reject(error);
                            }
                        }
                    } catch (error) {
                        console.error(`❌ JSON 파싱 오류: ${url} - 응답: ${data.substring(0, 200)}`);
                        reject(error);
                    }
                });
            });
            
            // 네트워크 오류 처리 (ECONNRESET, ENOTFOUND 등)
            const handleNetworkError = (error, type) => {
                console.error(`❌ ${type} 오류: ${url} - ${error.message}`);
                if (retries < this.maxRetries) {
                    const delay = 1000 * (retries + 1);
                    console.log(`🔄 재시도 ${retries + 1}/${this.maxRetries} (${delay}ms 후): ${url}`);
                    setTimeout(() => {
                        this.makeStableRequest(url, options, retries + 1)
                            .then(resolve)
                            .catch(reject);
                    }, delay);
                } else {
                    reject(error);
                }
            };

            req.on('error', (error) => handleNetworkError(error, '네트워크 요청'));
            
            // 타임아웃 처리
            req.on('timeout', () => {
                req.destroy();
                handleNetworkError(new Error('요청 타임아웃'), '타임아웃');
            });
            
            if (options.body) {
                req.write(options.body);
            }
            
            req.end();
        });
    }

    // 날짜 신선도 체크 (안정성 강화)
    isNewsFresh(publishedAt) {
        if (!publishedAt) return false;
        
        try {
            const newsDate = new Date(publishedAt);
            if (isNaN(newsDate.getTime())) return false; // 유효한 날짜인지 확인

            const now = new Date();
            const ageInMs = now - newsDate;
            
            if (ageInMs < 0) return false; // 미래 날짜 거부
            
            return ageInMs <= this.maxNewsAge;
            
        } catch (error) {
            return false;
        }
    }

    // 네이버 뉴스 (URLSearchParams 적용)
    async fetchNaverNews(query, display = 20) {
        try {
            console.log(`📰 네이버 뉴스 검색: "${query}"`);
            
            // URLSearchParams 사용
            const params = new URLSearchParams({
                query: query,
                display: display.toString(),
                sort: 'date'
            });
            const url = `${this.apis.naver.baseUrl}?${params.toString()}`;
            
            const options = {
                headers: {
                    'X-Naver-Client-Id': this.apis.naver.clientId,
                    'X-Naver-Client-Secret': this.apis.naver.clientSecret
                }
            };
            
            const data = await this.makeStableRequest(url, options);
            
            if (data && data.items) {
                const freshItems = data.items.filter(item => this.isNewsFresh(item.pubDate));
                console.log(`✅ 네이버 최신 뉴스: ${freshItems.length}개 (원본: ${data.items.length}개)`);
                
                return this.normalizeNaverNews(freshItems);
            }
            
            return [];
            
        } catch (error) {
            console.error('❌ 네이버 API 오류:', error.message);
            return [];
        }
    }

    // NewsAPI (URLSearchParams 적용 및 제약 조건 고려)
    async fetchNewsAPI(endpoint, params = {}) {
        if (!this.apis.newsapi.apiKey) {
            return [];
        }
        
        try {
            console.log(`📡 NewsAPI 호출: ${endpoint} (${params.country || 'Global'})`);
                        
            const queryParams = {
                ...params,
                pageSize: Math.min(params.pageSize || 20, 20).toString(),
                apiKey: this.apis.newsapi.apiKey
            };

            // NewsAPI 제약: 'top-headlines'는 'from'이나 'sortBy'를 지원하지 않거나 무시함 (특히 무료 플랜)
            if (endpoint === 'everything') {
                queryParams.sortBy = 'publishedAt';
                queryParams.from = new Date(Date.now() - this.maxNewsAge).toISOString();
            }
            
            const url = `${this.apis.newsapi.baseUrl}/${endpoint}?${new URLSearchParams(queryParams).toString()}`;
            
            const data = await this.makeStableRequest(url);
            
            if (data && data.status === 'ok' && data.articles) {
                const freshArticles = data.articles.filter(article => 
                    this.isNewsFresh(article.publishedAt) && 
                    article.title && 
                    article.description &&
                    !article.title.includes('[Removed]')
                );
                
                console.log(`✅ NewsAPI 최신 뉴스: ${freshArticles.length}개 (원본: ${data.articles.length}개)`);
                return this.normalizeNewsAPIData(freshArticles);
            } else if (data && data.status === 'error') {
                console.error(`❌ NewsAPI 오류 응답: ${data.code} - ${data.message}`);
                return [];
            }
            
            return [];
            
        } catch (error) {
            console.error('❌ NewsAPI 요청 실패:', error.message);
            return [];
        }
    }

    // YouTube (URLSearchParams 적용)
    async fetchYouTubeNews(region = 'US', maxResults = 5) {
        if (!this.apis.youtube.apiKey) {
            // constructor에서 이미 경고했으므로 여기서는 조용히 종료
            return [];
        }
        
        try {
            console.log(`📺 YouTube 뉴스: ${region}`);
            
            // URLSearchParams 사용
            const params = new URLSearchParams({
                part: 'snippet',
                chart: 'mostPopular',
                regionCode: region,
                videoCategoryId: '25', // 뉴스 카테고리 ID
                maxResults: maxResults.toString(),
                key: this.apis.youtube.apiKey
            });
            
            const url = `${this.apis.youtube.baseUrl}/videos?${params.toString()}`;
            const data = await this.makeStableRequest(url);
            
            if (data && data.items) {
                const freshItems = data.items.filter(item => this.isNewsFresh(item.snippet.publishedAt));
                console.log(`✅ YouTube 최신 영상: ${freshItems.length}개 (원본: ${data.items.length}개)`);
                
                return this.normalizeYouTubeData(freshItems);
            }
            
            return [];
            
        } catch (error) {
            console.error('❌ YouTube API 오류 (할당량 초과 가능성):', error.message);
            return [];
        }
    }

    // 데이터 정규화 함수들 (generateId 수정 반영)
    normalizeNaverNews(items) {
        return items.map(item => ({
            id: this.generateId(item.title + item.link),
            title: this.cleanHTML(item.title),
            description: this.cleanHTML(item.description),
            url: item.link,
            urlToImage: null,
            publishedAt: this.parseNaverDate(item.pubDate),
            source: { name: '네이버뉴스' },
            category: '한국',
            apiSource: 'naver',
            qualityScore: this.calculateQuality(item.title, item.description),
            isKorean: true,
            newsAge: this.calculateNewsAge(item.pubDate)
        }));
    }

    normalizeNewsAPIData(articles) {
        return articles.map(article => ({
            id: this.generateId(article.title + article.url),
            title: article.title,
            description: article.description,
            url: article.url,
            urlToImage: article.urlToImage,
            publishedAt: article.publishedAt,
            source: { name: article.source?.name || 'NewsAPI' },
            category: this.detectCategory(article.title),
            apiSource: 'newsapi',
            qualityScore: this.calculateQuality(article.title, article.description),
            isKorean: false,
            newsAge: this.calculateNewsAge(article.publishedAt)
        }));
    }

    normalizeYouTubeData(items) {
        return items.map(item => ({
            id: this.generateId(item.snippet.title + item.id),
            title: item.snippet.title,
            description: item.snippet.description.substring(0, 200),
            url: `https://www.youtube.com/watch?v=${item.id}&cc_load_policy=1&cc_lang_pref=ko`,
            urlToImage: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url,
            publishedAt: item.snippet.publishedAt,
            source: { name: item.snippet.channelTitle },
            category: '영상뉴스',
            apiSource: 'youtube',
            isVideo: true,
            qualityScore: this.calculateQuality(item.snippet.title, item.snippet.description) + 3, // 영상 가산점
            isKorean: false,
            newsAge: this.calculateNewsAge(item.snippet.publishedAt)
        }));
    }

    // 유틸리티 함수들
    cleanHTML(text) {
        if (!text) return '';
        return text
            .replace(/<[^>]*>/g, '')
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&[^;]+;/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    // 날짜 파싱 안정성 강화
    parseNaverDate(pubDate) {
        try {
            const date = new Date(pubDate);
            if (isNaN(date.getTime())) return new Date().toISOString();
            return date.toISOString();
        } catch {
            return new Date().toISOString();
        }
    }

    calculateNewsAge(publishedAt) {
        try {
            const newsDate = new Date(publishedAt);
            if (isNaN(newsDate.getTime())) return 999;
            const now = new Date();
            return Math.floor((now - newsDate) / (1000 * 60 * 60));
        } catch {
            return 999;
        }
    }

    calculateQuality(title, description) {
        let score = 10;
        if (title && title.length >= 20) score += 3;
        if (title && title.length >= 40) score += 2;
        if (description && description.length >= 50) score += 3;
        if (description && description.length >= 100) score += 2;
        return Math.min(score, 25);
    }

    detectCategory(text) {
        const lowerText = text.toLowerCase();
        if (lowerText.includes('politics') || lowerText.includes('government')) return '정치';
        if (lowerText.includes('business') || lowerText.includes('economy')) return '경제';
        if (lowerText.includes('technology') || lowerText.includes('tech')) return '기술';
        if (lowerText.includes('health') || lowerText.includes('medical')) return '건강';
        if (lowerText.includes('sports')) return '스포츠';
        return '일반';
    }

    // 중복 제거 (강화)
    removeDuplicates(articles) {
        const uniqueArticles = [];
        const seenTitles = new Set();
        const seenUrls = new Set();
        
        for (const article of articles) {
            if (!article.url || seenUrls.has(article.url)) continue;
            
            // 제목 비교 시 공백 제거하여 비교 강화
            const titleKey = article.title.replace(/\s/g, '').toLowerCase().substring(0, 30);
            if (seenTitles.has(titleKey)) continue;
            
            seenUrls.add(article.url);
            seenTitles.add(titleKey);
            uniqueArticles.push(article);
        }
        return uniqueArticles;
    }

    // [개선됨] 메인 수집 함수 (Promise.allSettled 사용으로 복원력 및 성능 강화)
    async collectAllNews() {
        const cacheKey = 'stable_news_v322';
        const cacheExpiry = 5 * 60 * 1000; // 5분 캐시
        
        if (this.newsCache.has(cacheKey)) {
            const cached = this.newsCache.get(cacheKey);
            if (Date.now() - cached.timestamp < cacheExpiry) {
                console.log('📦 캐시 사용');
                return cached.data;
            }
        }
        
        console.log('🚀 뉴스 수집 시작...');
        const startTime = Date.now();

        // 병렬 호출 설정 (각 Promise에 타입을 연결하여 안정성 확보)
        const fetchPromises = [
            this.fetchNaverNews('최신뉴스', 30).then(data => ({type: 'korea', data})),
            this.fetchNewsAPI('top-headlines', {country: 'us', pageSize: 20}).then(data => ({type: 'world', data})),
            this.fetchNewsAPI('everything', {q: 'technology', language: 'en', pageSize: 15}).then(data => ({type: 'tech', data})),
            this.fetchYouTubeNews('US', 5).then(data => ({type: 'youtube', data}))
        ];

        // Promise.allSettled로 모든 요청 처리 (일부 실패해도 계속 진행)
        const results = await Promise.allSettled(fetchPromises);
        
        let allNews = [];
        const stats = { korea: 0, world: 0, tech: 0, youtube: 0 };
        
        // 결과 처리 (실패한 요청도 로깅)
        results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                const { type, data } = result.value;
                stats[type] = data.length;
                allNews = allNews.concat(data);
            } else {
                const types = ['korea', 'world', 'tech', 'youtube'];
                console.error(`❌ ${types[index]} 뉴스 수집 실패:`, result.reason?.message || '알 수 없는 오류');
            }
        });

        console.log(`📊 수집 결과: 한국 ${stats.korea}, 세계 ${stats.world}, 기술 ${stats.tech}, YouTube ${stats.youtube}`);
        
        // 중복 제거 및 품질 필터링
        const uniqueNews = this.removeDuplicates(allNews);
        console.log(`🗑️ 중복 제거: ${allNews.length}개 → ${uniqueNews.length}개`);
        
        // 품질 점수 기준 정렬 및 상위 선택
        const sortedNews = uniqueNews
            .sort((a, b) => b.qualityScore - a.qualityScore)
            .slice(0, 50); // 상위 50개만 선택
        
        // 카테고리별 분류
        const categorizedNews = this.categorizeNews(sortedNews);
        
        const duration = Date.now() - startTime;
        console.log(`✅ 뉴스 수집 완료: ${duration}ms`);
        
        // 캐시 저장
        this.newsCache.set(cacheKey, {
            data: categorizedNews,
            timestamp: Date.now()
        });
        
        return categorizedNews;
    }

    // 카테고리별 분류 (개선됨)
    categorizeNews(articles) {
        const categories = {
            world: [],
            korea: [],
            japan: []
        };
        
        articles.forEach(article => {
            if (article.isKorean || article.apiSource === 'naver') {
                categories.korea.push(article);
            } else if (article.category === '영상뉴스' || article.apiSource === 'youtube') {
                categories.world.push(article);
            } else {
                categories.world.push(article);
            }
        });
        
        // 각 카테고리별 최대 개수 제한
        categories.korea = categories.korea.slice(0, 15);
        categories.world = categories.world.slice(0, 10);
        categories.japan = categories.japan.slice(0, 5);
        
        return categories;
    }

    // ID 생성 (crypto 사용으로 안정성 강화)
    generateId(text) {
        try {
            return crypto.createHash('md5').update(text).digest('hex').substring(0, 8);
        } catch (error) {
            // crypto 실패 시 fallback
            return Math.random().toString(36).substring(2, 10);
        }
    }

    // 시스템 상태 확인
    getSystemStatus() {
        return {
            status: 'running',
            timestamp: new Date().toISOString(),
            version: '3.2.2-stable',
            cacheSize: this.newsCache.size,
            translationCacheSize: this.translationCache.size,
            lastUpdate: new Date().toISOString(),
            apiSources: {
                naver: true,
                newsapi: !!this.apis.newsapi.apiKey,
                youtube: !!this.apis.youtube.apiKey
            },
            premiumFeatures: [
                'stable-requests',
                'intelligent-retry',
                'detailed-logging',
                'quality-scoring',
                'duplicate-removal',
                'cache-optimization'
            ]
        };
    }
}

module.exports = StableNewsSystem;

