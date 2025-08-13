/**
 * EmarkNews — 뉴스 알고리즘 최적화 백엔드 (FINAL COMBINED VERSION)
 * 병합: backend_final_merged.js의 고도화된 클러스터링 + backend_AI_enhanced.js의 AI 요약/후편집/translate 엔드포인트.
 * 주요 장점 통합: 정교한 클러스터링, AI 강화 번역/요약, 안정적 수집, 프론트 서빙.
 * 추가: sum_limit 지원 (프론트 필터 연동)
 */

"use strict";

const express = require("express");
const crypto = require("crypto");
const axios = require("axios");
const cors = require("cors");
const path = require("path");
const cheerio = require("cheerio");
const fs = require("fs");

// SDKs
const NewsAPI = require("newsapi");
const { TwitterApi } = require("twitter-api-v2");
const { TranslationServiceClient } = require("@google-cloud/translate").v3;

const app = express();

/* =========================================
   환경 변수 (Railway에서 설정 필요)
   ========================================= */
const {
  PORT = 3000,
  NEWS_API_KEYS = "",         
  TWITTER_BEARER_TOKEN = "",  
  GOOGLE_PROJECT_ID = "",     
  GOOGLE_APPLICATION_CREDENTIALS = "", // JSON content as string
  CURRENCY_API_KEY = "",      
  ORIGIN_WHITELIST = "",
  NODE_ENV = "development",
  GENERATIVE_AI_API_KEY = "", // For OpenAI/Gemini/Claude etc.
  GENERATIVE_AI_ENDPOINT = "" // e.g., https://api.openai.com/v1/chat/completions
} = process.env;

/* =========================================
   CORS 및 미들웨어 설정
   ========================================= */
const whitelist = ORIGIN_WHITELIST ? ORIGIN_WHITELIST.split(',') : [];
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin && (NODE_ENV !== 'production' || !whitelist.length)) return callback(null, true);
    if (whitelist.indexOf(origin) !== -1) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  },
  methods: "GET,HEAD,POST",
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json());

/* =========================================
   API 클라이언트 초기화
   ========================================= */
let newsapi, twitterClient, translateClient;

try {
    if (NEWS_API_KEYS) {
        newsapi = new NewsAPI(NEWS_API_KEYS.split(",")[0]);
    } else {
        console.warn("NEWS_API_KEYS not set. News fetching will be limited.");
    }

    if (TWITTER_BEARER_TOKEN) {
        twitterClient = new TwitterApi(TWITTER_BEARER_TOKEN);
    } else {
        console.warn("TWITTER_BEARER_TOKEN not set. X (Twitter) fetching will be disabled.");
    }

    if (GOOGLE_PROJECT_ID && GOOGLE_APPLICATION_CREDENTIALS) {
        const credPath = "/tmp/google-credentials.json";
        fs.writeFileSync(credPath, GOOGLE_APPLICATION_CREDENTIALS);
        process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;
        translateClient = new TranslationServiceClient();
    } else {
        console.warn("Google Cloud authentication not configured. Translation will be disabled.");
    }

    if (!GENERATIVE_AI_API_KEY) {
        console.warn("GENERATIVE_AI_API_KEY not set. AI summarization and post-edit will be disabled.");
    }

} catch (e) {
    console.error("Error initializing API clients:", e);
}

/* =========================================
   상수/유틸 (통합: AI 버전 카테고리 확장 + 기본 불용어/소스 품질)
   ========================================= */
const NOW = () => Date.now();
const HOUR = 3600 * 1000;
const TIME_DECAY_TAU_HOURS = 72;
const SIGNATURE_TOPK = 12;
const MAX_CLUSTER_SIZE = 100;

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
  "bloomberg.com": 1.08,
  "nikkei.com": 1.05
};

