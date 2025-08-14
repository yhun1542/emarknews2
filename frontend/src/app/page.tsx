'use client';
import { useEffect, useState } from 'react';
import Toolbar from '../components/Toolbar';
import NewsList from '../components/NewsList';
import type { Article } from '../types/news';
import { fetchNews } from '../lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

export default function Page(){
  const [items,setItems] = useState<Article[]>([]);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState<string|undefined>();
  const [status, setStatus] = useState<any>(null);

  async function load(q='top', lang='en'){
    setLoading(true); setError(undefined);
    try { const data = await fetchNews(q, lang); setItems(data.articles); }
    catch(e:any){ setError(e.message || '로드 실패'); }
    finally{ setLoading(false); }
  }

  useEffect(() => {
    fetch(`${API_BASE}/health`).then(r=>r.json()).then(setStatus).catch(()=>setStatus({ok:false}));
    load();
  }, []);

  return (
    <main style={{padding:24, maxWidth: '960px', margin: '0 auto'}}>
      <h1 style={{fontWeight:'bold', fontSize: 24, marginBottom: 12}}>EmarkNews</h1>
      <div style={{marginBottom: 12}}>Backend: <code>{API_BASE}</code></div>

      <Toolbar onSearch={load} />

      <section style={{marginTop:16}}>
        <h2>Health</h2>
        <pre>{JSON.stringify(status, null, 2)}</pre>
      </section>

      {loading && <div>불러오는 중…</div>}
      {error && <div style={{color: 'red'}}>오류: {error}</div>}
      {!loading && !error && <NewsList items={items} />}
    </main>
  );
}