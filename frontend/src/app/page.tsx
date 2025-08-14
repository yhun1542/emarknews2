'use client';
import { useEffect, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

export default function Home() {
  const [status, setStatus] = useState<any>(null);
  const [sample, setSample] = useState<any>(null);

  useEffect(() => {
    fetch(`${API_BASE}/health`).then(r=>r.json()).then(setStatus).catch(()=>setStatus({ok:false}));
    fetch(`${API_BASE}/api/v1/sample`).then(r=>r.json()).then(setSample).catch(()=>setSample({}));
  }, []);

  return (
    <main style={{padding:24}}>
      <h1>Fullstack Scaffold</h1>
      <p>Backend: <code>{API_BASE}</code></p>
      <section style={{marginTop:16}}>
        <h2>Health</h2>
        <pre>{JSON.stringify(status, null, 2)}</pre>
      </section>
      <section style={{marginTop:16}}>
        <h2>Sample API</h2>
        <pre>{JSON.stringify(sample, null, 2)}</pre>
      </section>
    </main>
  );
}
