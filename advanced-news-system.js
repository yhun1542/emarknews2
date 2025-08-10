const axios = require('axios');
const OpenAI = require('openai');

class NewspaperStyleNewsSystem {
    constructor() {
        this.cache = new Map();
        this.cacheExpiry = 10 * 60 * 1000; // 10분
        this.lastUpdate = null;
        
        // API 클라이언트 초기화
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
        
        // 뉴스 소스 매핑
        this.newsSources = {
            'reuters.com': 'Reuters',
            'bbc.com': 'BBC News',
            'cnn.com': 'CNN',
            'apnews.com': 'Associated Press',
            'nytimes.com': 'The New York Times',
            'washingtonpost.com': 'The Washington Post',
            'theguardian.com': 'The Guardian',
            'wsj.com': 'The Wall Street Journal',
            'bloomberg.com': 'Bloomberg',
            'ft.com': 'Financial Times',
            'naver.com': 'Naver News',
            'chosun.com': '조선일보',
            'joongang.co.kr': '중앙일보',
            'donga.com': '동아일보',
            'hani.co.kr': '한겨레',
            'khan.co.kr': '경향신문',
            'mt.co.kr': '머니투데이',
            'ytn.co.kr': 'YTN',
            'sbs.co.kr': 'SBS',
            'mbc.co.kr': 'MBC',
            'kbs.co.kr': 'KBS',
            'nhk.or.jp': 'NHK',
            'asahi.com': '아사히신문',
            'mainichi.jp': '마이니치신문',
            'yomiuri.co.jp': '요미우리신문',
            'nikkei.com': '니혼게이자이신문',
            'japantimes.co.jp': 'The Japan Times'
        };
        
        // 긴급/중요/버즈 키워드
        this.urgentKeywords = [
            '긴급', '속보', '돌발', '사고', '재해', '지진', '화재', '폭발', '테러', '전쟁',
            'breaking', 'urgent', 'emergency', 'disaster', 'earthquake', 'fire', 'explosion', 'terror', 'war',
            '사망', '부상', '피해', '구조', '대피', '경보', '위험', '위기', '충돌', '붕괴'
        ];
        
        this.importantKeywords = [
            '대통령', '총리', '장관', '국회', '정부', '정책', '법안', '선거', '투표', '개혁',
            'president', 'minister', 'government', 'policy', 'election', 'vote', 'reform',
            '경제', '금리', '주가', '환율', '인플레이션', '성장률', '실업률', '예산', '세금'
        ];
        
        this.buzzKeywords = [
            '화제', '인기', '트렌드', '바이럴', '논란', '이슈', '관심', '주목', '센세이션',
            'viral', 'trending', 'popular', 'buzz', 'sensation', 'controversial', 'hot',
            'K-팝', 'BTS', '블랙핑크', '손흥민', '오타니', '넷플릭스', '유튜브', '틱톡'
        ];
        
        console.log('📰 종이신문 스타일 뉴스 시스템 초기화 완료');
        console.log(`🤖 OpenAI API: ${process.env.OPENAI_API_KEY ? '✅ 설정됨' : '❌ 없음'}`);
        console.log(`📡 NewsAPI: ${process.env.NEWS_API_KEY ? '✅ 설정됨' : '❌ 없음'}`);
    }

    // ** 표시 완전 제거 함수
    cleanBoldMarkers(text) {
        if (!text) return '';
        
        // 모든 ** 표시 제거 (앞뒤 공백 포함)
        return text
            .replace(/\*\*([^*]+)\*\*/g, '$1')  // **텍스트** → 텍스트
            .replace(/\*\*/g, '')              // 남은 ** 제거
            .replace(/\s+/g, ' ')              // 연속 공백 정리
            .trim();                           // 앞뒤 공백 제거
    }

    // 블릿 포인트를 한 줄씩 처리
    formatBulletPoints(text) {
        if (!text) return '';
        
        // 기존 블릿 포인트 분리
        const bullets = text.split('•').filter(item => item.trim());
        
        // 각 블릿을 한 줄씩 정리
        const cleanBullets = bullets.map(bullet => {
            const cleaned = this.cleanBoldMarkers(bullet.trim());
            return cleaned.length > 0 ? `• ${cleaned}` : '';
        }).filter(bullet => bullet.length > 0);
        
        // 한 줄씩 반환
        return cleanBullets.join('\n');
    }

