const express = require('express');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

class EmarkNewsSystem {
    constructor() {
        this.cache = new Map();
        this.cacheExpiry = 8 * 60 * 1000; // 8분
        this.lastUpdate = null;
        this.isUpdating = false;
        this.updatePromise = null;

        this.apis = {
            newsApi: process.env.NEWS_API_KEY || 'YOUR_NEWSAPI_KEY',
            openAi: process.env.OPENAI_API_KEY || 'YOUR_OPENAI_KEY',
            naverClientId: process.env.NAVER_CLIENT_ID || 'YOUR_NAVER_CLIENT_ID',
            naverClientSecret: process.env.NAVER_CLIENT_SECRET || 'YOUR_NAVER_CLIENT_SECRET',
            xApiKey: process.env.X_API_KEY || 'YOUR_X_API_KEY',
            xApiSecret: process.env.X_API_SECRET || 'YOUR_X_API_SECRET',
            exchangeRateApiKey: process.env.EXCHANGERATE_API_KEY || 'YOUR_EXCHANGERATE_API_KEY'
        };
        
        console.log('🚀 EmarkNews 시스템 초기화 (v21.0 - Full Code & Resilient)');
        
        this.xBearerToken = null;
        this.xTokenExpiry = 0;
        this.xTrendLocations = { world: { woeid: 1, name: '전세계' }, korea: { woeid: 23424868, name: '대한민국' }, japan: { woeid: 23424856, name: '일본' } };
        this.sportsKeywords = ['sports', 'baseball', 'football', 'soccer', 'basketball', 'tennis', 'golf', 'olympics', 'world cup', '스포츠', '야구', '축구', '농구', '테니스', '골프', '올림픽', '경기', '선수'];
    }

    async getNews(forceRefresh = false) {
        const cacheKey = 'emarknews_data_v21';
        if (!forceRefresh && this.cache.has(cacheKey) && (Date.now() - this.cache.get(cacheKey).timestamp < this.cacheExpiry)) {
            return this.cache.get(cacheKey).data;
        }
        if (this.isUpdating) return this.updatePromise;
        
        this.isUpdating = true;
        this.updatePromise = this.collectEnhancedNews(cacheKey)
            .then(newsData => {
                this.cache.set(cacheKey, { data: newsData, timestamp: Date.now() });
                this.lastUpdate = new Date().toISOString();
                console.log(`✅ 뉴스 수집 완료`);
                return newsData;
            })
            .catch(error => {
                console.error('❌ 뉴스 수집 중 치명적 오류:', error.message);
                return this.cache.get(cacheKey)?.data || this.getEmergencyNews();
            })
            .finally(() => { this.isUpdating = false; });
        return this.updatePromise;
    }

    async collectEnhancedNews(cacheKey) {
        console.log('📡 뉴스 및 소셜 트렌드 수집 시작...');
        const lastCache = this.cache.get(cacheKey)?.data;

        const results = await Promise.allSettled([
            this.fetchEnhancedWorldNews(),
            this.fetchEnhancedKoreaNews(),
            this.fetchEnhancedJapanNews(),
            this.fetchEnhancedExchangeRates(),
            this.fetchSocialBuzz()
        ]);

        const worldNews = results[0].status === 'fulfilled' ? results[0].value : (lastCache?.sections.world || []);
        const koreaNews = results[1].status === 'fulfilled' ? results[1].value : (lastCache?.sections.korea || []);
        const japanNews = results[2].status === 'fulfilled' ? results[2].value : (lastCache?.sections.japan || []);
        const exchangeRates = results[3].status === 'fulfilled' ? results[3].value : (lastCache?.exchangeRates || this.getDefaultExchangeRates());
        const socialBuzz = results[4].status === 'fulfilled' ? results[4].value : (lastCache?.sections.buzz || []);

        return {
            sections: { world: worldNews, korea: koreaNews, japan: japanNews, buzz: results[4].status === 'fulfilled' ? results[4].value : [] },
            exchangeRates,
            systemStatus: { version: '21.0', lastUpdate: this.lastUpdate }
        };
    }

    async fetchEnhancedWorldNews() {
        if (!this.apis.newsApi || this.apis.newsApi === 'YOUR_NEWSAPI_KEY') return [];
        const params = { q: 'world OR international OR politics OR economy OR technology -sport', language: 'en', pageSize: 50, sortBy: 'publishedAt' };
        const articles = await this.callNewsAPI('everything', params);
        const qualityArticles = this.selectHighQualityNews(articles);
        return this.processArticlesWithEnhancedTranslation(qualityArticles.slice(0, 15));
    }

