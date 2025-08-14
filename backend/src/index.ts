import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 4000;

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'backend', time: new Date().toISOString() });
});

// sample API
app.get('/api/v1/sample', (_req, res) => {
  res.json({ articles: [], note: 'Connect your real data source here.' });
});

app.listen(port, () => {
  console.log(`Backend running on http://localhost:${port}`);
});
