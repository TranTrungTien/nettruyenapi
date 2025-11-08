import express from 'express';
import axios from 'axios';
import userAgent from 'random-useragent';
import { Comics, Status } from '../../utils/comic';

const router = express.Router();
const allStatus = ['all', 'completed', 'ongoing'];

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

// New Comics
router.get('/new-comics', async (req, res) => {
  const { query } = req;
  const status = query.status ? query.status : 'all';
  const page = query.page ? Number(query.page) : 1;
  if (!allStatus.includes(status as string)) throw Error('Invalid status');
  res.json(await Comics.getNewComics(status as Status, page));
});

// Recommend Comics
router.get('/recommend-comics', async (req, res) => {
  res.json(await Comics.getRecommendComics());
});

// Search
const searchApiPaths = [
  { path: '/search', callback: (q: string, page: number) => Comics.searchComics(q, page) },
];

searchApiPaths.forEach(({ path, callback }) => {
  router.get(path, async (req, res) => {
    const { query } = req;
    const q = query.q ? query.q : '';
    if (!q) throw Error('Invalid query');
    const page = query.page ? Number(query.page) : 1;
    res.send(await callback(q as string, page));
  });
});

// Page params
const pageParamsApiPaths = [
  { path: '/boy-comics', callback: (...params: any) => Comics.getBoyComics(...params) },
  { path: '/completed-comics', callback: (...params: any) => Comics.getCompletedComics(...params) },
  { path: '/girl-comics', callback: (...params: any) => Comics.getGirlComics(...params) },
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
  { path: '/comics/:slug/chapters', callback: (params: string) => Comics.getChapters(params) },
  { path: '/comics/:slug', callback: (params: string) => Comics.getComicDetail(params) },
  { path: '/comics/authors/:slug', callback: (params: string) => Comics.getComicsByAuthor(params) },
];

comicIdParamsApiPaths.forEach(({ path, callback }) => {
  router.get(path, async (req, res) => {
    const { params } = req;
    const slug = params.slug;
    if (!slug) throw Error('Invalid');
    res.json(await callback(slug));
  });
});

router.get('/comics/:slug/chapters/:chapter_id', async (req, res) => {
  const { params } = req;
  const slug = params.slug;
  const chapter_id = params.chapter_id ? Number(params.chapter_id) : null;
  if (!slug || !chapter_id) throw Error('Invalid');
  res.json(await Comics.getChapter(slug, chapter_id));
});

router.get('/comics/:slug/comments', async (req, res) => {
  const { params, query } = req;
  const slug = params.slug;
  const page = query.page ? Number(query.page) : 1;
  if (!slug) throw Error('Invalid Comic ID');
  res.json(await Comics.getComments(slug, page));
});

// Top Comics
const topComicsApiPaths = [
  { path: '/', callback: (...params: any) => Comics.getTopAllComics(...params) },
  { path: '/weekly', callback: (...params: any) => Comics.getTopWeeklyComics(...params) },
  { path: '/monthly', callback: (...params: any) => Comics.getTopMonthlyComics(...params) },
  { path: '/daily', callback: (...params: any) => Comics.getTopDailyComics(...params) },
  { path: '/chapter', callback: (...params: any) => Comics.getTopChapterComics(...params) },
  { path: '/follow', callback: (...params: any) => Comics.getTopFollowComics(...params) },
  { path: '/comment', callback: (...params: any) => Comics.getTopCommentComics(...params) },
];

topComicsApiPaths.forEach(({ path, callback }) => {
  router.get(`/top${path}`, async (req, res) => {
    const { query } = req;
    const status = query.status ? query.status : 'all';
    const page = query.page ? Number(query.page) : 1;
    res.json(await callback(status, page));
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