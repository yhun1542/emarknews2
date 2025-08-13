/**
 * EmarkNews — 뉴스 알고리즘 최적화 백엔드 (FINAL up to STEP 5-1)
 * 포함 범위
 *  - PART 3-1: 클러스터링
 *  - PART 3-2: 라벨링 + 별점(rating)
 *  - PART 3-3: /healthz 확장, Cache-Control, ETag/If-None-Match, ENV 매핑, .env.sample
 *  - PART 5-1: /feed 옵션(domain_cap, freshness, lang) 처리, 응답 스키마 주석화, QA 체크리스트 주석 추가
 */

"use strict";

const express = require("express");
const crypto = require("crypto");
const path = require("path");
const app = express();

app.use(express.json());

/* =========================================
   환경 변수 (Railway에서 제공)
   ========================================= */
const {
  NEWS_API_KEYS = "",
  TRANSLATE_API_KEY = "",
  ORIGIN_WHITELIST = "",
  NODE_ENV = "development"
} = process.env;

/* =========================================
   상수/유틸
   ========================================= */
const NOW = () => Date.now();
const HOUR = 3600 * 1000;
const TIME_DECAY_TAU_HOURS = 72;
const SIGNATURE_TOPK = 8;
const MAX_CLUSTER_SIZE = 50;

const STOP_WORDS = new Set([
  "그","이","저","것","수","등","및","에서","으로","하다","했다","지난","오늘","내일",
  "대한","관련","위해","그리고","하지만","또한","모든","기사","속보","단독",
  "the","a","an","and","or","but","is","are","was","were","to","of","in","on","for","with","by","from",
  "at","as","that","this","these","those","be","been","it","its","into","about","their","his","her",
  "you","your","we","our","they","them","he","she"
]);

const SOURCE_QUALITY = {
  "reuters.com": 1.15,
  "apnews.com": 1.12,
  "bbc.com": 1.10,
  "nytimes.com": 1.10,
  "wsj.com": 1.08,
  "bloomberg.com": 1.08
};

/* =========================================
   라벨 규칙
   ========================================= */
const LABEL_RULES = {
  politics: [/election|senate|parliament|white\s*house|의회|총선|대선|정당|의장|외교|국방/i],
  economy:  [/inflation|gdp|interest|bond|market|고용|물가|성장률|경제|수출|환율/i],
  tech:     [/ai|artificial\s*intelligence|chip|semiconductor|iphone|android|구글|애플|삼성|테크|반도체|클라우드/i],
  business: [/merger|acquisition|earnings|ipo|startup|buyback|기업|실적|인수|합병|상장|스타트업/i],
  world:    [/united\s*nations|eu|nato|중동|우크라이나|이스라엘|국제|세계/i],
  sport:    [/world\s*cup|olympic|league|match|경기|리그|올림픽|월드컵/i],
  entertainment: [/film|movie|box\s*office|drama|idol|k-pop|배우|영화|드라마|음원|아이돌/i],
  japan:    [/japan|tokyo|osaka|일본|도쿄|오사카/i],
  korea:    [/korea|seoul|한국|서울|부산|대한민국/i]
};

function detectLabelsForText(text, maxLabels = 2) {
  const hits = [];
  for (const [label, patterns] of Object.entries(LABEL_RULES)) {
    for (const re of patterns) {
      if (re.test(text)) { hits.push(label); break; }
    }
  }
  if (hits.length > maxLabels) {
    const prio = { tech:9, economy:8, business:7, politics:6, world:5, korea:4, japan:3, sport:2, entertainment:1 };
    hits.sort((a,b)=>(prio[b]||0)-(prio[a]||0));
    return hits.slice(0, maxLabels);
  }
  return hits;
}

/* =========================================
   텍스트 처리
   ========================================= */
function normalizeText(s) {
  if (!s) return "";
  return String(s).replace(/https?:\/\/\S+/g," ")
    .replace(/[^\p{L}\p{N}\s]/gu," ")
    .replace(/\s+/g," ").trim().toLowerCase();
}
function tokenize(s) { return s ? s.split(/\s+/).filter(Boolean) : []; }

