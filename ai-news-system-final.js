const express = require('express');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');

// --- 서버 설정 ---
const app = express();
const PORT = process.env.PORT || 3000;

// 정적 파일 제공 설정 (public 폴더 안의 파일들을 서비스)
app.use(express.static(path.join(__dirname, 'public')));

// --- 뉴스 시스템 클래스 ---
// (기존 EmarkNewsSystem 클래스 코드가 여기에 그대로 들어갑니다)
class EmarkNewsSystem {
    constructor() {
        this.cache = new Map();
        this.cacheExpiry = 8 * 60 * 1000; // 8분
        this.lastUpdate = null;
        this.isUpdating = false;
        this.updatePromise = null;
        this.updateCounter = 0;

        this.apis = {
            newsApi: process.env.NEWS_API_KEY,
            openAi: process.env.OPENAI_API_KEY,
            naverClientId: process.env.NAVER_CLIENT_ID,
            naverClientSecret: process.env.NAVER_CLIENT_SECRET,
            xApiKey: process.env.X_API_KEY,
            xApiSecret: process.env.X_API_SECRET,
            // [수정] 환율 API 키를 환경변수에서 가져오도록 추가
            exchangeRateApiKey: process.env.EXCHANGERATE_API_KEY
        };
        
        console.log('🚀 EmarkNews 시스템 초기화 (v19.0.0 - Stabilized)');

        // 나머지 속성들은 기존 코드와 동일하게 유지
        this.xBearerToken = null;
        this.xTokenExpiry = 0;
        this.xTrendLocations = {
            world: { woeid: 1, name: '전세계' },
            korea: { woeid: 23424868, name: '대한민국' },
            japan: { woeid: 23424856, name: '일본' }
        };
        this.premiumSources = {
            'bbc-news': { score: 95, name: 'BBC News' }, 'reuters': { score: 95, name: 'Reuters' }, 'associated-press': { score: 90, name: 'AP 통신' }, 'cnn': { score: 85, name: 'CNN' }, 'the-guardian-uk': { score: 85, name: 'The Guardian' }, 'the-new-york-times': { score: 90, name: 'New York Times' }, 'bloomberg': { score: 90, name: 'Bloomberg' }, 'financial-times': { score: 88, name: 'Financial Times' }, 'wall-street-journal': { score: 88, name: 'Wall Street Journal' }, 'abc-news': { score: 80, name: 'ABC News' }, 'nbc-news': { score: 80, name: 'NBC News' }, 'the-washington-post': { score: 85, name: 'Washington Post' }
        };
        this.japanSources = {
            'asahi.com': { score: 90, name: '아사히신문' }, 'mainichi.jp': { score: 88, name: '마이니치신문' }, 'yomiuri.co.jp': { score: 88, name: '요미우리신문' }, 'nikkei.com': { score: 92, name: '니혼게이자이신문' }, 'sankei.com': { score: 85, name: '산케이신문' }, 'kyodonews.net': { score: 87, name: '교도통신' }, 'jiji.com': { score: 85, name: '지지통신' }, 'nhk.or.jp': { score: 90, name: 'NHK' }, 'japantimes.co.jp': { score: 85, name: 'Japan Times' }
        };
        this.koreanSources = {
            'chosun.com': { score: 85, name: '조선일보' }, 'joongang.co.kr': { score: 85, name: '중앙일보' }, 'donga.com': { score: 85, name: '동아일보' }, 'hankyoreh.com': { score: 80, name: '한겨레' }, 'khan.co.kr': { score: 80, name: '경향신문' }, 'hani.co.kr': { score: 80, name: '한겨레' }, 'ytn.co.kr': { score: 85, name: 'YTN' }, 'sbs.co.kr': { score: 85, name: 'SBS' }, 'kbs.co.kr': { score: 85, name: 'KBS' }, 'mbc.co.kr': { score: 85, name: 'MBC' }, 'jtbc.co.kr': { score: 80, name: 'JTBC' }, 'news1.kr': { score: 75, name: '뉴스1' }, 'newsis.com': { score: 75, name: '뉴시스' }, 'yna.co.kr': { score: 80, name: '연합뉴스' }, 'mt.co.kr': { score: 75, name: '머니투데이' }, 'mk.co.kr': { score: 75, name: '매일경제' }, 'sedaily.com': { score: 75, name: '서울경제' }, 'etnews.com': { score: 75, name: '전자신문' }
        };
        this.sportsKeywords = ['sports', 'baseball', 'football', 'soccer', 'basketball', 'tennis', 'golf', 'olympics', 'world cup', '스포츠', '야구', '축구', '농구', '테니스', '골프', '올림픽'];
    }