const LABEL_RULES = {
  politics: [/election|senate|parliament|white\s*house|의회|총선|대선|정당|의장|외교|국방/i],
  economy:  [/inflation|gdp|interest|bond|market|고용|물가|성장률|경제|수출|환율/i],
  tech:     [/ai|artificial\s*intelligence|chip|semiconductor|iphone|android|google|apple|samsung|테크|반도체|클라우드/i],
  business: [/merger|acquisition|earnings|ipo|startup|buyback|기업|실적|인수|합병|상장|스타트업/i],
  world:    [/united\s*nations|eu|nato|중동|우크라이나|이스라엘|국제|세계/i],
  sport:    [/world\s*cup|olympic|league|match|경기|리그|올림픽|월드컵/i],
  entertainment: [/film|movie|box\s*office|drama|idol|k-pop|배우|영화|드라마|음원|아이돌/i],
  japan:    [/japan|tokyo|osaka|yen|kishida|일본|도쿄|오사카|엔화|기시다/i],
  korea:    [/korea|seoul|won|한국|서울|부산|대한민국|원화/i]
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
  const wF = fSum / cluster.articles.length;
  const wS = (sSum / cluster.articles.length) / 1.15;
  const sizeBoost = Math.log(1 + cluster.articles.length) / Math.log(1 + MAX_CLUSTER_SIZE);
  const raw = Math.max(0, Math.min(1, 0.50*wF + 0.35*wS + 0.15*sizeBoost));
  return +(raw * 5).toFixed(2);
}

/* =========================================
   클러스터링 (기본 버전의 고도화된 로직 통합)
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
    for (let j=i+1;j<=Math.min(i+5, sigs.length-1);j++) {
      const b = sigs[j]; if (!buckets.has(b)) continue;
      const bSet = sigToSet.get(b);
      const inter = intersectionSize(aSet,bSet);
      const minSize = Math.min(aSet.size,bSet.size);
      if (inter >= Math.ceil(minSize*0.6)) {
        const A=buckets.get(a), B=buckets.get(b);
        const into = (A.score>=B.score) ? A : B;
        const from = (into===A) ? B : A;
        for (const art of from.articles) {
          if (into.articles.length>=MAX_CLUSTER_SIZE) break;
          into.articles.push(art);
          updateCentroid(into, art);
        }
        into.score = clusterScore(into);
        buckets.delete(from.signature);
      }
    }
  }
  return buckets;
}

function clusterArticles(articles) {
  const buckets = new Map();
  for (const a of articles) {
    const sig = articleSignature(a);
    if (!buckets.has(sig)) buckets.set(sig, createEmptyCluster(sig));
    const cluster = buckets.get(sig);
    cluster.articles.push(a);
    updateCentroid(cluster, a);
    cluster.score = clusterScore(cluster);
    cluster.labels = detectLabelsForText([a.title, a.summary].join(" "), 2);
  }

  const mergedBuckets = mergeNearbyBuckets(buckets);

  const clusters = Array.from(mergedBuckets.values())
    .map(c => ({...c, rating: computeRating(c)}))
    .sort((a,b) => b.score - a.score);

  return clusters;
}

/* =========================================
   기사 수집 (기본 버전의 세밀 params + AI 버전 pageSize 절충=50)
   ========================================= */
async function fetchArticlesForSection(section, freshness) {
  let articles = [];
  const fromDate = freshness > 0 ? new Date(NOW() - freshness * HOUR).toISOString() : undefined;

  try {
      if (section === "x") {
          if (!twitterClient) return [];
          const query = "(news OR breaking OR update OR headlines) lang:en -is:retweet";
          const { data } = await twitterClient.v2.search(query, {
              "tweet.fields": ["text", "created_at", "author_id", "public_metrics"],
              max_results: 50,
              sort_order: "recency"
          });
          if (data && data.data) {
            articles = data.data.map((tweet) => ({
                title: tweet.text.slice(0, 150),
                summary: tweet.text,
                content: tweet.text,
                url: `https://x.com/i/web/status/${tweet.id}`,
                publishedAt: tweet.created_at,
                source: "X (Twitter)"
            }));
          }
      } else {
          if (!newsapi) return getDummyData(section);
          const params = {
              language: "en",
              pageSize: 50,
          };
          switch (section) {
              case "world":
                  params.category = "general";
                  break;
              case "kr":
              case "domestic":
                  params.q = "Korea OR Seoul OR Samsung OR Hyundai";
                  break;
              case "japan":
                  params.country = "jp";
                  params.language = "jp";
                  break;
              case "business":
                  params.category = "business";
                  break;
              case "tech":
                  params.category = "technology";
                  break;
              default:
                  params.category = "general";
          }
          const response = await newsapi.v2.topHeadlines(params);
          if (response.status === 'ok' && response.articles) {
            articles = response.articles.map((a) => ({
                title: a.title,
                summary: a.description,
                content: a.content,
                url: a.url,
                publishedAt: a.publishedAt,
                source: a.source ? a.source.name : null
            }));
          }
      }
  } catch (error) {
      console.error(`Error fetching articles for section ${section}:`, error.message || error);
      if (NODE_ENV === 'development' && articles.length === 0) {
        return getDummyData(section);
      }
      return [];
  }
  return articles;
}

