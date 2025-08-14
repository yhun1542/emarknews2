import dotenv from 'dotenv';
import { app } from './app.js';

dotenv.config();

const port = process.env.PORT ? Number(process.env.PORT) : 4000;

app.get('/healthz', (_req, res) => { res.json({ ok: true, status: 'ready' }); });

app.listen(port, () => { console.log(`Backend running on http://localhost:${port}`); });