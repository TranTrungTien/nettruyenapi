import { Router } from 'express';
import axios from 'axios';
import rateLimit from 'express-rate-limit';
import { ComicList, Comic, DaoStory } from '../types';

const router = Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
router.use(limiter);

const BASE_URL = 'https://daotruyen.me/api/public';
const HEADERS = {
  'Accept': '*/*',
  'Accept-Language': 'vi,en-US;q=0.9,en;q=0.8',
  'Connection': 'keep-alive',
  'Referer': 'https://daotruyen.me/',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
  'sec-ch-ua': '"Chromium";v="140", "Not=A?Brand";v="24", "Microsoft Edge";v="140"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"'
};

router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const type = (req.query.type as string) || 'all';
    let url = '';
    let params: any = {};

    switch (type) {
      case 'random':
        url = `${BASE_URL}/random-stories`;
        params = { size: 12 };
        break;
      case 'recommend':
        url = `${BASE_URL}/recommend-stories`;
        break;
      case 'top':
        url = `${BASE_URL}/top-view-stories`;
        params = { size: 6 };
        break;
      case 'weekly':
        url = `${BASE_URL}/v2/wsv`;
        params = { d: new Date().toISOString().split('T')[0], s: 6 };
        break;
      case 'monthly':
        url = `${BASE_URL}/v2/msv`;
        params = { d: new Date().toISOString().split('T')[0], s: 6 };
        break;
      default:
        url = `${BASE_URL}/stories`;
        params = { pageNo: page - 1, pageSize: 20 };
    }

    const response = await axios.get(url, { headers: HEADERS, params });
    const data = response.data;

    let comics: Comic[] = [];
    let total_pages = 1;
    let current_page = page;

    if (type === 'all') {
      comics = data.content.map((item: any) => ({
        id: item.slug,
        title: item.story.name,
        thumbnail: `https://daotruyen.me${item.imageSrc}`,
        description: item.story.description,
        authors: item.story.authorName || item.teamName,
        status: item.story.state === 1 ? 'Ongoing' : 'Completed',
        total_views: item.storyTotalView.toString(),
        followers: '0',
        is_trending: false,
        short_description: item.descriptions?.join('\n') || '',
        updated_at: item.story.updatedAt,
        last_chapter: null,
        chapters: [],
        genres: item.categories.map((cat: any) => ({ id: cat.id.toString(), name: cat.categoryName, description: '' }))
      }));
      total_pages = data.totalPages;
      current_page = data.number + 1;
    } else if (type === 'random') {
      comics = data.map((item: any) => ({
        id: item.url,
        title: item.name,
        thumbnail: `https://daotruyen.me${item.image}`,
        authors: item.teamName,
        total_views: item.totalView.toString(),
        followers: item.following?.toString() || '0',
        updated_at: item.lastChapterUpdatedAt,
        last_chapter: item.lastChapterNumber ? { id: item.lastChapterNumber.toString(), name: `Chương ${item.lastChapterNumber}` } : null,
        description: '',
        status: '',
        is_trending: false,
        short_description: '',
        chapters: [],
        genres: []
      }));
    } else if (type === 'recommend') {
      comics = data.map((item: any) => ({
        id: item.url,
        title: item.name,
        thumbnail: `https://daotruyen.me${item.src}`,
        description: '',
        authors: '',
        status: '',
        total_views: '0',
        followers: '0',
        is_trending: true,
        short_description: '',
        updated_at: '',
        last_chapter: null,
        chapters: [],
        genres: []
      }));
    } else {
      comics = data.map((item: any) => ({
        id: item.url,
        title: item.name,
        thumbnail: `https://daotruyen.me${item.image}`,
        authors: item.teamName,
        total_views: item.totalView.toString(),
        followers: '0',
        is_trending: true,
        description: '',
        status: '',
        short_description: '',
        updated_at: '',
        last_chapter: null,
        chapters: [],
        genres: []
      }));
    }

    const result: ComicList = { comics, current_page, total_pages };
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch comics', details: error.message });
  }
});

export default router;