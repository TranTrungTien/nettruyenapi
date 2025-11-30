
import express, { NextFunction, Request, Response } from 'express';
import axios from 'axios';
import userAgent from 'random-useragent';
import { Comics } from '../../utils/comic';

const router = express.Router();

// Wrapper for async routes to catch errors and pass them to the error handler
const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => 
    (req: Request, res: Response, next: NextFunction) => 
        Promise.resolve(fn(req, res, next)).catch(next);

// --- ROUTE DEFINITIONS ---

// Genres
router.get('/genres', asyncHandler(async (req, res) => {
  res.send(await Comics.getGenres());
}));

router.get('/genres/:slug', asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const page = req.query.page ? Number(req.query.page) : 1;
  res.send(await Comics.getComicsByGenre(slug, page));
}));

// Recommend Comics
router.get('/recommend-comics', asyncHandler(async (req, res) => {
  res.json(await Comics.getRecommendComics());
}));

// Search
router.get('/search', asyncHandler(async (req, res, next) => {
  const q = req.query.q as string;
  if (!q) {
    return next(new Error('Query parameter \'q\' is required'));
  }
  const page = req.query.page ? Number(req.query.page) : 1;
  res.json(await Comics.searchComics(q, page));
}));

// Page-parameterized routes
const pagedRoutes = [
  { path: '/completed-comics', method: Comics.getCompletedComics },
  { path: '/recent-update-comics', method: Comics.getRecentUpdateComics },
  { path: '/trending-comics', method: Comics.getTrendingComics },
];

pagedRoutes.forEach(({ path, method }) => {
  router.get(path, asyncHandler(async (req, res) => {
    const page = req.query.page ? Number(req.query.page) : 1;
    res.json(await method(page));
  }));
});

// Detail and chapter routes
router.get('/comics/:slug/chapters/:chapter_id', asyncHandler(async (req, res) => {
  const { slug, chapter_id } = req.params;
  res.json(await Comics.getChapterContent({ slug, id: chapter_id }));
}));

router.get('/comics/:slug/:chapter_page', asyncHandler(async (req, res) => {
  const { slug, chapter_page } = req.params;
  res.json(await Comics.getChapters({ slug, chapterPage: Number(chapter_page) }));
}));

router.get('/comics/:slug', asyncHandler(async (req, res) => {
  const { slug } = req.params;
  res.json(await Comics.getComicDetail({ slug }));
}));

// Image proxy
router.get('/images', asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const src = req.query.src as string;
  if (!src) {
    return next(new Error('Image source (src) is required'));
  }

  const response = await axios.get(src, {
    responseType: 'stream',
    headers: {
      referer: process.env.BASE_URL_V2,
      'User-Agent': userAgent.getRandom(),
    },
  });

  response.data.pipe(res);
}));

export default router;
