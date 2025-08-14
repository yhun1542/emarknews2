import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import news from './routes/news.js';
import { errorHandler } from './middlewares/error.js';

export const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('tiny'));

app.get('/health', (_req, res) => { res.json({ ok: true, service: 'backend', time: new Date().toISOString() }); });
app.use('/api/news', news);

app.use(errorHandler);