    // 실제 뉴스 소스에서 언론사명 추출
    extractSourceName(url) {
        if (!url) return '알 수 없는 소스';
        
        try {
            const domain = new URL(url).hostname.replace('www.', '');
            return this.newsSources[domain] || domain;
        } catch {
            return '알 수 없는 소스';
        }
    }

    // 마크 분석 (긴급/중요/버즈)
    analyzeMarks(title, description) {
        const text = `${title} ${description}`.toLowerCase();
        const marks = [];
        
        // 긴급 키워드 체크
        if (this.urgentKeywords.some(keyword => text.includes(keyword.toLowerCase()))) {
            marks.push('긴급');
        }
        
        // 중요 키워드 체크
        if (this.importantKeywords.some(keyword => text.includes(keyword.toLowerCase()))) {
            marks.push('중요');
        }
        
        // 버즈 키워드 체크
        if (this.buzzKeywords.some(keyword => text.includes(keyword.toLowerCase()))) {
            marks.push('Buzz');
        }
        
        return marks;
    }

    // 카테고리 분류
    categorizeNews(title, description) {
        const text = `${title} ${description}`.toLowerCase();
        
        if (text.includes('정치') || text.includes('대통령') || text.includes('국회') || text.includes('정부')) return '정치';
        if (text.includes('경제') || text.includes('주가') || text.includes('금리') || text.includes('기업')) return '경제';
        if (text.includes('스포츠') || text.includes('축구') || text.includes('야구') || text.includes('올림픽')) return '스포츠';
        if (text.includes('기술') || text.includes('AI') || text.includes('IT') || text.includes('테크')) return '기술';
        if (text.includes('과학') || text.includes('연구') || text.includes('우주') || text.includes('의학')) return '과학';
        if (text.includes('문화') || text.includes('예술') || text.includes('영화') || text.includes('음악')) return '문화';
        if (text.includes('사회') || text.includes('교육') || text.includes('복지') || text.includes('환경')) return '사회';
        
        return '일반';
    }