    async getNews(forceRefresh = false) {
        const cacheKey = 'emarknews_data_v19';
        if (!forceRefresh && this.cache.has(cacheKey) && (Date.now() - this.cache.get(cacheKey).timestamp < this.cacheExpiry)) {
            return this.cache.get(cacheKey).data;
        }
        if (this.isUpdating) {
            return this.updatePromise;
        }
        this.isUpdating = true;
        this.updateCounter++;
        this.updatePromise = this.collectEnhancedNews(forceRefresh)
            .then(newsData => {
                const totalArticles = (newsData.sections.world?.length || 0) + (newsData.sections.korea?.length || 0) + (newsData.sections.japan?.length || 0);
                if (totalArticles < 5 && this.cache.has(cacheKey)) {
                    console.error('❌ 충분한 뉴스 수집 실패, 이전 캐시 데이터를 사용합니다.');
                    return this.cache.get(cacheKey).data;
                }
                this.cache.set(cacheKey, { data: newsData, timestamp: Date.now() });
                this.lastUpdate = new Date().toISOString();
                console.log(`✅ 뉴스 수집 완료: ${totalArticles}개 기사 + ${newsData.sections.buzz?.length || 0}개 버즈`);
                return newsData;
            })
            .catch(error => {
                console.error('❌ 뉴스 수집 중 치명적 오류:', error.message);
                return this.cache.get(cacheKey)?.data || this.getEmergencyNews();
            })
            .finally(() => {
                this.isUpdating = false;
            });
        return this.updatePromise;
    }
    
    // [수정] 환율 API 호출 로직 변경 (v6, API 키 사용)
    async fetchEnhancedExchangeRates() {
        if (!this.apis.exchangeRateApiKey) {
            console.warn('⚠️ ExchangeRate-API 키가 설정되지 않았습니다. 기본 환율 정보를 사용합니다.');
            return this.getDefaultExchangeRates();
        }
        try {
            console.log('💱 환율 정보 수집 중...');
            const url = `https://v6.exchangerate-api.com/v6/${this.apis.exchangeRateApiKey}/latest/USD`;
            const response = await axios.get(url, { timeout: 5000 });
            const rates = response.data.conversion_rates;
            if (!rates || !rates.KRW || !rates.JPY) throw new Error('환율 데이터 누락');
            return {
                USD_KRW: rates.KRW.toFixed(2),
                JPY_KRW_100: ((rates.KRW / rates.JPY) * 100).toFixed(2),
                lastUpdate: new Date(response.data.time_last_update_unix * 1000).toISOString(),
                source: 'ExchangeRate-API',
            };
        } catch (error) {
            console.error('❌ 환율 정보 수집 실패:', error.response ? error.response.data : error.message);
            return this.getDefaultExchangeRates();
        }
    }

    // [수정] 한국 뉴스 포맷팅 함수 개선
    createEnhancedSummary(article) {
        const description = this.cleanNaverText(article.description || '');
        if (!description) return '';
        // 문장으로 나누되, 최대 3문장만 사용하고 각 문장은 80자를 넘지 않도록 자름
        const sentences = description.match(/[^.!?]+[.!?]*/g) || [];
        return sentences.slice(0, 3).map(s => `• ${s.trim().substring(0, 80)}`).join('\n');
    }

    formatDetailedContent(content) {
        const cleanedContent = this.cleanNaverText(content || '');
        if (!cleanedContent) return '상세 내용이 없습니다.';
        // 문단을 기준으로 나누고, 없으면 문장으로 나눠서 재조합
        let paragraphs = cleanedContent.split('\n').filter(p => p.trim().length > 10);
        if (paragraphs.length < 2) {
            paragraphs = cleanedContent.match(/[^.!?]+[.!?]*/g) || [];
        }
        return paragraphs.map(p => p.trim()).join('\n\n');
    }
    
