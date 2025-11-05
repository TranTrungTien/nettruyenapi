import express, { Express } from 'express';
import cors from 'cors'; // 👈 cần import cors
import comicsRouter from './api/routes/comics';
import comicRouter from './api/routes/comic';
import chapterRouter from './api/routes/chapter';
import genresRouter from './api/routes/genres';
import v2Router from './api/v2';
const app: Express = express();

/* 🧩 Thêm middleware CORS ngay đầu tiên */
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

/* ⚙️ Xử lý JSON body */
app.use(express.json());

/* 🛠️ Các route */
app.use('/api/comics', comicsRouter);
app.use('/api/comic', comicRouter);
app.use('/api/comic', chapterRouter); // /comic/:slug/chapter/:chapterNumber
app.use('/api/genres', genresRouter);
app.use('/api/v2', v2Router);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// const port = process.env.PORT || 8080;
// app.listen(port, () => {
//   console.log(`Server is running on http://localhost:${port}`);
// });

export default app;