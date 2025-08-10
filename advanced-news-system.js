const https = require('https');
const http = require('http');
const querystring = require('querystring');

class XIntegratedNewsSystem {
    constructor() {
        this.newsCache = new Map();
        this.translationCache = new Map();
        this.buzzCache = new Map();
        this.duplicateCache = new Set();
        
        // API 설정
        this.apis = {
            naver: {
                clientId: '4lsPsi_je8UoGGcfTP1w',
                clientSecret: 'J3BHRgyWPc',
                baseUrl: 'https://openapi.naver.com/v1/search/news'
            },
            newsapi: {
                apiKey: process.env.NEWS_API_KEY || '44d9347a149b40ad87b3deb8bba95183',
                baseUrl: 'https://newsapi.org/v2'
            },
            x: {
                bearerToken: '0E6c9hk1rPnoJiQBzaRX5owAH',
                baseUrl: 'https://api.twitter.com/2'
            },
            openai: {
                apiKey: process.env.OPENAI_API_KEY,
                baseUrl: 'https://api.openai.com/v1'
            },
            skywork: {
                apiKey: process.env.SKYWORK_API_KEY,
                baseUrl: 'https://api.skywork.ai/v1'
            }
        };
        
        // 최신성 기준 (48시간)
        this.maxNewsAge = 48 * 60 * 60 * 1000;
        this.requestTimeout = 8000; // 8초 타임아웃
        this.maxRetries = 2;
        
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
        
        // 긴급/중요 키워드
        this.urgentKeywords = {
            ko: ['속보', '긴급', '단독', '발표', '사망', '사고', '지진', '화재', '폭발', '테러', '붕괴', '침몰', '확진'],
            en: ['breaking', 'urgent', 'exclusive', 'dies', 'dead', 'earthquake', 'fire', 'explosion', 'terror', 'collapse', 'crash'],
            ja: ['速報', '緊急', '独占', '死亡', '事故', '地震', '火災', '爆発', 'テロ']
        };
        
        this.importantKeywords = {
            ko: ['대통령', '총리', '장관', '국회', '선거', '경제', '주식', '환율', '코로나', '백신', '북한', '중국', '미국'],
            en: ['president', 'minister', 'congress', 'election', 'economy', 'stock', 'covid', 'vaccine', 'china', 'russia', 'ukraine'],
            ja: ['総理', '大臣', '国会', '選挙', '経済', '株式', 'コロナ', 'ワクチン']
        };
        
        console.log('🚀 X 통합 뉴스 시스템 초기화 완료');
        console.log(`📡 NewsAPI: ${this.apis.newsapi.apiKey ? '✅' : '❌'}`);
        console.log(`🐦 X API: ${this.apis.x.bearerToken ? '✅' : '❌'}`);
        console.log(`🤖 OpenAI: ${this.apis.openai.apiKey ? '✅' : '❌'}`);
    }