    // 뉴스 데이터 생성 (실제 API 대신 고품질 샘플 데이터)
    generateNewsData() {
        const now = new Date();
        
        const worldNews = [
            {
                id: 'world-1',
                title: 'NASA 우주비행사 4명 국제우주정거장서 안전 귀환',
                summary: this.formatBulletPoints('• 크루-10 미션 5개월 체류 마치고 지구 복귀\n• 캡슐 재진입 과정서 3천도 고온 견뎌\n• 17시간 귀환 여정 끝에 태평양 착수 성공'),
                description: 'NASA의 크루-10 미션에 참여한 4명의 우주비행사가 5개월간의 국제우주정거장 체류를 마치고 안전하게 지구로 돌아왔다.',
                url: 'https://www.nasa.gov/news',
                image: 'https://images.unsplash.com/photo-1446776653964-20c1d3a81b06?w=400&h=250&fit=crop',
                publishedAt: new Date(now.getTime() - 10 * 60 * 60 * 1000).toISOString(),
                source: { name: 'NASA', display: 'NASA 10시간 전' },
                category: '과학',
                marks: ['중요'],
                stars: 4,
                urgency: 3,
                importance: 4,
                buzz: 3
            },
            {
                id: 'world-2',
                title: '트럼프 전 대통령 아제르바이잔-아르메니아 평화협정 중재',
                summary: this.formatBulletPoints('• 바이든 행정부 기반 위에 최종 합의 도출\n• 코카서스 지역 분쟁 해결의 전환점\n• 양국 간 30년 갈등 종식 기대감 고조'),
                description: '도널드 트럼프 전 대통령이 아제르바이잔과 아르메니아 간의 평화협정 체결에 결정적 역할을 했다.',
                url: 'https://www.reuters.com/world',
                image: 'https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=400&h=250&fit=crop',
                publishedAt: new Date(now.getTime() - 20 * 60 * 60 * 1000).toISOString(),
                source: { name: '로이터', display: '로이터 20시간 전' },
                category: '정치',
                marks: ['긴급', '중요'],
                stars: 5,
                urgency: 4,
                importance: 5,
                buzz: 4
            },
            {
                id: 'world-3',
                title: '캘리포니아 산불 로스앤젤레스 카운티로 확산',
                summary: this.formatBulletPoints('• 벤튜라 카운티 레이크 피루 인근서 시작\n• 진화율 28% 수준에 그쳐 확산 지속\n• 주민 대피령 발령, 소방당국 총력 대응'),
                description: '캘리포니아 벤튜라 카운티 레이크 피루 근처에서 발생한 대형 산불이 로스앤젤레스 카운티까지 확산되고 있다.',
                url: 'https://www.cnn.com/world',
                image: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=400&h=250&fit=crop',
                publishedAt: new Date(now.getTime() - 19 * 60 * 60 * 1000).toISOString(),
                source: { name: 'CNN', display: 'CNN 19시간 전' },
                category: '사회',
                marks: ['긴급'],
                stars: 4,
                urgency: 4,
                importance: 4,
                buzz: 3
            }
        ];

        const koreaNews = [
            {
                id: 'korea-1',
                title: '오타니 쇼헤이 93년 만에 3년 연속 40홈런-110득점 대기록',
                summary: this.formatBulletPoints('• 메이저리그 역사상 세 번째 달성\n• 현재 시즌 42홈런 115득점 기록 중\n• 투타 겸업으로 15승 8패 평균자책점 2.95'),
                description: '로스앤젤레스 에인절스 오타니 쇼헤이가 메이저리그 역사상 93년 만에 3년 연속 시즌 40홈런-110득점이라는 대기록을 달성했다.',
                url: 'https://news.naver.com',
                image: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=400&h=250&fit=crop',
                publishedAt: new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString(),
                source: { name: '연합뉴스', display: '연합뉴스 5시간 전' },
                category: '스포츠',
                marks: ['중요', 'Buzz'],
                stars: 5,
                urgency: 3,
                importance: 5,
                buzz: 5
            },
            {
                id: 'korea-2',
                title: '손흥민 MLS 데뷔전서 1골 1도움 맹활약',
                summary: this.formatBulletPoints('• MLS 공식 홈페이지 "손흥민 시대 시작" 극찬\n• 90분 풀타임 출전으로 완벽 적응력 과시\n• 현지 언론과 팬들 뜨거운 반응'),
                description: '토트넘에서 MLS로 이적한 손흥민이 데뷔전에서 1골 1도움을 기록하며 화려한 스타트를 끊었다.',
                url: 'https://news.kbs.co.kr',
                image: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=400&h=250&fit=crop',
                publishedAt: new Date(now.getTime() - 22 * 60 * 60 * 1000).toISOString(),
                source: { name: 'KBS', display: 'KBS 22시간 전' },
                category: '스포츠',
                marks: ['긴급', 'Buzz'],
                stars: 5,
                urgency: 4,
                importance: 5,
                buzz: 5
            },
            {
                id: 'korea-3',
                title: '정상빈 MLS 세인트루이스 이적 후 첫 골 작품',
                summary: this.formatBulletPoints('• 팀 3-1 승리 견인하는 결승골\n• 한국 선수 MLS 적응 성공 사례\n• 클럽 측 "최고의 영입" 평가'),
                description: '정상빈이 MLS 세인트루이스 시티 SC 이적 후 첫 골을 터뜨리며 팀의 3-1 승리를 이끌었다.',
                url: 'https://news.sbs.co.kr',
                image: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=400&h=250&fit=crop',
                publishedAt: new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString(),
                source: { name: 'SBS', display: 'SBS 4시간 전' },
                category: '스포츠',
                marks: ['중요'],
                stars: 4,
                urgency: 3,
                importance: 4,
                buzz: 4
            },
            {
                id: 'korea-4',
                title: '국민의힘 전당대회 한국사 강사 논란으로 분열 조짐',
                summary: this.formatBulletPoints('• 전한길씨 둘러싼 당내 의견 대립\n• 강원 야권에서 우려 목소리 제기\n• 당 통합 vs 쇄신 갈등 표면화'),
                description: '국민의힘 전당대회가 한국사 강사 전한길씨를 둘러싼 논란으로 분열 양상을 보이고 있다.',
                url: 'https://www.chosun.com',
                image: 'https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=400&h=250&fit=crop',
                publishedAt: new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString(),
                source: { name: '조선일보', display: '조선일보 12시간 전' },
                category: '정치',
                marks: ['중요'],
                stars: 4,
                urgency: 3,
                importance: 4,
                buzz: 3
            }
        ];

        const japanNews = [
            {
                id: 'japan-1',
                title: '일본 정부 2026년 경제성장률 2.1% 전망',
                summary: this.formatBulletPoints('• 내수 회복과 수출 증가 동반 성장\n• 디지털 전환 투자 확대 계획\n• 아시아 경제 회복 견인 역할 기대'),
                description: '일본 정부가 2026년 경제성장률을 2.1%로 전망한다고 발표했다.',
                url: 'https://www3.nhk.or.jp/news',
                image: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400&h=250&fit=crop',
                publishedAt: new Date(now.getTime() - 14 * 60 * 60 * 1000).toISOString(),
                source: { name: 'NHK', display: 'NHK 14시간 전' },
                category: '경제',
                marks: ['중요'],
                stars: 4,
                urgency: 3,
                importance: 4,
                buzz: 3
            },
            {
                id: 'japan-2',
                title: '도쿄 올림픽 레거시 시설 활용 방안 논의',
                summary: this.formatBulletPoints('• 올림픽 경기장 사후 활용 계획 수립\n• 지역 스포츠 발전과 관광 연계\n• 시설 유지비 절감 방안 모색'),
                description: '도쿄도가 2021년 올림픽 레거시 시설의 효율적 활용 방안을 논의하고 있다.',
                url: 'https://www.asahi.com',
                image: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=400&h=250&fit=crop',
                publishedAt: new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString(),
                source: { name: '아사히신문', display: '아사히신문 3시간 전' },
                category: '사회',
                marks: ['중요'],
                stars: 3,
                urgency: 2,
                importance: 3,
                buzz: 2
            }
        ];

        return {
            sections: {
                world: worldNews,
                korea: koreaNews,
                japan: japanNews
            },
            trending: [
                ['오타니', 28], ['손흥민', 25], ['NASA', 22], ['트럼프', 20], 
                ['MLS', 18], ['산불', 15], ['일본경제', 12], ['정상빈', 10],
                ['국민의힘', 8], ['올림픽', 6]
            ],
            lastUpdated: now.toISOString(),
            totalArticles: worldNews.length + koreaNews.length + japanNews.length,
            systemStatus: this.getSystemStatus()
        };
    }

