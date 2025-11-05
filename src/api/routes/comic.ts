import { Router } from 'express';
import axios from 'axios';
import rateLimit from 'express-rate-limit';
import { Comic, DaoChapter, DaoCategory } from '../types';
import { BASE_URL, HEADERS } from '../../constants';
import { generateToken } from '../../utils';

const router = Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
router.use(limiter);

router.get('/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const url = `${BASE_URL}/v2/${slug}`;
    const response = await axios.get(url, { headers: { ...HEADERS, 'Request-Token': generateToken() } });
    const data = response.data;

    const comic: Comic = {
      id: data.story.url,
      title: data.story.name,
      thumbnail: `https://daotruyen.me${data.story.image}`,
      description: data.story.description,
      authors: data.story.authorName || data.translate.teamName,
      status: data.story.state === 1 ? 'Ongoing' : 'Completed',
      total_views: data.story.totalView.toString(),
      followers: '0',
      is_trending: false,
      short_description: data.story.description.split('\n').slice(0, 3).join('\n'),
      updated_at: data.story.updatedAt,
      last_chapter: data.chapters[0] ? { id: data.chapters[0].chapterNumber.toString(), name: data.chapters[0].title } : null,
      chapters: data.chapters.map((chap: DaoChapter) => ({
        id: chap.chapterNumber.toString(),
        name: chap.title
      })),
      genres: data.categories.map((cat: DaoCategory) => ({
        id: cat.id.toString(),
        name: cat.categoryName,
        description: ''
      }))
    };

    res.json(comic);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch comic', details: error.message });
  }
});

export default router;