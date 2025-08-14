'use client';
import { useState } from 'react';
export default function Toolbar({onSearch}:{onSearch:(q:string,lang:string)=>void}){
  const [q,setQ] = useState('top'); const [lang,setLang] = useState('en');
  return (
    <div style={{display:'flex', gap:8, marginBottom:16}}>
      <input style={{border:'1px solid #e5e7eb', padding:'8px 12px', borderRadius:8}} value={q} onChange={e=>setQ(e.target.value)} placeholder="검색어" />
      <select style={{border:'1px solid #e5e7eb', padding:'8px 12px', borderRadius:8}} value={lang} onChange={e=>setLang(e.target.value)}>
        <option value="en">영어</option><option value="ko">한국어</option><option value="ja">일본어</option>
      </select>
      <button style={{padding:'8px 14px', borderRadius:8, background:'#111', color:'#fff'}} onClick={()=>onSearch(q,lang)}>검색</button>
    </div>
  );
}