    async fetchEnhancedKoreaNews() {
        if (!this.apis.naverClientId || this.apis.naverClientId === 'YOUR_NAVER_CLIENT_ID') return [];
        const queries = ['경제', '정치', '사회', 'IT 기술', '국제'];
        const promises = queries.map(q => this.fetchNaverNewsByQuery(q));
        const results = await Promise.all(promises);
        const allArticles = results.flat().filter(a => a.description);
        const qualityArticles = this.selectHighQualityNews(allArticles);
        return this.processArticlesWithEnhancedTranslation(qualityArticles.slice(0, 15));
    }

    async fetchEnhancedJapanNews() {
        if (!this.apis.newsApi || this.apis.newsApi === 'YOUR_NEWSAPI_KEY') return [];
        const params = { domains: 'asahi.com,mainichi.jp,yomiuri.co.jp,nikkei.com,kyodonews.net,nhk.or.jp', language: 'ja', pageSize: 50, sortBy: 'publishedAt' };
        const articles = await this.callNewsAPI('everything', params);
        articles.forEach(a => a.language = 'ja');
        const qualityArticles = this.selectHighQualityNews(articles);
        return this.processArticlesWithEnhancedTranslation(qualityArticles.slice(0, 15));
    }
    
    async fetchEnhancedExchangeRates() {
        if (!this.apis.exchangeRateApiKey || this.apis.exchangeRateApiKey === 'YOUR_EXCHANGERATE_API_KEY') {
            return this.getDefaultExchangeRates();
        }
        try {
            const url = `https://v6.exchangerate-api.com/v6/${this.apis.exchangeRateApiKey}/latest/USD`;
            const response = await axios.get(url, { timeout: 5000 });
            const rates = response.data.conversion_rates;
            if (!rates || !rates.KRW || !rates.JPY) throw new Error('KRW 또는 JPY 환율 데이터 누락');
            console.log('✅ 환율 정보 수집 성공');
            return {
                USD_KRW: rates.KRW.toFixed(2),
                JPY_KRW_100: ((rates.KRW / rates.JPY) * 100).toFixed(2),
                lastUpdate: new Date(response.data.time_last_update_unix * 1000).toISOString(),
            };
        } catch (error) {
            console.error(`❌ 환율 정보 수집 실패: ${error.message}`);
            return this.getDefaultExchangeRates();
        }
    }