// 더미 데이터 (개발용)
function getDummyData(section) {
    const now = Date.now();
    const sample = [
        { title:"[DUMMY] Apple unveils new AI features for iPhone", summary:"The company introduced on-device models boosting performance.", url:"https://www.reuters.com/technology/apple-ai-iphone", publishedAt:new Date(now-1*HOUR).toISOString(), source: "Reuters" },
        { title:"[DUMMY] 애플, 아이폰용 신규 AI 기능 공개 (번역됨)", summary:"온디바이스 모델로 성능 강화 발표.", url:"https://www.bbc.com/news/technology-apple-ai-kr", publishedAt:new Date(now-2*HOUR).toISOString(), source: "BBC" },
        { title:"[DUMMY] Tesla expands self-driving beta in Europe", summary:"Regulatory approval unlocked for more countries.", url:"https://www.apnews.com/tesla-fsd-europe", publishedAt:new Date(now-5*HOUR).toISOString(), source: "AP News" },
        { title:"[DUMMY] Japan launches new economic stimulus targeting inflation", summary:"Package focuses on relief and tech investment.", url:"https://www.nikkei.com/articles/japan-stimulus-2025", publishedAt:new Date(now-8*HOUR).toISOString(), source: "Nikkei" },
        { title:"[DUMMY] X (Twitter) experiences brief outage globally", summary:"Users reported issues accessing the platform.", url:"https://x.com/status/12345", publishedAt:new Date(now-30*60000).toISOString(), source: "X" }
    ];
    if (section==="japan") return sample.filter(a=>/japan|일본|도쿄/i.test(`${a.title} ${a.summary}`));
    if (section==="kr") return sample.filter(a=>/애플|테슬라|한국|서울|코리아/i.test(`${a.title} ${a.summary}`));
    if (section==="x") return sample.filter(a=>a.source==="X");
    return sample;
}

/* =========================================
   AI-Enhanced Functions (AI 버전 통합)
   ========================================= */

// Web Scraping for Article Content
async function fetchArticleContent(url) {
  try {
    const { data } = await axios.get(url, { timeout: 5000 });
    const $ = cheerio.load(data);
    let content = '';
    $('article p, .article-body p, .story-body p, .content p, p').each((i, el) => {
      content += $(el).text().trim() + ' ';
    });
    return content.trim() || '';
  } catch (e) {
    console.error('Scraping failed for', url, ':', e.message);
    return '';
  }
}

