import express from 'express';
import axios from 'axios';
import userAgent from 'random-useragent';
import { Comics, Status } from '../../utils/comic';

const router = express.Router();

// Genres
router.get('/genres', async (req, res) => {
  res.send(await Comics.getGenres());
});

router.get('/genres/:slug', async (req, res) => {
  const { params, query } = req;
  const slug = params.slug;
  const page = query.page ? Number(query.page) : 1;
  res.send(await Comics.getComicsByGenre(slug, page));
});

// Recommend Comics
router.get('/recommend-comics', async (req, res) => {
  res.json(await Comics.getRecommendComics());
});

// Search
router.get('/search', async (req, res) => {
  const { query } = req;
  const q = query.q ? query.q : '';
  if (!q) throw Error('Invalid query');
  const page = query.page ? Number(query.page) : 1;
  res.json(await Comics.searchComics(q as string, page));
});

// Page params
const pageParamsApiPaths = [
  { path: '/completed-comics', callback: (...params: any) => Comics.getCompletedComics(...params) },
  { path: '/recent-update-comics', callback: (...params: any) => Comics.getRecentUpdateComics(...params) },
  { path: '/trending-comics', callback: (...params: any) => Comics.getTrendingComics(...params) },
];

pageParamsApiPaths.forEach(({ path, callback }) => {
  router.get(path, async (req, res) => {
    const { query } = req;
    const page = query.page ? Number(query.page) : 1;
    res.json(await callback(page));
  });
});

// Comics
const comicIdParamsApiPaths = [
  { path: '/comics/:slug/chapters/:chapter_id', callback: (paramaters: { slug: string, id: string }) => Comics.getChapterContent(paramaters) },
  { path: '/comics/:slug/:chapter_page', callback: (paramaters: { slug: string, id?: string }) => Comics.getChapters(paramaters) },
  { path: '/comics/:slug', callback: (paramaters: { slug: string, id?: string }) => Comics.getComicDetail(paramaters) },
];

comicIdParamsApiPaths.forEach(({ path, callback }) => {
  router.get(path, async (req, res) => {
    const { params } = req;
    const slug = params.slug;
    const id = params.chapter_id;
    const chapterPage = params.chapter_page;
    const paramaters = { slug, id, chapterPage };    
    if (!slug) throw Error('Invalid');
    res.json(await callback(paramaters));
    return;
  });
});

router.get('/images', async (req: any, res: any) => {
  try {
    const { src } = req.query;
    const response = await axios.get(src, {
      responseType: 'stream',
      headers: {
        referer: 'https://truyenfull.vn',
        'User-Agent': userAgent.getRandom(),
      },
    });
    response.data.pipe(res);
  } catch (err) {
    throw err;
  }
});

export default router;