    // 메인 뉴스 수집 함수
    async collectAllNews() {
        const cacheKey = 'newspaper_premium_news';
        
        // 캐시 확인
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheExpiry) {
                console.log('📰 종이신문 프리미엄 캐시 사용');
                return cached.data;
            }
        }
        
        console.log('📰 종이신문 프리미엄 뉴스 수집 시작...');
        const startTime = Date.now();
        
        try {
            const result = this.generateNewsData();
            
            // 캐시 저장
            this.cache.set(cacheKey, {
                data: result,
                timestamp: Date.now()
            });
            
            this.lastUpdate = new Date();
            
            console.log(`✅ 종이신문 프리미엄 뉴스 처리 완료 (${Date.now() - startTime}ms)`);
            return result;
            
        } catch (error) {
            console.error('❌ 종이신문 프리미엄 뉴스 수집 오류:', error);
            return this.generateNewsData();
        }
    }

    // collectNews 메서드 추가 (호환성)
    async collectNews() {
        return await this.collectAllNews();
    }

    // 시스템 상태
    getSystemStatus() {
        return {
            mode: 'newspaper-premium',
            version: '7.0.0-newspaper-premium',
            cacheSize: this.cache.size,
            lastUpdate: this.lastUpdate ? this.lastUpdate.toISOString() : null,
            apiSources: {
                openai: !!process.env.OPENAI_API_KEY,
                newsapi: !!process.env.NEWS_API_KEY
            },
            features: [
                'newspaper-premium-design',
                'bold-marker-removal',
                'bullet-point-formatting',
                'real-source-mapping',
                'multi-mark-system',
                'category-classification',
                'high-quality-images'
            ]
        };
    }

    // 캐시 클리어
    clearCache() {
        this.cache.clear();
        console.log('📰 종이신문 프리미엄 캐시 클리어 완료');
    }
}

module.exports = NewspaperStyleNewsSystem;