    // 안전한 HTTP 요청
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
                    'User-Agent': 'EmarkNews/4.0-X-Integrated',
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
                            console.warn(`⚠️ HTTP ${res.statusCode}: ${url}`);
                            if (retries < this.maxRetries) {
                                setTimeout(() => {
                                    this.makeStableRequest(url, options, retries + 1)
                                        .then(resolve)
                                        .catch(reject);
                                }, 1000 * (retries + 1));
                            } else {
                                reject(new Error(`HTTP ${res.statusCode}`));
                            }
                        }
                    } catch (error) {
                        console.error(`❌ JSON 파싱 오류: ${url}`);
                        reject(error);
                    }
                });
            });
            
            req.on('error', (error) => {
                console.error(`❌ 요청 오류: ${url} - ${error.message}`);
                if (retries < this.maxRetries) {
                    setTimeout(() => {
                        this.makeStableRequest(url, options, retries + 1)
                            .then(resolve)
                            .catch(reject);
                    }, 1000 * (retries + 1));
                } else {
                    reject(error);
                }
            });
            
            req.on('timeout', () => {
                req.destroy();
                console.warn(`⏰ 타임아웃: ${url}`);
                if (retries < this.maxRetries) {
                    setTimeout(() => {
                        this.makeStableRequest(url, options, retries + 1)
                            .then(resolve)
                            .catch(reject);
                    }, 1000 * (retries + 1));
                } else {
                    reject(new Error('타임아웃'));
                }
            });
            
            if (options.body) {
                req.write(options.body);
            }
            
            req.end();
        });
    }

    // 날짜 신선도 체크
    isNewsFresh(publishedAt) {
        if (!publishedAt) return false;
        
        try {
            const newsDate = new Date(publishedAt);
            const now = new Date();
            const ageInMs = now - newsDate;
            
            if (ageInMs < 0) return false; // 미래 날짜 거부
            
            const isFresh = ageInMs <= this.maxNewsAge;
            if (!isFresh) {
                const hours = Math.floor(ageInMs / (1000 * 60 * 60));
                console.log(`🗑️ 오래된 뉴스 제거: ${hours}시간 전`);
            }
            return isFresh;
            
        } catch (error) {
            return false;
        }
    }

    // 네이버 뉴스 API
    async fetchNaverNews(query, display = 20) {
        try {
            console.log(`📰 네이버 뉴스 검색: "${query}"`);
            
            const encodedQuery = encodeURIComponent(query);
            const url = `${this.apis.naver.baseUrl}?query=${encodedQuery}&display=${display}&sort=date`;
            
            const options = {
                headers: {
                    'X-Naver-Client-Id': this.apis.naver.clientId,
                    'X-Naver-Client-Secret': this.apis.naver.clientSecret
                }
            };
            
            const data = await this.makeStableRequest(url, options);
            
            if (data && data.items) {
                console.log(`📊 네이버 원본: ${data.items.length}개`);
                
                const freshItems = data.items.filter(item => this.isNewsFresh(item.pubDate));
                console.log(`✅ 네이버 최신 뉴스: ${freshItems.length}개`);
                
                return this.normalizeNaverNews(freshItems);
            }
            
            return [];
            
        } catch (error) {
            console.error('❌ 네이버 API 오류:', error.message);
            return [];
        }
    }

    // NewsAPI 호출
    async fetchNewsAPI(endpoint, params = {}) {
        if (!this.apis.newsapi.apiKey) {
            console.warn('⚠️ NewsAPI 키 없음');
            return [];
        }
        
        try {
            console.log(`📡 NewsAPI 호출: ${endpoint}`);
            
            const twoDaysAgo = new Date(Date.now() - this.maxNewsAge).toISOString();
            
            const queryParams = {
                ...params,
                from: twoDaysAgo,
                sortBy: 'publishedAt',
                pageSize: Math.min(params.pageSize || 20, 20),
                apiKey: this.apis.newsapi.apiKey
            };
            
            const url = `${this.apis.newsapi.baseUrl}/${endpoint}?${querystring.stringify(queryParams)}`;
            
            const data = await this.makeStableRequest(url);
            
            if (data && data.articles) {
                console.log(`📊 NewsAPI 원본: ${data.articles.length}개`);
                
                const freshArticles = data.articles.filter(article => 
                    this.isNewsFresh(article.publishedAt) && 
                    article.title && 
                    article.description &&
                    !article.title.includes('[Removed]')
                );
                
                console.log(`✅ NewsAPI 최신 뉴스: ${freshArticles.length}개`);
                return this.normalizeNewsAPIData(freshArticles);
            }
            
            return [];
            
        } catch (error) {
            console.error('❌ NewsAPI 오류:', error.message);
            return [];
        }
    }

    // X(Twitter) API - Buzz 분석용
    async fetchXBuzzData(keywords, maxResults = 10) {
        if (!this.apis.x.bearerToken) {
            console.warn('⚠️ X API 키 없음');
            return [];
        }
        
        try {
            console.log(`🐦 X Buzz 데이터 수집: ${keywords.join(', ')}`);
            
            const query = keywords.map(k => `"${k}"`).join(' OR ');
            const params = {
                query: `${query} -is:retweet lang:ko`,
                max_results: maxResults,
                'tweet.fields': 'created_at,public_metrics,context_annotations,lang',
                'user.fields': 'verified,public_metrics',
                expansions: 'author_id'
            };
            
            const url = `${this.apis.x.baseUrl}/tweets/search/recent?${querystring.stringify(params)}`;
            
            const options = {
                headers: {
                    'Authorization': `Bearer ${this.apis.x.bearerToken}`,
                    'Content-Type': 'application/json'
                }
            };
            
            const data = await this.makeStableRequest(url, options);
            
            if (data && data.data) {
                console.log(`📊 X 트윗 수집: ${data.data.length}개`);
                return this.normalizeXData(data.data, data.includes?.users || []);
            }
            
            return [];
            
        } catch (error) {
            console.error('❌ X API 오류:', error.message);
            return [];
        }
    }

    // X 데이터 정규화
    normalizeXData(tweets, users) {
        const userMap = new Map(users.map(user => [user.id, user]));
        
        return tweets.map(tweet => {
            const author = userMap.get(tweet.author_id) || {};
            const metrics = tweet.public_metrics || {};
            
            // Buzz 점수 계산 (리트윗 + 좋아요 + 댓글)
            const buzzScore = (metrics.retweet_count || 0) * 3 + 
                             (metrics.like_count || 0) * 2 + 
                             (metrics.reply_count || 0) * 1;
            
            return {
                id: tweet.id,
                text: tweet.text,
                createdAt: tweet.created_at,
                author: author.username || 'unknown',
                verified: author.verified || false,
                buzzScore,
                metrics: {
                    retweets: metrics.retweet_count || 0,
                    likes: metrics.like_count || 0,
                    replies: metrics.reply_count || 0
                }
            };
        }).sort((a, b) => b.buzzScore - a.buzzScore);
    }

    // 강화된 AI 번역
    async translateToKorean(text, isLongText = false) {
        if (!text || text.length < 5) return text;
        if (this.isKorean(text)) return text;
        
        const cacheKey = text.substring(0, 100);
        if (this.translationCache.has(cacheKey)) {
            return this.translationCache.get(cacheKey);
        }
        
        try {
            let translatedText = text;
            
            // OpenAI 우선, Skywork AI 백업
            if (this.apis.openai.apiKey) {
                translatedText = await this.translateWithOpenAI(text, isLongText);
            } else if (this.apis.skywork.apiKey) {
                translatedText = await this.translateWithSkywork(text, isLongText);
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

    // OpenAI 번역 (강화된 버전)
    async translateWithOpenAI(text, isLongText) {
        const prompt = isLongText 
            ? `다음 영어 뉴스 기사를 자연스러운 한국어로 번역하고 핵심 내용을 3-4문장으로 요약해주세요. "..." 같은 생략 표시 없이 완전한 문장으로 작성해주세요:\n\n${text}`
            : `다음을 자연스러운 한국어로 번역해주세요:\n\n${text}`;
        
        const requestBody = JSON.stringify({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: "당신은 전문 뉴스 번역가입니다. 영어를 자연스러운 한국어로 번역하고, 긴 텍스트는 핵심 내용을 잘 요약해주세요. 생략 표시(...) 없이 완전한 문장으로 작성해주세요."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            max_tokens: isLongText ? 1500 : 500,
            temperature: 0.3
        });

        return new Promise((resolve, reject) => {
            const req = https.request({
                hostname: 'api.openai.com',
                path: '/v1/chat/completions',
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apis.openai.apiKey}`,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(requestBody)
                },
                timeout: 12000
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

    // Skywork AI 번역
    async translateWithSkywork(text, isLongText) {
        const prompt = isLongText 
            ? `다음 뉴스를 한국어로 번역하고 요약해주세요:\n\n${text}`
            : `다음을 한국어로 번역해주세요:\n\n${text}`;
        
        const requestBody = JSON.stringify({
            model: "skywork-o1-open-llama-8b",
            messages: [
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
                hostname: 'api.skywork.ai',
                path: '/v1/chat/completions',
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apis.skywork.apiKey}`,
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
                            reject(new Error('Skywork 응답 오류'));
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

    // 기본 번역 (키워드 기반)
    basicTranslation(text) {
        const translations = {
            'breaking': '속보',
            'urgent': '긴급',
            'exclusive': '단독',
            'president': '대통령',
            'minister': '장관',
            'congress': '국회',
            'election': '선거',
            'economy': '경제',
            'stock': '주식',
            'covid': '코로나',
            'vaccine': '백신',
            'china': '중국',
            'russia': '러시아',
            'ukraine': '우크라이나',
            'north korea': '북한',
            'south korea': '한국',
            'japan': '일본',
            'united states': '미국',
            'europe': '유럽'
        };
        
        let translated = text;
        for (const [en, ko] of Object.entries(translations)) {
            const regex = new RegExp(`\\b${en}\\b`, 'gi');
            translated = translated.replace(regex, ko);
        }
        
        return translated;
    }

    // 한국어 감지
    isKorean(text) {
        const koreanRegex = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/;
        return koreanRegex.test(text);
    }

    // 네이버 뉴스 정규화
    normalizeNaverNews(items) {
        return items.map(item => {
            const title = this.cleanHtmlTags(item.title);
            const description = this.cleanHtmlTags(item.description);
            
            return {
                title,
                description,
                url: item.link,
                urlToImage: null,
                publishedAt: new Date(item.pubDate).toISOString(),
                source: { name: '네이버뉴스' },
                category: this.categorizeNews(title + ' ' + description),
                urgency: this.detectUrgency(title + ' ' + description),
                qualityScore: this.calculateQualityScore({
                    title,
                    description,
                    source: { name: '네이버뉴스' },
                    publishedAt: item.pubDate
                }),
                newsAge: this.calculateNewsAge(item.pubDate)
            };
        });
    }

    // NewsAPI 데이터 정규화
    normalizeNewsAPIData(articles) {
        return articles.map(article => {
            const title = article.title || '';
            const description = article.description || '';
            
            return {
                title,
                description,
                url: article.url,
                urlToImage: article.urlToImage,
                publishedAt: article.publishedAt,
                source: article.source,
                category: this.categorizeNews(title + ' ' + description),
                urgency: this.detectUrgency(title + ' ' + description),
                qualityScore: this.calculateQualityScore(article),
                newsAge: this.calculateNewsAge(article.publishedAt)
            };
        });
    }

    // HTML 태그 제거
    cleanHtmlTags(text) {
        if (!text) return '';
        return text.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').trim();
    }

    // 뉴스 분류
    categorizeNews(text) {
        const categories = {
            '정치': ['대통령', '총리', '장관', '국회', '선거', '정치', '정부', '여당', '야당', 'president', 'minister', 'congress', 'election', 'government'],
            '경제': ['경제', '주식', '환율', '금리', '투자', '기업', '매출', '수익', 'economy', 'stock', 'investment', 'company', 'market'],
            '사회': ['사회', '사건', '사고', '범죄', '재판', '경찰', '소방', 'crime', 'police', 'court', 'accident'],
            '기술': ['기술', 'IT', '인공지능', 'AI', '스마트폰', '컴퓨터', '소프트웨어', 'technology', 'artificial intelligence', 'smartphone', 'software'],
            '스포츠': ['스포츠', '축구', '야구', '농구', '올림픽', '월드컵', 'sports', 'football', 'baseball', 'basketball', 'olympics'],
            '연예': ['연예', '가수', '배우', '드라마', '영화', '음악', 'entertainment', 'actor', 'singer', 'movie', 'music']
        };
        
        const lowerText = text.toLowerCase();
        
        for (const [category, keywords] of Object.entries(categories)) {
            if (keywords.some(keyword => lowerText.includes(keyword.toLowerCase()))) {
                return category;
            }
        }
        
        return '일반';
    }

    // 긴급도 감지
    detectUrgency(text) {
        const lowerText = text.toLowerCase();
        
        // 긴급 키워드 체크
        const urgentFound = [...this.urgentKeywords.ko, ...this.urgentKeywords.en, ...this.urgentKeywords.ja]
            .some(keyword => lowerText.includes(keyword.toLowerCase()));
        
        if (urgentFound) return '긴급';
        
        // 중요 키워드 체크
        const importantFound = [...this.importantKeywords.ko, ...this.importantKeywords.en, ...this.importantKeywords.ja]
            .some(keyword => lowerText.includes(keyword.toLowerCase()));
        
        if (importantFound) return '중요';
        
        return '일반';
    }

    // 품질 점수 계산 (20점 만점)
    calculateQualityScore(article) {
        let score = 0;
        
        // 제목 품질 (5점)
        if (article.title && article.title.length > 10) score += 3;
        if (article.title && article.title.length > 30) score += 2;
        
        // 설명 품질 (5점)
        if (article.description && article.description.length > 50) score += 3;
        if (article.description && article.description.length > 100) score += 2;
        
        // 소스 신뢰도 (5점)
        const sourceName = article.source?.name || '';
        const reliability = this.sourceReliability.get(sourceName) || 0.5;
        score += Math.floor(reliability * 5);
        
        // 최신성 (3점)
        const newsAge = this.calculateNewsAge(article.publishedAt);
        if (newsAge <= 6) score += 3;
        else if (newsAge <= 24) score += 2;
        else if (newsAge <= 48) score += 1;
        
        // 이미지 유무 (2점)
        if (article.urlToImage) score += 2;
        
        return Math.min(score, 20);
    }

    // 뉴스 나이 계산 (시간 단위)
    calculateNewsAge(publishedAt) {
        if (!publishedAt) return 999;
        
        try {
            const newsDate = new Date(publishedAt);
            const now = new Date();
            const ageInMs = now - newsDate;
            return Math.floor(ageInMs / (1000 * 60 * 60));
        } catch (error) {
            return 999;
        }
    }

    // 중복 제거
    removeDuplicates(newsArray) {
        const seen = new Set();
        const unique = [];
        
        for (const news of newsArray) {
            // 제목의 첫 30자로 중복 체크
            const key = news.title.substring(0, 30).toLowerCase().replace(/\s+/g, '');
            
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(news);
            }
        }
        
        console.log(`🗑️ 중복 제거: ${newsArray.length}개 → ${unique.length}개`);
        return unique;
    }

    // 트렌딩 키워드 추출
    extractTrendingKeywords(newsArray, xBuzzData = []) {
        const keywordCount = new Map();
        
        // 뉴스에서 키워드 추출
        newsArray.forEach(news => {
            const text = (news.title + ' ' + news.description).toLowerCase();
            
            // 한국어 키워드 추출 (2글자 이상)
            const koreanWords = text.match(/[가-힣]{2,}/g) || [];
            koreanWords.forEach(word => {
                if (word.length >= 2 && word.length <= 10) {
                    keywordCount.set(word, (keywordCount.get(word) || 0) + 1);
                }
            });
            
            // 영어 키워드 추출
            const englishWords = text.match(/\b[a-z]{3,}\b/g) || [];
            englishWords.forEach(word => {
                if (word.length >= 3 && word.length <= 15) {
                    keywordCount.set(word, (keywordCount.get(word) || 0) + 1);
                }
            });
        });
        
        // X 버즈 데이터에서 키워드 가중치 추가
        xBuzzData.forEach(tweet => {
            const words = tweet.text.match(/[가-힣]{2,}/g) || [];
            words.forEach(word => {
                if (word.length >= 2 && word.length <= 10) {
                    const buzzWeight = Math.floor(tweet.buzzScore / 10) + 1;
                    keywordCount.set(word, (keywordCount.get(word) || 0) + buzzWeight);
                }
            });
        });
        
        // 상위 키워드 반환
        return Array.from(keywordCount.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([keyword]) => keyword);
    }

    // 메인 뉴스 수집 함수
    async collectNews() {
        console.log('🚀 X 통합 뉴스 수집 시작...');
        const startTime = Date.now();
        
        try {
            // 병렬 뉴스 수집
            const [
                worldNews,
                koreaNews,
                japanNews,
                xBuzzData
            ] = await Promise.allSettled([
                // 세계 뉴스
                this.fetchNewsAPI('top-headlines', { 
                    country: 'us',
                    pageSize: 15
                }),
                
                // 한국 뉴스
                this.fetchNaverNews('한국 뉴스', 15),
                
                // 일본 뉴스  
                this.fetchNewsAPI('top-headlines', {
                    country: 'jp',
                    pageSize: 15
                }),
                
                // X 버즈 데이터
                this.fetchXBuzzData(['한국', '정치', '경제', '기술', '사회'], 20)
            ]);
            
            // 결과 처리
            const worldArticles = worldNews.status === 'fulfilled' ? worldNews.value : [];
            const koreaArticles = koreaNews.status === 'fulfilled' ? koreaNews.value : [];
            const japanArticles = japanNews.status === 'fulfilled' ? japanNews.value : [];
            const buzzData = xBuzzData.status === 'fulfilled' ? xBuzzData.value : [];
            
            console.log(`📊 수집 결과: 세계 ${worldArticles.length}, 한국 ${koreaArticles.length}, 일본 ${japanArticles.length}, X버즈 ${buzzData.length}`);
            
            // AI 번역 (병렬 처리)
            const [translatedWorld, translatedJapan] = await Promise.allSettled([
                this.translateNewsArray(worldArticles),
                this.translateNewsArray(japanArticles)
            ]);
            
            const finalWorldNews = translatedWorld.status === 'fulfilled' ? translatedWorld.value : worldArticles;
            const finalJapanNews = translatedJapan.status === 'fulfilled' ? translatedJapan.value : japanArticles;
            
            // 중복 제거 및 정렬
            const processedWorldNews = this.removeDuplicates(finalWorldNews)
                .sort((a, b) => b.qualityScore - a.qualityScore)
                .slice(0, 10);
                
            const processedKoreaNews = this.removeDuplicates(koreaArticles)
                .sort((a, b) => b.qualityScore - a.qualityScore)
                .slice(0, 10);
                
            const processedJapanNews = this.removeDuplicates(finalJapanNews)
                .sort((a, b) => b.qualityScore - a.qualityScore)
                .slice(0, 10);
            
            // 트렌딩 키워드 추출
            const allNews = [...processedWorldNews, ...processedKoreaNews, ...processedJapanNews];
            const trendingKeywords = this.extractTrendingKeywords(allNews, buzzData);
            
            const endTime = Date.now();
            const duration = endTime - startTime;
            
            console.log(`✅ X 통합 뉴스 수집 완료: ${duration}ms`);
            console.log(`📊 최종 결과: 세계 ${processedWorldNews.length}, 한국 ${processedKoreaNews.length}, 일본 ${processedJapanNews.length}`);
            
            return {
                success: true,
                timestamp: new Date().toISOString(),
                duration: `${duration}ms`,
                version: "4.0.0-x-integrated",
                features: ["x-buzz-analysis", "ai-translation", "duplicate-removal", "quality-scoring", "urgency-analysis", "trending-keywords"],
                sections: {
                    world: processedWorldNews,
                    korea: processedKoreaNews,
                    japan: processedJapanNews
                },
                trending: trendingKeywords,
                xBuzz: buzzData.slice(0, 5), // 상위 5개 버즈 트윗
                stats: {
                    totalCollected: worldArticles.length + koreaArticles.length + japanArticles.length,
                    totalProcessed: allNews.length,
                    duplicatesRemoved: (worldArticles.length + koreaArticles.length + japanArticles.length) - allNews.length,
                    xBuzzAnalyzed: buzzData.length
                }
            };
            
        } catch (error) {
            console.error('❌ 뉴스 수집 중 오류:', error);
            
            return {
                success: false,
                error: error.message,
                timestamp: new Date().toISOString(),
                version: "4.0.0-x-integrated",
                sections: {
                    world: [],
                    korea: [],
                    japan: []
                },
                trending: [],
                xBuzz: []
            };
        }
    }

    // 뉴스 배열 번역
    async translateNewsArray(newsArray) {
        if (!newsArray || newsArray.length === 0) return [];
        
        console.log(`🌐 ${newsArray.length}개 뉴스 번역 시작...`);
        
        const translationPromises = newsArray.map(async (news) => {
            try {
                const translatedTitle = await this.translateToKorean(news.title);
                const translatedDescription = await this.translateToKorean(news.description, true);
                
                return {
                    ...news,
                    title: translatedTitle,
                    description: translatedDescription
                };
            } catch (error) {
                console.warn('번역 실패, 원본 유지:', error.message);
                return news;
            }
        });
        
        const results = await Promise.allSettled(translationPromises);
        const translated = results
            .filter(result => result.status === 'fulfilled')
            .map(result => result.value);
        
        console.log(`✅ 번역 완료: ${translated.length}/${newsArray.length}`);
        return translated;
    }

    // 시스템 상태 확인
    getSystemStatus() {
        return {
            status: 'running',
            version: '4.0.0-x-integrated',
            features: ['x-buzz-analysis', 'ai-translation', 'duplicate-removal', 'quality-scoring', 'urgency-analysis', 'trending-keywords'],
            apis: {
                naver: '✅ 연결됨',
                newsapi: this.apis.newsapi.apiKey ? '✅ 연결됨' : '❌ 키 없음',
                x: this.apis.x.bearerToken ? '✅ 연결됨' : '❌ 키 없음',
                openai: this.apis.openai.apiKey ? '✅ 연결됨' : '❌ 키 없음',
                skywork: this.apis.skywork.apiKey ? '✅ 연결됨' : '❌ 키 없음'
            },
            cache: {
                news: this.newsCache.size,
                translation: this.translationCache.size,
                buzz: this.buzzCache.size
            },
            uptime: process.uptime(),
            memory: process.memoryUsage()
        };
    }
}

module.exports = XIntegratedNewsSystem;

