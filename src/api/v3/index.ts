import express from 'express';
import axios from 'axios';
import userAgent from 'random-useragent';
import { SSStory } from '../../utils/ssStory';

const router = express.Router();

// Genres
router.get('/genres', async (req, res) => {
  res.send(await SSStory.getGenres());
});

router.get('/genres/:slug', async (req, res) => {
  const { params, query } = req;
  const slug = params.slug;
  const page = query.page ? Number(query.page) : 1;
  res.send(await SSStory.getStoryByGenre(slug, page));
});

// Recommend story
router.get('/recommend-story', async (req, res) => {
  res.json(await SSStory.getRecommendStory());
});

// Search
router.get('/search', async (req, res) => {
  const { query } = req;
  const q = query.q ? query.q : '';
  if (!q) throw Error('Invalid query');
  const page = query.page ? Number(query.page) : 1;
  res.json(await SSStory.searchStory(q as string, page));
});

// Page params
const pageParamsApiPaths = [
  { path: '/completed-story', callback: (...params: any) => SSStory.getCompletedStory(...params) },
  { path: '/recent-update-story', callback: (...params: any) => SSStory.getRecentUpdateStory(...params) },
  { path: '/trending-story', callback: (...params: any) => SSStory.getTrendingStory(...params) },
];

pageParamsApiPaths.forEach(({ path, callback }) => {
  router.get(path, async (req, res) => {
    const { query } = req;
    const page = query.page ? Number(query.page) : 1;
    res.json(await callback(page));
  });
});

// story
const comicIdParamsApiPaths = [
  { path: '/story/:slug/chapters/:chapter_id', callback: (paramaters: { slug: string, id: string }) => SSStory.getChapterContent(paramaters) },
  { path: '/story/:slug/:chapter_page', callback: (paramaters: { slug: string, id?: string }) => SSStory.getChapters(paramaters) },
  { path: '/story/:slug', callback: (paramaters: { slug: string, id?: string }) => SSStory.getStoryDetail(paramaters) },
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
        referer: process.env.BASE_URL,
        'User-Agent': userAgent.getRandom(),
      },
    });
    response.data.pipe(res);
  } catch (err) {
    throw err;
  }
});

export default router;