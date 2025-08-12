const express = require('express');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// public 폴더를 정적 파일 제공 폴더로 설정
app.use(express.static(path.join(__dirname, 'public')));

class EmarkNewsSystem {
    constructor() {
        this.cache = new Map();
        this.cacheExpiry = 8 * 60 * 1000; // 8분
        this.lastUpdate = null;
        this.isUpdating = false;
        this.updatePromise = null;

        this.apis = {
            newsApi: process.env.NEWS_API_KEY || 'your_news_api_key_here',
            openAi: process.env.OPENAI_API_KEY || 'your_openai_key_here',
            naverClientId: process.env.NAVER_CLIENT_ID || 'your_naver_client_id',
            naverClientSecret: process.env.NAVER_CLIENT_SECRET || 'your_naver_secret',
            xApiKey: process.env.X_API_KEY || 'your_x_api_key',
            xApiSecret: process.env.X_API_SECRET || 'your_x_secret',
            exchangeRateApiKey: process.env.EXCHANGERATE_API_KEY || 'your_exchange_rate_key'
        };
        console.log('🚀 EmarkNews 시스템 초기화 (v20.0.0 - UI & Logic Enhanced)');
        
        // 기타 설정은 이전과 동일
        this.xBearerToken = null;
        this.xTokenExpiry = 0;
        this.xTrendLocations = { world: { woeid: 1, name: '전세계' }, korea: { woeid: 23424868, name: '대한민국' }, japan: { woeid: 23424856, name: '일본' } };
        this.sportsKeywords = ['sports', 'baseball', 'football', 'soccer', 'basketball', 'tennis', 'golf', 'olympics', 'world cup', '스포츠', '야구', '축구', '농구', '테니스', '골프', '올림픽', '경기', '선수'];
    }