function extractKeywords(text, topK = SIGNATURE_TOPK) {
  const norm = normalizeText(text);
  const toks = tokenize(norm);
  const freq = new Map();
  for (const t of toks) {
    if (STOP_WORDS.has(t)) continue;
    if (/^\d+$/.test(t)) continue;
    freq.set(t, (freq.get(t)||0)+1);
  }
  const arr = Array.from(freq.entries());
  arr.sort((a,b)=>(b[1]-a[1]) || (b[0].length-a[0].length));
  return arr.slice(0, topK).map(([w])=>w);
}

function articleSignature(article) {
  const base = [article.title, article.summary, article.content].filter(Boolean).join(" ");
  const keys = extractKeywords(base, SIGNATURE_TOPK);
  const sig = keys.sort().join("|");
  return sig || (article.title ? normalizeText(article.title).slice(0,80) : "no-title");
}

function hashId(s) { return crypto.createHash("md5").update(s).digest("hex").slice(0,12); }

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./,""); }
  catch { return ""; }
}

/* =========================================
   가중치/레이터
   ========================================= */
function freshnessWeight(publishedAt) {
  if (!publishedAt) return 0.9;
  const ts = typeof publishedAt==="string" ? Date.parse(publishedAt) : +publishedAt;
  if (!Number.isFinite(ts)) return 0.9;
  const hours = (NOW()-ts)/HOUR;
  const w = Math.exp(-Math.max(0,hours)/TIME_DECAY_TAU_HOURS);
  return Math.min(1.0, Math.max(0.2, w));
}

function sourceWeight(url) {
  const d = getDomain(url);
  return d ? (SOURCE_QUALITY[d] || 1.0) : 1.0;
}

function computeRating(cluster) {
  if (!cluster.articles.length) return 0;
  let fSum = 0, sSum = 0;
  for (const a of cluster.articles) { fSum += freshnessWeight(a.publishedAt); sSum += sourceWeight(a.url); }
  const wF = fSum / cluster.articles.length;                 // 0.2~1.0
  const wS = (sSum / cluster.articles.length) / 1.10;        // ~0.9~1.05
  const sizeBoost = Math.log(1 + cluster.articles.length) / Math.log(1 + MAX_CLUSTER_SIZE); // 0~1
  const raw = Math.max(0, Math.min(1, 0.55*wF + 0.30*wS + 0.15*sizeBoost));
  return +(raw * 5).toFixed(2);
}

/* =========================================
   클러스터
   ========================================= */
function createEmptyCluster(signature) {
  return {
    id: hashId(signature + ":" + Math.random().toString(36).slice(2,8)),
    signature,
    keywords: signature ? signature.split("|") : [],
    articles: [],
    centroid: { titleTokens:new Map(), publishedAtAvg:0 },
    score: 0,
    labels: [],
    rating: 0,
    createdAt: new Date().toISOString()
  };
}

function updateCentroid(cluster, article) {
  const keys = extractKeywords(article.title || "", SIGNATURE_TOPK);
  for (const k of keys)
    cluster.centroid.titleTokens.set(k, (cluster.centroid.titleTokens.get(k)||0)+1);

  const ts = article.publishedAt ? Date.parse(article.publishedAt) : NaN;
  if (Number.isFinite(ts)) {
    const n = cluster.articles.length;
    const prev = cluster.centroid.publishedAtAvg || ts;
    cluster.centroid.publishedAtAvg = n===1 ? ts : Math.round((prev*(n-1)+ts)/n);
  }
}

function clusterScore(cluster) {
  if (!cluster.articles.length) return 0;
  let fSum=0, sSum=0;
  for (const a of cluster.articles) { fSum+=freshnessWeight(a.publishedAt); sSum+=sourceWeight(a.url); }
  const fAvg = fSum/cluster.articles.length;
  const sAvg = sSum/cluster.articles.length;
  const sizeBoost = Math.log(1+cluster.articles.length);
  return +(fAvg*sAvg*sizeBoost).toFixed(6);
}

function intersectionSize(aSet, bSet) { let c=0; for (const x of aSet) if (bSet.has(x)) c++; return c; }

