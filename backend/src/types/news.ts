export type Provider = 'gnews';
export interface Article {
  id: string;
  title: string;
  summary?: string;
  url: string;
  source: string;
  publishedAt: string; // ISO
  language?: string;
}
export interface NewsQuery {
  q?: string;
  lang?: 'en'|'ko'|'ja';
  page?: number;
  pageSize?: number;
}
export interface NewsResponse {
  articles: Article[];
  nextPage?: number | null;
}