import { Router } from 'express';
import { getNewsFromGNews } from '../services/news.js';
import { cache } from '../middlewares/cache.js';

const r = Router();
r.get('/', cache(60), async (req, res, next) => {
  try {
    const q = {
      q: String(req.query.q || 'top'),
      lang: (req.query.lang as any) || 'en',
      pageSize: Number(req.query.pageSize || 20)
    };
    const data = await getNewsFromGNews(q);
    res.setHeader('ETag', `"v1-${Buffer.from(JSON.stringify(q)).toString('base64')}"`);
    res.json({ ok:true, ...data });
  } catch(e){ next(e); }
});
export default r;