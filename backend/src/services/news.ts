import { httpGet } from '../lib/fetcher.js';
import type { Article, NewsQuery, NewsResponse } from '../types/news.js';

const GNEWS_API = 'https://gnews.io/api/v4/search';

function mapGNews(json: any): NewsResponse {
  const articles: Article[] = (json.articles || []).map((a: any) => ({
    id: a.url,
    title: a.title,
    summary: a.description,
    url: a.url,
    source: a.source?.name ?? 'GNews',
    publishedAt: a.publishedAt,
    language: a.language
  }));
  return { articles, nextPage: null };
}

export async function getNewsFromGNews(q: NewsQuery): Promise<NewsResponse> {
  const key = process.env.GNEWS_API_KEY!;
  const url = new URL(GNEWS_API);
  url.searchParams.set('q', q.q || 'top');
  url.searchParams.set('lang', q.lang || 'en');
  url.searchParams.set('max', String(q.pageSize ?? 20));
  url.searchParams.set('apikey', key);

  const res = await httpGet(url.toString());
  const json = await res.json();
  return mapGNews(json);
}