import { Article } from '../types/news';
export default function NewsCard({a}:{a:Article}) {
  return (
    <article style={{padding:16, border:'1px solid #e5e7eb', borderRadius:12}}>
      <h3 style={{fontWeight:600}}>{a.title}</h3>
      {a.summary && <p style={{fontSize:14, opacity:.8}}>{a.summary}</p>}
      <div style={{fontSize:12, marginTop:8, opacity:.8}}>
        {a.source} · {new Date(a.publishedAt).toLocaleString()}
      </div>
      <a href={a.url} target="_blank" rel="noreferrer" style={{color:'#2563eb', textDecoration:'underline', fontSize:14, display:'inline-block', marginTop:8}}>원문보기</a>
    </article>
  );
}