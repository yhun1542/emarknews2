import NewsCard from './NewsCard';
import { Article } from '../types/news';
export default function NewsList({items}:{items:Article[]}) {
  if(!items?.length) return <div style={{opacity:.7}}>표시할 뉴스가 없습니다.</div>;
  return (
    <div
      style={{display:'grid', gap:16, gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))'}}
    >
      {items.map(a => <NewsCard key={a.id} a={a} />)}
    </div>
  );
}