function mergeNearbyBuckets(buckets) {
  const sigs = Array.from(buckets.keys()).sort((a,b)=>(a.length-b.length)||a.localeCompare(b));
  const sigToSet = new Map(sigs.map(s => [s, new Set(s.split("|"))]));
  for (let i=0;i<sigs.length;i++) {
    const a = sigs[i]; const aSet = sigToSet.get(a);
    if (!buckets.has(a)) continue;
    for (let j=i+1;j<=Math.min(i+3, sigs.length-1);j++) {
      const b = sigs[j]; if (!buckets.has(b)) continue;
      const bSet = sigToSet.get(b);
      const inter = intersectionSize(aSet,bSet);
      const minSize = Math.min(aSet.size,bSet.size);
      if (inter >= Math.ceil(minSize*0.5)) {
        const A=buckets.get(a), B=buckets.get(b);
        const into = (A.articles.length>=B.articles.length) ? A : B;
        const from = (into===A) ? B : A;
        for (const art of from.articles) {
          if (into.articles.length>=MAX_CLUSTER_SIZE) break;
          into.articles.push(art);
          updateCentroid(into, art);
        }
        into.score = clusterScore(into);
        buckets.delete((into===A) ? b : a);
      }
    }
  }
  return buckets;
}

function enrichCluster(cluster) {
  const head = cluster.articles[0] || {};
  const baseText = [head.title||"", head.summary||"", cluster.keywords.join(" ")].join(" ");
  cluster.labels = detectLabelsForText(baseText, 2);
  cluster.rating = computeRating(cluster);
}

function clusterArticles(articles) {
  if (!Array.isArray(articles) || !articles.length) return [];
  const buckets = new Map();
  for (const art of articles) {
    const sig = articleSignature(art);
    if (!buckets.has(sig)) buckets.set(sig, createEmptyCluster(sig));
    const c = buckets.get(sig);
    if (c.articles.length<MAX_CLUSTER_SIZE) { c.articles.push(art); updateCentroid(c, art); }
  }
  mergeNearbyBuckets(buckets);
  const clusters = Array.from(buckets.values());
  for (const c of clusters) { c.score = clusterScore(c); enrichCluster(c); }
  clusters.sort((a,b)=>b.score-a.score);
  return clusters.map(c => ({
    id:c.id, signature:c.signature, keywords:c.keywords, score:c.score, size:c.articles.length,
    labels:c.labels, rating:c.rating,
    articles:c.articles,
    centroid:{
      titleTopKeywords: Array.from(c.centroid.titleTokens.entries()).sort((a,b)=>b[1]-a[1]).slice(0,SIGNATURE_TOPK).map(([k])=>k),
      publishedAtAvg: c.centroid.publishedAtAvg ? new Date(c.centroid.publishedAtAvg).toISOString() : null
    },
    createdAt:c.createdAt
  }));
}

/* =========================================
   더미 데이터 수집 (실서비스 시 API 연동)
   ========================================= */
async function fetchArticlesForSection(section) {
  const now = Date.now();
  const sample = [
    { title:"Apple unveils new AI features for iPhone", summary:"The company introduced on-device models boosting performance.", url:"https://www.reuters.com/technology/apple-ai-iphone", publishedAt:new Date(now-1*HOUR).toISOString() },
    { title:"애플, 아이폰용 신규 AI 기능 공개", summary:"온디바이스 모델로 성능 강화 발표.", url:"https://www.bbc.com/news/technology-apple-ai-kr", publishedAt:new Date(now-2*HOUR).toISOString() },
    { title:"Tesla expands self-driving beta in Europe", summary:"Regulatory approval unlocked for more countries.", url:"https://www.apnews.com/tesla-fsd-europe", publishedAt:new Date(now-5*HOUR).toISOString() },
    { title:"테슬라, 유럽 자율주행 베타 확대", summary:"규제 승인 확대로 더 많은 국가에서 운용.", url:"https://www.nytimes.com/2025/08/12/business/tesla-fsd-eu.html", publishedAt:new Date(now-3*HOUR).toISOString() },
    { title:"Japan launches new economic stimulus", summary:"Package targets inflation relief and tech investment.", url:"https://www.wsj.com/articles/japan-stimulus-2025", publishedAt:new Date(now-8*HOUR).toISOString() }
  ];
  if (section==="japan"||section==="jp") return sample.filter(a=>/japan|일본|도쿄/i.test(`${a.title} ${a.summary}`));
  if (section==="kr"||section==="korea") return sample.filter(a=>/애플|테슬라|한국|서울|코리아/i.test(`${a.title} ${a.summary}`));
  return sample; // world/기타
}

