import type { NewsResponse } from '../types/news';
const BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

export async function fetchNews(q:string, lang='en'):Promise<NewsResponse>{
  const u = new URL('/api/news', BASE);
  u.searchParams.set('q', q); u.searchParams.set('lang', lang);
  const res = await fetch(u.toString(), { cache: 'no-store' });
  if(!res.ok) throw new Error('API Error');
  return res.json();
}