import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import news from './routes/news.js';
import { errorHandler } from './middlewares/error.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('tiny'));

// Next.js 정적 파일 서빙
app.use('/_next', express.static(path.join(__dirname, '../../../frontend/.next')));
app.use(express.static(path.join(__dirname, '../../../frontend/public')));

// API 라우트
app.get('/health', (_req, res) => { res.json({ ok: true, service: 'backend', time: new Date().toISOString() }); });
app.use('/api/news', news);

// 모든 경로를 Next.js 빌드된 HTML로 서빙
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../../../frontend/.next/server/app/index.html'));
});

app.use(errorHandler);

