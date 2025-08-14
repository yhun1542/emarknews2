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

// 정적 파일 서빙 (프론트엔드)
app.use(express.static(path.join(__dirname, '../../../frontend/.next/static')));
app.use(express.static(path.join(__dirname, '../../../frontend/public')));

// API 라우트
app.get('/health', (_req, res) => { res.json({ ok: true, service: 'backend', time: new Date().toISOString() }); });
app.use('/api/news', news);

// 루트 라우트 - 간단한 HTML 응답
app.get('/', (_req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>EmarkNews</title>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
    </head>
    <body>
      <h1>EmarkNews API Server</h1>
      <p>Backend is running successfully!</p>
      <ul>
        <li><a href="/health">Health Check</a></li>
        <li><a href="/api/news?q=top&lang=en">News API Test</a></li>
      </ul>
    </body>
    </html>
  `);
});

app.use(errorHandler);

