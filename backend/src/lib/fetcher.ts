import fetch, { RequestInit, Response } from 'node-fetch';

export async function httpGet(
  url: string,
  init: RequestInit = {},
  { timeoutMs = 5000, retries = 2, backoffBaseMs = 500 } = {}
): Promise<Response> {
  let lastErr: any;
  for (let i = 0; i <= retries; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      clearTimeout(t);
      if (res.ok) return res;
      if ([429, 500, 502, 503, 504].includes(res.status)) {
        await new Promise(r => setTimeout(r, backoffBaseMs * Math.pow(2, i)));
        continue;
      }
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, backoffBaseMs * Math.pow(2, i)));
      continue;
    }
  }
  throw lastErr;
}