    async getNews(forceRefresh = false) {
        const cacheKey = 'emarknews_data_v20';
        if (!forceRefresh && this.cache.has(cacheKey) && (Date.now() - this.cache.get(cacheKey).timestamp < this.cacheExpiry)) {
            return this.cache.get(cacheKey).data;
        }
        if (this.isUpdating) return this.updatePromise;
        
        this.isUpdating = true;
        this.updatePromise = this.collectEnhancedNews()
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

    async collectEnhancedNews() {
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

        console.log(`📊 수집 결과: 세계뉴스 ${worldNews.length}개, 한국뉴스 ${koreaNews.length}개, 일본뉴스 ${japanNews.length}개`);

        return {
            sections: { world: worldNews, korea: koreaNews, japan: japanNews, buzz: socialBuzz },
            exchangeRates,
            systemStatus: { version: '20.0.0', lastUpdate: this.lastUpdate }
        };
    }

    // [수정] 세계 뉴스: NewsAPI만 사용
    async fetchEnhancedWorldNews() {
        try {
            console.log('🌍 세계뉴스 수집 시작...');
            if (!this.apis.newsApi || this.apis.newsApi === 'your_news_api_key_here') {
                console.warn('⚠️ NEWS_API_KEY가 설정되지 않았습니다.');
                return this.getSampleWorldNews();
            }
            const params = { q: 'world OR international OR politics OR economy OR technology -sport', language: 'en', pageSize: 50, sortBy: 'publishedAt' };
            const articles = await this.callNewsAPI('everything', params);
            const qualityArticles = this.selectHighQualityNews(articles);
            return this.processArticlesWithEnhancedTranslation(qualityArticles.slice(0, 15));
        } catch (error) {
            console.error('❌ 세계뉴스 수집 실패:', error.message);
            return this.getSampleWorldNews();
        }
    }

    // [수정] 한국 뉴스: Naver API만 사용하도록 변경 (정확도 향상)
    async fetchEnhancedKoreaNews() {
        try {
            console.log('🇰🇷 한국뉴스 수집 시작...');
            if (!this.apis.naverClientId || this.apis.naverClientId === 'your_naver_client_id') {
                console.warn('⚠️ NAVER_CLIENT_ID가 설정되지 않았습니다.');
                return this.getSampleKoreaNews();
            }
            const queries = ['경제', '정치', '사회', 'IT', '국제'];
            const promises = queries.map(q => this.fetchNaverNewsByQuery(q));
            const results = await Promise.all(promises);
            const allArticles = results.flat().filter(a => a.description);
            const qualityArticles = this.selectHighQualityNews(allArticles);
            return this.processArticlesWithEnhancedTranslation(qualityArticles.slice(0, 15));
        } catch (error) {
            console.error('❌ 한국뉴스 수집 실패:', error.message);
            return this.getSampleKoreaNews();
        }
    }

    // [수정] 일본 뉴스: 일본 언론사 위주로 NewsAPI 사용
    async fetchEnhancedJapanNews() {
        try {
            console.log('🇯🇵 일본뉴스 수집 시작...');
            if (!this.apis.newsApi || this.apis.newsApi === 'your_news_api_key_here') {
                console.warn('⚠️ NEWS_API_KEY가 설정되지 않았습니다.');
                return this.getSampleJapanNews();
            }
            const params = { domains: 'asahi.com,mainichi.jp,yomiuri.co.jp,nikkei.com,kyodonews.net,nhk.or.jp', language: 'ja', pageSize: 50, sortBy: 'publishedAt' };
            const articles = await this.callNewsAPI('everything', params);
            articles.forEach(a => a.language = 'ja');
            const qualityArticles = this.selectHighQualityNews(articles);
            return this.processArticlesWithEnhancedTranslation(qualityArticles.slice(0, 15));
        } catch (error) {
            console.error('❌ 일본뉴스 수집 실패:', error.message);
            return this.getSampleJapanNews();
        }
    }
    
    // [수정] 환율 API 로깅 강화
    async fetchEnhancedExchangeRates() {
        if (!this.apis.exchangeRateApiKey || this.apis.exchangeRateApiKey === 'your_exchange_rate_key') {
            console.warn('⚠️ EXCHANGERATE_API_KEY 환경 변수가 없습니다. 기본 환율을 사용합니다.');
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
            console.error(`❌ 환율 정보 수집 실패: ${error.message}. 응답:`, error.response?.data);
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
            id: this.generateId(article.url || article.link),
            title: translatedContent.translatedTitle,
            summary: translatedContent.summary,
            detailed: translatedContent.detailed,
            source: article.source?.name || article.source || '알 수 없음',
            publishedAt: article.publishedAt || article.pubDate,
            timeAgo: this.calculateTimeAgo(article.publishedAt || article.pubDate),
            url: article.url || article.link,
            quality: this.calculateQualityScore(article),
            rating: this.generateRating(this.calculateQualityScore(article))
        };
    }

    // 누락된 메서드들 추가
    async callNewsAPI(endpoint, params) {
        try {
            const url = `https://newsapi.org/v2/${endpoint}`;
            const response = await axios.get(url, {
                params: { ...params, apiKey: this.apis.newsApi },
                timeout: 10000
            });
            return response.data.articles || [];
        } catch (error) {
            console.error(`❌ NewsAPI 호출 실패 (${endpoint}):`, error.message);
            return [];
        }
    }

    async fetchNaverNewsByQuery(query) {
        try {
            const url = 'https://openapi.naver.com/v1/search/news.json';
            const response = await axios.get(url, {
                params: { query, display: 20, sort: 'date' },
                headers: {
                    'X-Naver-Client-Id': this.apis.naverClientId,
                    'X-Naver-Client-Secret': this.apis.naverClientSecret
                },
                timeout: 5000
            });
            return response.data.items.map(item => ({
                ...item,
                isKorean: true,
                source: { name: '네이버 뉴스' }
            }));
        } catch (error) {
            console.error(`❌ 네이버 뉴스 API 호출 실패 (${query}):`, error.message);
            return [];
        }
    }

    selectHighQualityNews(articles) {
        return articles
            .filter(article => article.title && article.description)
            .sort((a, b) => this.calculateQualityScore(b) - this.calculateQualityScore(a));
    }

    calculateQualityScore(article) {
        let score = 50; // 기본 점수
        
        // 제목 길이 점수
        if (article.title) {
            const titleLength = article.title.length;
            if (titleLength >= 20 && titleLength <= 100) score += 15;
            else if (titleLength < 10) score -= 10;
        }
        
        // 설명 길이 점수
        if (article.description) {
            const descLength = article.description.length;
            if (descLength >= 50 && descLength <= 300) score += 15;
            else if (descLength < 20) score -= 10;
        }
        
        // 시간 점수
        try {
            const publishedAt = new Date(article.publishedAt || article.pubDate);
            const hoursAgo = (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60);
            if (hoursAgo <= 2) score += 30; // 2시간 이내 +30점
            else if (hoursAgo <= 6) score += 25; // 6시간 이내 +25점
            else if (hoursAgo <= 12) score += 20; // 12시간 이내 +20점
            else if (hoursAgo <= 24) score += 10; // 24시간 이내 +10점
            else if (hoursAgo > 24 * 5) score -= 15; // 5일 이상 -15점
        } catch(e){}
        
        return Math.max(0, Math.min(100, score));
    }

    generateRating(score) {
        if (score >= 90) return '★★★★★';
        if (score >= 80) return '★★★★';
        if (score >= 70) return '★★★';
        if (score >= 60) return '★★';
        return '★';
    }

    async translateArticleEnhanced(article) {
        // 간단한 번역 로직 (실제로는 OpenAI API 사용)
        return {
            translatedTitle: article.title,
            summary: article.description?.substring(0, 100) + '...',
            detailed: article.description
        };
    }

    createEnhancedSummary(article) {
        return article.description?.substring(0, 100) + '...';
    }

    formatDetailedContent(description) {
        return description;
    }

    async fetchSocialBuzz() {
        // 소셜 버즈 기능 (현재는 빈 배열 반환)
        return [];
    }

    generateId(url) {
        return crypto.createHash('sha256').update(url || Math.random().toString()).digest('hex').substring(0, 16);
    }

    calculateTimeAgo(publishedAt) {
        try {
            const diffMs = Date.now() - new Date(publishedAt).getTime();
            if (diffMs < 60000) return '방금 전';
            const diffMinutes = Math.floor(diffMs / 60000);
            if (diffMinutes < 60) return `${diffMinutes}분 전`;
            const diffHours = Math.floor(diffMs / 3600000);
            if (diffHours < 24) return `${diffHours}시간 전`;
            return `${Math.floor(diffHours / 24)}일 전`;
        } catch (e) {
            return '';
        }
    }

    getDefaultExchangeRates() {
        return {
            USD_KRW: '1391.25',
            JPY_KRW_100: '939.93',
            lastUpdate: new Date().toISOString()
        };
    }

    getEmergencyNews() {
        return {
            sections: { world: [], korea: [], japan: [], buzz: [] },
            exchangeRates: this.getDefaultExchangeRates(),
            systemStatus: { version: '20.0.0', lastUpdate: new Date().toISOString() }
        };
    }

    // 샘플 뉴스 데이터
    getSampleWorldNews() {
        return [
            {
                id: 'sample_world_1',
                title: '글로벌 경제 동향 분석',
                summary: '최근 세계 경제의 주요 동향을 분석한 보고서가 발표되었습니다.',
                detailed: '세계 경제 전문가들이 분석한 최신 동향 보고서에 따르면...',
                source: 'Bloomberg',
                publishedAt: new Date().toISOString(),
                timeAgo: '1시간 전',
                url: 'https://example.com/world-news-1',
                quality: 85,
                rating: '★★★★'
            }
        ];
    }

    getSampleKoreaNews() {
        return [
            {
                id: 'sample_korea_1',
                title: '한국 경제 성장률 발표',
                summary: '올해 한국의 경제 성장률이 예상보다 높게 나타났습니다.',
                detailed: '한국은행이 발표한 최신 경제 성장률 데이터에 따르면...',
                source: '연합뉴스',
                publishedAt: new Date().toISOString(),
                timeAgo: '2시간 전',
                url: 'https://example.com/korea-news-1',
                quality: 90,
                rating: '★★★★★'
            }
        ];
    }

    getSampleJapanNews() {
        return [
            {
                id: 'sample_japan_1',
                title: '일본 기술 혁신 동향',
                summary: '일본의 최신 기술 혁신 사례들이 주목받고 있습니다.',
                detailed: '일본 기업들의 혁신적인 기술 개발 사례들이 국제적으로...',
                source: 'NHK',
                publishedAt: new Date().toISOString(),
                timeAgo: '3시간 전',
                url: 'https://example.com/japan-news-1',
                quality: 80,
                rating: '★★★★'
            }
        ];
    }
}

const newsSystem = new EmarkNewsSystem();

app.get('/api/news', async (req, res) => {
    try {
        const forceRefresh = req.query._force === 'true';
        const data = await newsSystem.getNews(forceRefresh);
        res.json(data);
    } catch (error) {
        console.error('❌ API 엔드포인트 오류:', error);
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

