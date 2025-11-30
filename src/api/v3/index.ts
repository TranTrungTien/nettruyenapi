
import express, { NextFunction, Request, Response } from 'express';
import axios from 'axios';
import userAgent from 'random-useragent';
import { SSStory } from '../../utils/ssStory';

const router = express.Router();

// Wrapper for async routes to catch errors and pass them to the error handler
const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => 
    (req: Request, res: Response, next: NextFunction) => 
        Promise.resolve(fn(req, res, next)).catch(next);

// --- ROUTE DEFINITIONS ---

// Genres
router.get('/genres', asyncHandler(async (req, res) => {
  res.send(await SSStory.getGenres());
}));

router.get('/genres/:slug', asyncHandler(async (req, res) => {
  const { params, query } = req;
  const page = query.page ? Number(query.page) : 1;
  res.send(await SSStory.getStoryByGenre(params.slug, page));
}));

// Recommend story
router.get('/recommend-story', asyncHandler(async (req, res) => {
  res.json(await SSStory.getRecommendStory());
}));

// Search
router.get('/search', asyncHandler(async (req, res, next) => {
  const { query } = req;
  const q = query.q as string;
  if (!q) {
    // Instead of throwing, we pass an error to the next middleware
    return next(new Error('Invalid query: q is required'));
  }
  const page = query.page ? Number(query.page) : 1;
  res.json(await SSStory.searchStory(q, page));
}));

// Page-parameterized API paths
const pageParamsApiPaths = [
  { path: '/completed-story', callback: (page: number) => SSStory.getCompletedStory(page) },
  { path: '/recent-update-story', callback: () => SSStory.getRecentUpdateStory() }, // Does not take a page param, but fits the pattern
  { path: '/trending-story', callback: (page: number) => SSStory.getTrendingStory(page) },
];

pageParamsApiPaths.forEach(({ path, callback }) => {
  router.get(path, asyncHandler(async (req, res) => {
    const page = req.query.page ? Number(req.query.page) : 1;
    // The callback is called with the page parameter, ensuring consistency
    res.json(await (callback as any)(page));
  }));
});

// Story and Chapter specific API paths
const storyApiPaths = [
  { 
    path: '/story/:slug/chapters/:chapter_id', 
    callback: (params: any) => SSStory.getChapterContent({ slug: params.slug, id: params.chapter_id })
  },
  { 
    path: '/story/:slug/:chapter_page', 
    callback: (params: any) => SSStory.getChapters({ slug: params.slug, chapterPage: params.chapter_page })
  },
  { 
    path: '/story/:slug', 
    callback: (params: any) => SSStory.getStoryDetail({ slug: params.slug })
  },
];

storyApiPaths.forEach(({ path, callback }) => {
  router.get(path, asyncHandler(async (req, res, next) => {
    const { slug } = req.params;
    if (!slug) {
        return next(new Error('Invalid parameters: slug is required'));
    }
    res.json(await callback(req.params));
  }));
});

// Image proxy
router.get('/images', asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const src = req.query.src as string;
    if (!src) {
        return next(new Error('Image source (src) is required'));
    }

    const response = await axios.get(src, {
        responseType: 'stream',
        headers: {
            referer: process.env.BASE_URL, // Use the correct referer
            'User-Agent': userAgent.getRandom(),
        },
    });

    response.data.pipe(res);
}));

export default router;
