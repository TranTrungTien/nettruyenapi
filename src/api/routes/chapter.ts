import { Router } from 'express';
import axios from 'axios';
import rateLimit from 'express-rate-limit';
import { ContentChapter, DaoChapter } from '../types';
import { BASE_URL, HEADERS } from '../../constants';
import { generateToken } from '../../utils';

const router = Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
router.use(limiter);


router.get('/:slug/chapter/:chapterNumber', async (req, res) => {
  try {
    const { slug, chapterNumber } = req.params;
    const url = `${BASE_URL}/v2/${slug}/${chapterNumber}`;
    const response = await axios.get(url, { 
      headers:  { ...HEADERS, 'Request-Token': generateToken() }
    });
    const data = response.data;

    const result: ContentChapter = {
      chapter_name: data.chapter.title,
      comic_name: data.story.name,
      chapters: data.chapters.map((chap: DaoChapter) => ({
        id: chap.chapterNumber.toString(),
        name: chap.title
      })),
      images: [], // Truyện chữ
      content: data.chapter.paragraph
    };

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch chapter', details: error.message });
  }
});

export default router;