// Generative AI Summary (sum_limit 추가: max_tokens로 사용)
async function generateAiSummary(content, lang = 'en', sumLimit = 200) {
  if (!content || !GENERATIVE_AI_API_KEY || !GENERATIVE_AI_ENDPOINT) return 'AI summary not available';
  const isKo = lang === 'ko';
  const prompt = `Summarize this article in 3-5 sentences${isKo ? ' in Korean' : ''}: ${content.slice(0, 4000)}`; // Length limit
  try {
    const response = await axios.post(GENERATIVE_AI_ENDPOINT, {
      model: 'gpt-4o-mini', // Or other model
      messages: [
        { role: 'system', content: 'You are a helpful news summarizer.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.5,
      max_tokens: parseInt(sumLimit) || 200 // sum_limit 적용, 기본 200
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GENERATIVE_AI_API_KEY}`
      }
    });
    return response.data.choices[0].message.content.trim();
  } catch (e) {
    console.error('AI summary failed:', e.message);
    return 'Failed to generate summary';
  }
}

// Enhanced Category Classification (AI 버전 통합, 확장 키워드)
function classifyCategoryByEnglishSource(text) {
  const textLower = text.toLowerCase();
  const financeKeywords = ['stock', 'market', 'trading', 'investment', 'financial', 'economy', 'economic', 'bank', 'banking', 'currency', 'dollar', 'price', 'profit', 'revenue', 'earnings', 'nasdaq', 'dow', 'sp500', 'fed', 'interest rate', 'inflation', 'gdp'];
  const techKeywords = ['technology', 'tech', 'ai', 'artificial intelligence', 'machine learning', 'software', 'hardware', 'computer', 'digital', 'internet', 'cyber', 'data', 'algorithm', 'programming', 'startup', 'innovation', 'app', 'platform'];
  const politicsKeywords = ['politics', 'political', 'government', 'president', 'congress', 'senate', 'election', 'vote', 'policy', 'law', 'legislation', 'democrat', 'republican', 'administration', 'minister', 'parliament'];
  const healthKeywords = ['health', 'medical', 'medicine', 'hospital', 'doctor', 'patient', 'disease', 'virus', 'vaccine', 'treatment', 'drug', 'pharmaceutical', 'clinical', 'study'];
  const sportsKeywords = ['sports', 'sport', 'game', 'team', 'player', 'match', 'championship', 'league', 'football', 'basketball', 'baseball', 'soccer', 'tennis', 'golf', 'olympics'];
  const counts = {
    finance: financeKeywords.reduce((sum, kw) => sum + (textLower.includes(kw) ? 1 : 0), 0),
    technology: techKeywords.reduce((sum, kw) => sum + (textLower.includes(kw) ? 1 : 0), 0),
    politics: politicsKeywords.reduce((sum, kw) => sum + (textLower.includes(kw) ? 1 : 0), 0),
    health: healthKeywords.reduce((sum, kw) => sum + (textLower.includes(kw) ? 1 : 0), 0),
    sports: sportsKeywords.reduce((sum, kw) => sum + (textLower.includes(kw) ? 1 : 0), 0)
  };
  const maxCategory = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
  return counts[maxCategory] > 0 ? maxCategory : 'general';
}

// Quality Score for Korean Translation
function qualityScoreForKo(translatedText, originalText) {
  if (!originalText || !translatedText) return 1.0;
  let score = 1.0;
  const lengthRatio = translatedText.length / originalText.length;
  if (lengthRatio < 0.5 || lengthRatio > 3.0) score -= 0.2;
  const englishWords = translatedText.match(/\b[A-Za-z]+\b/g) || [];
  const commonEnglishWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
  const untranslatedCount = englishWords.filter(word => !commonEnglishWords.includes(word.toLowerCase())).length;
  if (untranslatedCount > 0) score -= 0.1 * untranslatedCount;
  const awkwardPatterns = [/이다\s+이다/, /을\s+을/, /의\s+의/, /\s+\s+/];
  for (const pattern of awkwardPatterns) {
    if (pattern.test(translatedText)) score -= 0.1;
  }
  if (!/[다요니까]\.?$/.test(translatedText.trim())) score -= 0.1;
  const sourceNumbers = originalText.match(/\d+/g) || [];
  const translatedNumbers = translatedText.match(/\d+/g) || [];
  if (sourceNumbers.length !== translatedNumbers.length) score -= 0.2;
  return Math.max(0.0, Math.min(1.0, score));
}

// Need Post-Edit?
function needPostEdit(qualityScore, category) {
  const thresholds = {
    finance: 0.8, technology: 0.7, politics: 0.8,
    health: 0.8, sports: 0.6, general: 0.7
  };
  return qualityScore < (thresholds[category] || 0.7);
}

// AI Post-Edit for Korean Translation
async function postEditKoWithLlm(sourceText, googleKo) {
  if (!GENERATIVE_AI_API_KEY || !GENERATIVE_AI_ENDPOINT) return googleKo;
  const prompt = `당신은 전문 한국어 뉴스 편집자입니다. 원문(Source)과 기계 번역(Google Translate)을 비교하여, 기계 번역본을 더 자연스럽고 정확한 한국어 뉴스 기사체로 수정해주세요. 원문의 의미, 뉘앙스, 모든 수치(날짜, 금액 등)는 반드시 보존해야 합니다. '~다'로 끝나는 간결한 문체를 사용하세요.

Source: ${sourceText}
Google Translate: ${googleKo}

수정된 번역:`;
  try {
    const response = await axios.post(GENERATIVE_AI_ENDPOINT, {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 1500
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GENERATIVE_AI_API_KEY}`
      }
    });
    return response.data.choices[0].message.content.trim() || googleKo;
  } catch (e) {
    console.error('Post-edit failed:', e.message);
    return googleKo;
  }
}

