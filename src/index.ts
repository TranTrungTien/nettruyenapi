import express, { Express } from 'express';
import comicsRouter from './api/routes/comics';
import comicRouter from './api/routes/comic';
import chapterRouter from './api/routes/chapter';
import genresRouter from './api/routes/genres';

const app: Express = express();

app.use('/api/comics', comicsRouter);
app.use('/api/comic', comicRouter);
app.use('/api/comic', chapterRouter); // /comic/:slug/chapter/:chapterNumber
app.use('/api/genres', genresRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

export default app;