    // 나머지 모든 클래스 메서드 (collectEnhancedNews, fetchEnhancedWorldNews 등)는
    // 제공해주신 원본 코드와 거의 동일하게 유지됩니다.
    // 여기에 모든 코드를 붙여넣기에는 너무 길어 생략합니다.
    // 기존 파일의 다른 메서드들은 그대로 두시고 위의 생성자와 두 개의 포맷팅 함수, 환율 함수만 교체하셔도 됩니다.
    // 단, 가장 안정적인 방법은 아래 전체 코드를 사용하는 것입니다.

    // --- 원본 코드를 기반으로 한 전체 클래스 메서드들 ---
    async collectEnhancedNews(forceRefresh = false) {
        console.log('📡 뉴스 및 소셜 트렌드 수집 시작...');
        const results = await Promise.allSettled([
            this.fetchEnhancedWorldNews(),
            this.fetchEnhancedKoreaNews(),
            this.fetchEnhancedJapanNews(),
            this.fetchEnhancedExchangeRates(),
            this.fetchSocialBuzz()
        ]);
        const worldNews = results[0].status === 'fulfilled' ? results[0].value : [];
        const koreaNews = results[1].status === 'fulfilled' ? results[1].value : [];
        const japanNews = results[2].status === 'fulfilled' ? results[2].value : [];
        const exchangeRates = results[3].status === 'fulfilled' ? results[3].value : this.getDefaultExchangeRates();
        const socialBuzz = results[4].status === 'fulfilled' ? results[4].value : [];

        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                console.error(`❌ ${['세계', '한국', '일본', '환율', '버즈'][index]} 수집 실패:`, result.reason?.message);
            }
        });

        return {
            sections: {
                world: worldNews,
                korea: koreaNews,
                japan: japanNews,
                buzz: socialBuzz
            },
            trending: this.generateAdvancedTrendingKeywords([...worldNews, ...koreaNews, ...japanNews]),
            exchangeRates,
            systemStatus: {
                version: '19.0.0-stabilized',
                lastUpdate: this.lastUpdate,
            }
        };
    }

    async fetchEnhancedWorldNews() {
        const sources = [
            { endpoint: 'top-headlines', params: { category: 'general', language: 'en', pageSize: 40, sources: 'bbc-news,reuters,associated-press,cnn' } },
            { endpoint: 'everything', params: { q: 'breaking OR government OR war', language: 'en', pageSize: 35, sortBy: 'publishedAt', sources: 'bbc-news,reuters,the-guardian-uk,bloomberg' } }
        ];
        const results = await Promise.all(sources.map(s => this.callNewsAPI(s.endpoint, s.params).catch(() => [])));
        const allArticles = results.flat().filter(a => !this.containsKeywords(a.title, this.sportsKeywords));
        const qualityArticles = this.selectHighQualityNews(allArticles);
        return this.processArticlesWithEnhancedTranslation(qualityArticles, 'world');
    }

    async fetchEnhancedKoreaNews() {
        const promises = [
            this.callEnhancedNaverAPI().catch(() => []),
            this.callNewsAPI('everything', { q: 'Korea OR Seoul', language: 'en', pageSize: 25, sortBy: 'publishedAt', sources: 'reuters,bloomberg,associated-press' }).catch(() => [])
        ];
        const results = await Promise.all(promises);
        const allArticles = results.flat().filter(a => !this.containsKeywords(a.title, this.sportsKeywords));
        const qualityArticles = this.selectHighQualityNews(allArticles);
        return this.processArticlesWithEnhancedTranslation(qualityArticles, 'korea');
    }

    async fetchEnhancedJapanNews() {
        const sources = [
            { endpoint: 'everything', params: { q: 'Japan OR Tokyo', language: 'en', pageSize: 25, sortBy: 'publishedAt', sources: 'reuters,bloomberg' } },
            { endpoint: 'everything', params: { domains: 'asahi.com,mainichi.jp,yomiuri.co.jp,nikkei.com', language: 'ja', pageSize: 40, sortBy: 'publishedAt' } },
        ];
        const results = await Promise.all(sources.map(s => this.callNewsAPI(s.endpoint, s.params).catch(() => [])));
        const allArticles = results.flat().filter(a => !this.containsKeywords(a.title, this.sportsKeywords));
        allArticles.forEach(a => { if (/[ぁ-んァ-ン一-龯]/.test(a.title)) a.language = 'ja'; });
        const qualityArticles = this.selectHighQualityNews(allArticles);
        return this.processArticlesWithEnhancedTranslation(qualityArticles, 'japan');
    }

    async fetchSocialBuzz() {
        if (!this.apis.xApiKey || !this.apis.xApiSecret) return [];
        console.log('🔥 소셜 버즈(X 트렌드) 수집 중...');
        const token = await this.getXBearerToken();
        if (!token) return [];
        
        const promises = Object.values(this.xTrendLocations).map(loc => 
            this.fetchXTrendsByLocation(token, loc.woeid, loc.name).catch(() => [])
        );
        const results = await Promise.all(promises);
        const allBuzz = results.flat();

        const uniqueBuzzMap = new Map();
        allBuzz.forEach(buzz => {
            const key = buzz.name.toLowerCase();
            if (!uniqueBuzzMap.has(key)) {
                uniqueBuzzMap.set(key, buzz);
            } else {
                const existing = uniqueBuzzMap.get(key);
                if ((buzz.volume || 0) > (existing.volume || 0)) {
                    existing.volume = buzz.volume;
                }
                if (!existing.regionName.includes(buzz.regionName)) {
                    existing.regionName += `, ${buzz.regionName}`;
                }
            }
        });
        const uniqueBuzz = Array.from(uniqueBuzzMap.values()).sort((a, b) => (b.volume || 0) - (a.volume || 0));
        return this.processBuzzWithTranslation(uniqueBuzz.slice(0, 20));
    }

    async processArticlesWithEnhancedTranslation(articles, section) {
        return Promise.all(articles.map(article => this.processSingleArticle(article).catch(e => {
            console.error(`❌ 기사 처리 실패: ${article.title}`, e.message);
            return null;
        }))).then(results => results.filter(Boolean));
    }
    
    async processSingleArticle(article) {
        let translatedContent;
        if (article.isKorean) {
            translatedContent = {
                translatedTitle: article.title,
                summary: this.createEnhancedSummary(article),
                detailed: this.formatDetailedContent(article.description),
            };
        } else {
            translatedContent = await this.translateArticleEnhanced(article, article.language || 'en');
        }

        return {
            ...article,
            translatedTitle: translatedContent.translatedTitle,
            summary: translatedContent.summary,
            description: translatedContent.detailed,
            stars: Math.min(5, Math.max(1, Math.round((article.qualityScore || 50) / 20))),
            category: this.classifyAdvancedCategory(article.title + ' ' + article.description),
            timeAgo: this.calculateTimeAgo(article.publishedAt),
        };
    }
    
    async translateArticleEnhanced(article, language = 'en') {
        if (!this.apis.openAi) return this.basicEnhancedTranslateAndSummarize(article);
        const content = `${article.title}\n\n${article.description || ''}`;
        try {
            const result = await this.callOpenAIJsonTranslation(content, language);
            if (result && result.translatedTitle && result.summary && result.detailed) return result;
        } catch (error) {
            console.error(`❌ OpenAI 번역 실패: ${article.title}`, error.message);
        }
        return this.basicEnhancedTranslateAndSummarize(article);
    }
    
    async callOpenAIJsonTranslation(content, language) {
        const sourceLanguage = language === 'ja' ? '일본어' : '영어';
        const systemPrompt = `당신은 전문 뉴스 번역가입니다. ${sourceLanguage} 뉴스를 자연스러운 한국어로 번역하고 결과를 JSON 형식으로 반환해야 합니다. 규칙: 1. JSON 스키마를 완벽하게 따를 것. 2. 절대 내용을 자르거나 말줄임표(...)를 사용하지 말 것. 3. 'detailed'는 원문 핵심 내용을 2-3문단으로 번역할 것.\n\n{"translatedTitle": "번역된 제목", "summary": ["핵심 요약 1", "핵심 요약 2"], "detailed": "상세 내용 번역(줄바꿈은 \\n\\n 사용)"}`;
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-3.5-turbo-0125',
            response_format: { type: "json_object" },
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `번역해주세요:\n\n${content}` }
            ],
            max_tokens: 2000,
            temperature: 0.2
        }, { headers: { 'Authorization': `Bearer ${this.apis.openAi}` }, timeout: 10000 });
        
        const jsonResult = JSON.parse(response.data.choices[0].message.content);
        return {
            translatedTitle: jsonResult.translatedTitle,
            summary: jsonResult.summary.map(item => `• ${item.trim()}`).join('\n'),
            detailed: jsonResult.detailed,
        };
    }
    
    basicEnhancedTranslateAndSummarize(article) {
        return {
            translatedTitle: article.title,
            summary: this.createEnhancedSummary(article),
            detailed: this.formatDetailedContent(article.description),
        };
    }

    // ... (기타 모든 헬퍼 함수들은 여기에 포함됩니다. generateId, cleanNaverText, callNewsAPI 등...)
    // 코드가 너무 길어 생략하지만, 실제 파일에는 모든 함수가 포함되어야 합니다.
    // 주요 로직은 위에 수정된 대로 반영됩니다.
    
    // --- 유틸리티 및 헬퍼 함수 (기존 코드 유지) ---
    cleanNaverText(text) { if (!text) return ''; return text.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, '').replace(/\s+/g, ' ').trim().replace(/(\.\.\.|\u2026)$/, ''); }
    generateId(url) { return crypto.createHash('sha256').update(url).digest('hex').substring(0, 16); }
    calculateTimeAgo(publishedAt) { try { const diffMs = Date.now() - new Date(publishedAt).getTime(); if (diffMs < 60000) return '방금 전'; const diffMinutes = Math.floor(diffMs / 60000); if (diffMinutes < 60) return `${diffMinutes}분 전`; const diffHours = Math.floor(diffMs / 3600000); if (diffHours < 24) return `${diffHours}시간 전`; return `${Math.floor(diffHours / 24)}일 전`; } catch (e) { return ''; } }
    containsKeywords(text, keywords) { if (!text) return false; const lowerText = text.toLowerCase(); return keywords.some(keyword => lowerText.includes(keyword.toLowerCase())); }
    selectHighQualityNews(articles) { const uniqueArticles = [...new Map(articles.map(item => [item.title, item])).values()]; uniqueArticles.forEach(a => a.qualityScore = this.calculateAdvancedQualityScore(a)); return uniqueArticles.sort((a,b) => b.qualityScore - a.qualityScore).slice(0, 20); }
    calculateAdvancedQualityScore(article) { let score = 50; const content = (article.title + ' ' + (article.description || '')).toLowerCase(); if(article.urlToImage) score += 5; try { const hoursAgo = (Date.now() - new Date(article.publishedAt).getTime()) / 3600000; if (hoursAgo <= 3) score += 15; else if (hoursAgo <= 12) score += 8; } catch(e){} return Math.max(0, Math.min(100, score)); }
    classifyAdvancedCategory(content) { const l = content.toLowerCase(); if (this.containsKeywords(l, ['정치', 'politics', 'government'])) return '정치'; if (this.containsKeywords(l, ['경제', 'economy', 'business'])) return '경제'; if (this.containsKeywords(l, ['기술', 'tech', 'ai'])) return '기술'; if (this.containsKeywords(l, ['국제', 'world', 'war'])) return '국제'; return '사회'; }
    generateAdvancedTrendingKeywords(articles) { const counts = {}; articles.forEach(a => { const words = (a.translatedTitle || a.title).match(/[a-zA-Z가-힣]{2,}/g) || []; words.forEach(w => { if(!['뉴스','기사'].includes(w)) counts[w] = (counts[w] || 0) + 1; }); }); return Object.entries(counts).sort((a,b) => b[1] - a[1]).slice(0, 10).map(e => e[0]); }
    async callNewsAPI(endpoint, params) { const url = `https://newsapi.org/v2/${endpoint}`; const config = { params: { ...params, apiKey: this.apis.newsApi }, timeout: 8000 }; const response = await axios.get(url, config); return (response.data.articles || []).map(a => ({ ...a, id: this.generateId(a.url), isKorean: false })); }
    async callEnhancedNaverAPI() { const queries = ['정치', '경제', '사회', 'IT', '국제']; const promises = queries.map(q => this.fetchNaverNewsByQuery(q)); const results = await Promise.all(promises); return results.flat(); }
    async fetchNaverNewsByQuery(query) { const config = { params: { query, display: 10, sort: 'date' }, headers: { 'X-Naver-Client-Id': this.apis.naverClientId, 'X-Naver-Client-Secret': this.apis.naverClientSecret }}; const response = await axios.get('https://openapi.naver.com/v1/search/news.json', config); return (response.data.items || []).map(item => ({ id: this.generateId(item.link), title: this.cleanNaverText(item.title), description: this.cleanNaverText(item.description), url: item.link, publishedAt: item.pubDate, source: { name: new URL(item.originallink).hostname.replace('www.','') }, isKorean: true })); }
    async getXBearerToken() { if (this.xBearerToken && Date.now() < this.xTokenExpiry) return this.xBearerToken; const creds = Buffer.from(`${encodeURIComponent(this.apis.xApiKey)}:${encodeURIComponent(this.apis.xApiSecret)}`).toString('base64'); const response = await axios.post('https://api.twitter.com/oauth2/token', 'grant_type=client_credentials', { headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }}); this.xBearerToken = response.data.access_token; this.xTokenExpiry = Date.now() + 3600000; return this.xBearerToken; }
    async fetchXTrendsByLocation(token, woeid, regionName) { const url = `https://api.twitter.com/1.1/trends/place.json?id=${woeid}`; const response = await axios.get(url, { headers: { 'Authorization': `Bearer ${token}` } }); return (response.data[0]?.trends || []).slice(0, 15).map(trend => ({ id: this.generateId(trend.url), name: trend.name.replace(/^#/, ''), url: trend.url, volume: trend.tweet_volume, regionName })); }
    async processBuzzWithTranslation(buzzItems) { return Promise.all(buzzItems.map(async item => { if (!/[가-힣]/.test(item.name)) { try { item.translatedName = await this.translateKeyword(item.name); } catch(e) {} } return item; })); }
    async translateKeyword(keyword) { const response = await axios.post('https://api.openai.com/v1/chat/completions', { model: 'gpt-3.5-turbo', messages: [{ role: 'user', content: `Translate this keyword to Korean: ${keyword}` }], max_tokens: 10, temperature: 0 }, { headers: { 'Authorization': `Bearer ${this.apis.openAi}` }}); return response.data.choices[0].message.content.trim(); }
    getDefaultExchangeRates() { return { USD_KRW: '1,380.00', JPY_KRW_100: '890.00', lastUpdate: new Date().toISOString(), source: 'Fallback' }; }
    getEmergencyNews() { const now = new Date().toISOString(); return { sections: { world: [{ id: 'emergency-1', title: '뉴스 시스템 점검 중', description: '데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.', translatedTitle: '뉴스 시스템 점검 중', summary: '• 뉴스 수집 시스템 오류 발생', url: '#', publishedAt: now, source: { name: 'EmarkNews System' }, stars: 1, category: '시스템', timeAgo: '방금 전' }] }, trending: ['점검중'], exchangeRates: this.getDefaultExchangeRates(), systemStatus: { version: '19.0.0-emergency', lastUpdate: now } }; }

}

// --- 서버 실행 ---
const newsSystem = new EmarkNewsSystem();

// API 라우트
app.get('/api/news', async (req, res) => {
    try {
        const forceRefresh = req.query._force === 'true';
        const data = await newsSystem.getNews(forceRefresh);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch news data' });
    }
});

// 기본 라우트 (index.html 제공)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`✅ Server is running on port ${PORT}`);
    newsSystem.getNews(); // 서버 시작 시 뉴스 미리 로딩
});