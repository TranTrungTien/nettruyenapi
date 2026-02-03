import dotenv from 'dotenv';
const envFile = process.env.NODE_ENV === 'development' ? '.env.development' : '.env';
dotenv.config({ path: envFile });

import express, { Express } from 'express';
import cors from 'cors';
import apiRouter from './api/v1';
import v2Router from './api/v2';
import v3Router from './api/v3';

const app: Express = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

app.use('/api/v1', apiRouter);
app.use('/api/v3', v2Router);
app.use('/api/v2', v3Router);

app.get('/', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// const PORT = process.env.PORT || 8080;
// app.listen(Number(PORT), '0.0.0.0', () => {
//   console.log(`Server running on port ${PORT}`);
// });

export default app;