/* =========================================
   번역 함수 (AI 버전의 강화 로직 통합)
   ========================================= */
async function translateText(text, targetLang) {
  if (!text || !translateClient || targetLang === 'en') return text;
  const parent = `projects/${GOOGLE_PROJECT_ID}/locations/global`;
  const request = {
    parent,
    contents: [text],
    mimeType: 'text/plain',
    sourceLanguageCode: 'en', // Assume source is en
    targetLanguageCode: targetLang
  };
  try {
    const [response] = await translateClient.translateText(request);
    return response.translations[0].translatedText;
  } catch (error) {
    console.error("Translation API error:", error.details || error.message);
    return text;
  }
}

async function translateArticles(articles, targetLang) {
  if (!targetLang || targetLang === 'en' || !translateClient) {
    return articles;
  }

  const translatedArticles = await Promise.all(articles.map(async (article) => {
    try {
      const originalTitle = article.title;
      const originalSummary = article.summary;
      article.title = await translateText(originalTitle, targetLang);
      article.summary = await translateText(originalSummary, targetLang);

      // AI Post-Edit Logic (for ko only)
      if (targetLang === 'ko') {
        const titleCategory = classifyCategoryByEnglishSource(originalTitle);
        const titleScore = qualityScoreForKo(article.title, originalTitle);
        if (needPostEdit(titleScore, titleCategory)) {
          article.title = await postEditKoWithLlm(originalTitle, article.title);
        }

        const summaryCategory = classifyCategoryByEnglishSource(originalSummary);
        const summaryScore = qualityScoreForKo(article.summary, originalSummary);
        if (needPostEdit(summaryScore, summaryCategory)) {
          article.summary = await postEditKoWithLlm(originalSummary, article.summary);
        }
      }
    } catch (e) {
      console.error(`Failed to translate article: ${article.url}`, e);
      article.title = article.title || '';
      article.summary = article.summary || '';
    }
    return article;
  }));

  return translatedArticles;
}

/* =========================================
   캐시/ETag (공통)
   ========================================= */
function generateETag(data) { return crypto.createHash("md5").update(JSON.stringify(data)).digest("hex"); }
function cacheControl(_req, res, next) {
    res.set("Cache-Control","public, max-age=300, stale-while-revalidate=600");
    next();
}

/* =========================================
   /currency (공통)
   ========================================= */
let currencyCache = null;
let currencyCacheTime = 0;
const CURRENCY_CACHE_DURATION = 60 * 60 * 1000;

app.get("/currency", async (_req, res) => {
    if (currencyCache && (NOW() - currencyCacheTime < CURRENCY_CACHE_DURATION)) {
        return res.json(currencyCache);
    }

    if (!CURRENCY_API_KEY) {
        return res.json({ usd_krw: null, jpy_krw: null, error: "CURRENCY_API_KEY_NOT_SET" });
    }

    try {
        const { data } = await axios.get(`http://api.exchangeratesapi.io/v1/latest?access_key=${CURRENCY_API_KEY}&symbols=USD,JPY,KRW`);
        if (!data.success || !data.rates) throw new Error("Invalid response");
        const rates = data.rates;
        const usd_krw = rates.KRW / rates.USD;
        const jpy_krw = (rates.KRW / rates.JPY) * 100;
        const payload = { usd_krw, jpy_krw };
        currencyCache = payload;
        currencyCacheTime = NOW();
        res.json(payload);
    } catch (e) {
        console.error("Currency fetch failed:", e.message || e);
        res.status(500).json({ error: "CURRENCY_FETCH_FAILED", detail: String(e?.message || e) });
    }
});

/* =========================================
   /healthz (공통)
   ========================================= */
app.get("/healthz", (_req, res) => {
  res.json({
    status:"ok",
    env:NODE_ENV,
    uptime:process.uptime(),
    time:new Date().toISOString(),
    cache:{ policy:"public, max-age=300, stale-while-revalidate=600", etagEnabled:true },
    version:"2.0.0-final-combined"
  });
});

/* =========================================
   /feed — 핵심 파이프라인 (AI 요약 + 고도화 클러스터링 통합, sum_limit 추가)
   ========================================= */