    async processArticlesWithEnhancedTranslation(articles) {
        return Promise.all(articles.map(article => this.processSingleArticle(article)));
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
            translatedContent = await this.translateArticleEnhanced(article);
        }
        return {
            id: article.id, title: article.title, translatedTitle: translatedContent.translatedTitle,
            summary: translatedContent.summary, description: translatedContent.detailed, url: article.url,
            image: article.image, publishedAt: article.publishedAt, source: article.source,
            stars: Math.min(5, Math.max(1, Math.round(article.qualityScore / 20))),
            timeAgo: this.calculateTimeAgo(article.publishedAt),
        };
    }
    
    cleanNaverText(text) {
        if (!text) return '';
        return text.replace(/<\/?[^>]+(>|$)/g, "").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    }

    createEnhancedSummary(article) {
        const description = this.cleanNaverText(article.description || '');
        if (!description) return '';
        const sentences = description.match(/[^.!?]+[.!?]*/g) || [];
        return sentences.slice(0, 3).map(s => `• ${s.trim()}`).join('\n');
    }

    formatDetailedContent(content) {
        const cleanedContent = this.cleanNaverText(content || '');
        if (!cleanedContent) return '상세 내용이 없습니다.';
        return cleanedContent.split('\n').map(p => p.trim()).filter(p => p).join('\n\n');
    }
    
    selectHighQualityNews(articles) {
        const uniqueArticles = [...new Map(articles.filter(a => a.title && a.description).map(item => [item.title, item])).values()];
        uniqueArticles.forEach(a => a.qualityScore = this.calculateAdvancedQualityScore(a));
        return uniqueArticles.sort((a, b) => b.qualityScore - a.qualityScore);
    }

    calculateAdvancedQualityScore(article) {
        let score = 50;
        if(article.image) score += 5;
        try {
            const hoursAgo = (Date.now() - new Date(article.publishedAt).getTime()) / 3600000;
            if (hoursAgo <= 6) score += 25;
            else if (hoursAgo <= 12) score += 20;
            else if (hoursAgo <= 24) score += 10;
            else if (hoursAgo > 24 * 5) score -= 15;
        } catch(e){}
        return Math.max(0, Math.min(100, score));
    }
    
    async translateArticleEnhanced(article) {
        if (!this.apis.openAi || this.apis.openAi === 'YOUR_OPENAI_KEY') return { translatedTitle: article.title, summary: '', detailed: article.description };
        const content = `${article.title}\n\n${article.description || ''}`;
        try {
            const result = await this.callOpenAIJsonTranslation(content, article.language);
            if (result && result.translatedTitle) return result;
        } catch (error) {
            console.error(`❌ OpenAI 번역 실패: ${article.title}`, error.message);
        }
        return { translatedTitle: article.title, summary: '', detailed: article.description };
    }
    
    async callOpenAIJsonTranslation(content, language = 'en') {
        const sourceLanguage = language === 'ja' ? '일본어' : '영어';
        const systemPrompt = `You are a news translator. Translate the ${sourceLanguage} news into natural Korean in a JSON format. Rules: 1. Strictly follow the JSON schema. 2. Do NOT truncate or use ellipses. 3. 'detailed' must be a 2-3 paragraph translation of the original content.\n\n{"translatedTitle": "string", "summary": ["string"], "detailed": "string with \\n\\n for paragraphs"}`;
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-3.5-turbo-0125', response_format: { type: "json_object" },
            messages: [ { role: 'system', content: systemPrompt }, { role: 'user', content: `Translate:\n\n${content}` } ],
            max_tokens: 2000, temperature: 0.2
        }, { headers: { 'Authorization': `Bearer ${this.apis.openAi}` }, timeout: 12000 });
        const jsonResult = JSON.parse(response.data.choices[0].message.content);
        return {
            translatedTitle: jsonResult.translatedTitle,
            summary: (jsonResult.summary || []).map(item => `• ${item.trim()}`).join('\n'),
            detailed: jsonResult.detailed,
        };
    }
    
    async callNewsAPI(endpoint, params) {
        const url = `https://newsapi.org/v2/${endpoint}`;
        const config = { params: { ...params, apiKey: this.apis.newsApi }, timeout: 8000 };
        const response = await axios.get(url, config);
        return (response.data.articles || []).map(a => ({ ...a, id: this.generateId(a.url), image: a.urlToImage, isKorean: false }));
    }
    
    async fetchNaverNewsByQuery(query) {
        const config = { params: { query, display: 20, sort: 'sim' }, headers: { 'X-Naver-Client-Id': this.apis.naverClientId, 'X-Naver-Client-Secret': this.apis.naverClientSecret }};
        const response = await axios.get('https://openapi.naver.com/v1/search/news.json', config);
        return (response.data.items || []).map(item => ({ id: this.generateId(item.link), title: this.cleanNaverText(item.title), description: this.cleanNaverText(item.description), url: item.link, publishedAt: item.pubDate, source: { name: new URL(item.originallink).hostname.replace('www.','') }, isKorean: true }));
    }
    
    async fetchSocialBuzz() { return []; }
    
    generateId(url) { return crypto.createHash('sha256').update(url).digest('hex').substring(0, 16); }
    calculateTimeAgo(publishedAt) { try { const diffMs = Date.now() - new Date(publishedAt).getTime(); if (diffMs < 60000) return '방금 전'; const diffMinutes = Math.floor(diffMs / 60000); if (diffMinutes < 60) return `${diffMinutes}분 전`; const diffHours = Math.floor(diffMs / 3600000); if (diffHours < 24) return `${diffHours}시간 전`; return `${Math.floor(diffHours / 24)}일 전`; } catch (e) { return ''; } }
    getDefaultExchangeRates() { return { USD_KRW: '0.00', JPY_KRW_100: '0.00', lastUpdate: new Date().toISOString() }; }
    getEmergencyNews() { return { sections: { world: [{ id: 'emergency-1', translatedTitle: '뉴스 시스템 점검 중', description: '데이터를 불러오지 못했습니다.', summary: '• 뉴스 수집 시스템 오류 발생', url: '#', publishedAt: new Date().toISOString(), source: { name: 'EmarkNews System' }, stars: 1, timeAgo: '방금 전' }] }, exchangeRates: this.getDefaultExchangeRates(), systemStatus: { version: '21.0-emergency', lastUpdate: new Date().toISOString() } }; }
}

const newsSystem = new EmarkNewsSystem();

app.get('/api/news', async (req, res) => {
    try {
        const forceRefresh = req.query._force === 'true';
        const data = await newsSystem.getNews(forceRefresh);
        res.json(data);
    } catch (error) {
        console.error("API Error:", error);
        res.status(500).json({ error: 'Failed to fetch news data' });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`✅ Server is running on port ${PORT}`);
    newsSystem.getNews();
});