import { Router } from 'express';
import axios from 'axios';
import rateLimit from 'express-rate-limit';
import { ContentChapter, DaoChapter } from '../types';

const router = Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
router.use(limiter);

const BASE_URL = 'https://daotruyen.me/api/public';
const HEADERS = { /* same as above */ };

router.get('/:slug/chapter/:chapterNumber', async (req, res) => {
  try {
    const { slug, chapterNumber } = req.params;
    const url = `${BASE_URL}/v2/${slug}/${chapterNumber}`;
    const response = await axios.get(url, { 
      headers: { ...HEADERS, 'Request-Token': '38c35cb62625475812102025112044' } // Update nếu cần
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