app.get("/feed", cacheControl, async (req, res) => {
  try {
    const section = (req.query.section || "world").toString();
    const freshness = parseInt(req.query.freshness ?? "72", 10);
    const domainCap = parseInt(req.query.domain_cap ?? "5", 10);
    const lang = (req.query.lang || "ko").toString();
    const sumLimit = parseInt(req.query.sum_limit ?? "200", 10); // sum_limit 추가 (기본 200)

    // 1) 데이터 수집
    let items = await fetchArticlesForSection(section, freshness);

    // 2) AI 요약 (병렬, sumLimit 전달)
    const contents = await Promise.all(items.map(item => fetchArticleContent(item.url)));
    const summaries = await Promise.all(contents.map((content, i) => generateAiSummary(content, lang, sumLimit)));
    items.forEach((item, i) => {
      if (summaries[i] && summaries[i] !== 'Failed to generate summary') item.summary = summaries[i];
    });

    // 3) 필터링 (Domain Cap)
    if (Number.isFinite(domainCap) && domainCap > 0 && items.length > 0) {
      const perDomain = new Map();
      const capped = [];
      for (const a of items) {
        const d = getDomain(a.url);
        const c = perDomain.get(d) || 0;
        if (c < domainCap) { capped.push(a); perDomain.set(d, c+1); }
      }
      items = capped;
    }

    // 4) 번역 (with AI post-edit)
    items = await translateArticles(items, lang);

    // 5) 클러스터링 (고도화 버전)
    const clusters = clusterArticles(items);

    const payload = {
      section, freshness, domain_cap: domainCap, lang, sum_limit: sumLimit, // payload에 sum_limit 추가 (디버깅용)
      count: items.length,
      clusters,
      generatedAt: new Date().toISOString()
    };

    const etag = generateETag(payload);
    res.set("ETag", etag);
    if (req.headers["if-none-match"] === etag) return res.status(304).end();

    res.json(payload);
  } catch (e) {
    console.error("Feed generation failed:", e);
    res.status(500).json({ error:"FEED_GENERATION_FAILED", detail:String(e?.message || e) });
  }
});

/* =========================================
   /translate (AI 버전 통합, 프론트 지원)
   ========================================= */
app.post("/translate", async (req, res) => {
  const { articles, target_lang = "ko", options = {} } = req.body;
  if (!articles || !Array.isArray(articles)) return res.status(400).json({ error: "Invalid articles array" });

  try {
    let translatedArticles = articles.map(a => ({ ...a, translatedTitle: a.title, translatedSummary: a.summary }));
    if (target_lang === "ko") {
      translatedArticles = await translateArticles(translatedArticles, "ko");

      const postEditEnabled = options.postEdit || false;
      const peStrategy = options.peStrategy || "auto";

      for (let article of translatedArticles) {
        let doPe = postEditEnabled && (peStrategy === "always");
        if (postEditEnabled && peStrategy === "auto") {
          const srcHead = `${article.title} ${article.summary}`;
          const category = classifyCategoryByEnglishSource(srcHead);
          const score = Math.min(
            qualityScoreForKo(article.title, article.title), // Assuming original is en
            qualityScoreForKo(article.summary, article.summary)
          );
          doPe = needPostEdit(score, category);
          article.qualityScore = score;
          article.category = category;
        }
        if (doPe) {
          article.translatedTitle = await postEditKoWithLlm(article.title, article.translatedTitle || article.title);
          article.translatedSummary = await postEditKoWithLlm(article.summary, article.translatedSummary || article.summary);
        }
      }
    }
    res.json(translatedArticles);
  } catch (e) {
    console.error("Translation failed:", e);
    res.status(500).json({ error: "TRANSLATION_FAILED", detail: String(e.message || e) });
  }
});

/* =========================================
   프론트엔드 파일 서빙 (공통)
   ========================================= */
app.get("/", (req, res) => {
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; font-src 'self' https://cdn.jsdelivr.net;");
    res.sendFile(path.join(__dirname, "frontend_final_merged.html"));
});

/* =========================================
   서버 실행
   ========================================= */
if (require.main === module) {
  app.listen(PORT, () => console.log(`[FINAL COMBINED] EmarkNews backend started on :${PORT} (ENV: ${NODE_ENV})`));
}

module.exports = { app };