/* =========================================
   캐시/ETag
   ========================================= */
function generateETag(data) { return crypto.createHash("md5").update(JSON.stringify(data)).digest("hex"); }
function cacheControl(_req, res, next) { res.set("Cache-Control","public, max-age=60, stale-while-revalidate=300"); next(); }

/* =========================================
   /healthz
   ========================================= */
app.get("/healthz", (_req, res) => {
  res.json({
    status:"ok",
    env:NODE_ENV,
    uptime:process.uptime(),
    time:new Date().toISOString(),
    cache:{ policy:"public, max-age=60, stale-while-revalidate=300", etagEnabled:true },
    version:"1.0.0"
  });
});

/* =========================================
   /feed — 파라미터 옵션
   ========================================= */
app.get("/feed", cacheControl, async (req, res) => {
  try {
    const section = (req.query.section || "world").toString();
    const freshness = parseInt(req.query.freshness ?? "0", 10);
    const domainCap = parseInt(req.query.domain_cap ?? "0", 10);
    const lang = (req.query.lang || "").toString();

    // 1) 데이터 수집
    let items = await fetchArticlesForSection(section);

    // 2) freshness 필터
    if (Number.isFinite(freshness) && freshness > 0) {
      const minTs = NOW() - freshness*HOUR;
      items = items.filter(a => {
        const ts = a.publishedAt ? Date.parse(a.publishedAt) : NaN;
        return Number.isFinite(ts) ? ts >= minTs : true;
      });
    }

    // 3) domain_cap 적용
    if (Number.isFinite(domainCap) && domainCap > 0) {
      const perDomain = new Map();
      const capped = [];
      for (const a of items) {
        const d = getDomain(a.url);
        const c = perDomain.get(d) || 0;
        if (c < domainCap) { capped.push(a); perDomain.set(d, c+1); }
      }
      items = capped;
    }

    // 4) 클러스터링
    const clusters = clusterArticles(items);

    const payload = {
      section, freshness, domain_cap: domainCap, lang,
      count: items.length,
      clusters,
      generatedAt: new Date().toISOString()
    };

    // 5) ETag/304
    const etag = generateETag(payload);
    res.set("ETag", etag);
    if (req.headers["if-none-match"] === etag) return res.status(304).end();

    res.json(payload);
  } catch (e) {
    res.status(500).json({ error:"FEED_GENERATION_FAILED", detail:String(e?.message || e) });
  }
});

/* =========================================
   정적 파일 서빙 및 루트 경로
   ========================================= */
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* =========================================
   서버 실행
   ========================================= */
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`[FINAL 5-1] backend started on :${PORT}`));
}

/* =========================================
   모듈 내보내기
   ========================================= */
module.exports = {
  app,
  clusterArticles,
  extractKeywords,
  articleSignature,
  freshnessWeight,
  sourceWeight
};

/* =========================================
   QA 체크리스트 (백엔드)
   =========================================
   [API]
   - /healthz 200 응답, env/uptime/version 필드 표시 확인
   - /feed 파라미터 동작:
     * section: world/kr/japan 별 데이터 차이
     * freshness: freshness=1 → 1시간 이내 기사만
     * domain_cap: domain_cap=1 → 도메인별 1개 제한
     * lang: 전달만(추후 번역 파이프와 연계 가능)
   - ETag/If-None-Match:
     * 첫 호출 ETag 수신 → 두 번째 호출 If-None-Match로 304 검증
   [성능]
   - n=1000 기사 입력시 클러스터링 O(n log n) 수준
   [스키마]
   - clusters[].labels (string[])
   - clusters[].rating (0~5 number)
*/
