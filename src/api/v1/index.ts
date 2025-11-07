import { Router } from 'express';
import axios from 'axios';
import rateLimit from 'express-rate-limit';
import { Comic, ComicList, ContentChapter, Chapter, Genre, DaoStory, DaoChapter, DaoCategory, DaoTeam } from '../types';

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

router.get('/genres', async (req, res) => {
  try {
    let url = `${BASE_URL}/categories`;
    let response = await axios.get(url, { headers: HEADERS });
    let genres: Genre[] = response.data.map((item: DaoCategory) => ({
      id: item.id.toString(),
      name: item.categoryName,
      description: ''
    }));

    if (genres.length === 0 || genres[0].name === '') {
      url = `${BASE_URL}/teams?size=999999`;
      response = await axios.get(url, { headers: HEADERS });
      genres = response.data.map((item: DaoTeam) => ({
        id: item.id.toString(),
        name: item.teamName,
        description: ''
      }));
    }

    res.json(genres);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch genres', details: error.message });
  }
});

router.get('/recommend-comics', async (req, res) => {
  try {
    const url = `${BASE_URL}/recommend-stories`;
    const response = await axios.get(url, { headers: HEADERS });
    const data = response.data; // Data is an array

    const comics: Comic[] = data.map((item: any) => ({
      id: item.url,
      title: item.name,
      thumbnail: `https://daotruyen.me${item.src}`,
      is_trending: true,
    }));

    const result: ComicList = {
      comics,
      total_pages: 1, // This API does not support pagination
      current_page: 1,
    };
    res.json(result);
  } catch (error: any) {
    console.error('API Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch recommend comics', details: error.message });
  }
});

router.get('/trending-comics', async (req, res) => {
  try {
    const url = `${BASE_URL}/top-view-stories`;
    const params = { size: 6 };
    const response = await axios.get(url, { headers: HEADERS, params });
    const data = response.data; // Data is an array

    const comics: Comic[] = data.map((item: any) => ({
      id: item.url,
      title: item.name,
      thumbnail: `https://daotruyen.me${item.image}`,
      authors: item.teamName,
      total_views: item.totalView.toString(),
      is_trending: true,
    }));

    const result: ComicList = {
      comics,
      total_pages: 1, // This API does not support pagination
      current_page: 1,
    };
    res.json(result);
  } catch (error: any) {
    console.error('API Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch trending comics', details: error.message });
  }
});

router.get('/top/:type', async (req, res) => {
  try {
    const { type } = req.params;
    let url = '';
    let params: any = {};
    const d = new Date().toISOString().split('T')[0];

    switch (type) {
      case 'weekly':
        url = `${BASE_URL}/v2/wsv`;
        params = { d, s: 6 };
        break;
      case 'monthly':
        url = `${BASE_URL}/v2/msv`;
        params = { d, s: 6 };
        break;
      default:
        return res.status(400).json({ error: 'Invalid top type specified' });
    }

    const response = await axios.get(url, { headers: HEADERS, params });
    const data = response.data; // Data is an array

    const comics: Comic[] = data.map((item: any) => ({
      id: item.url,
      title: item.name,
      thumbnail: `https://daotruyen.me${item.image}`,
      authors: item.teamName,
      total_views: item.totalView.toString(),
      is_trending: true,
    }));
    
    const result: ComicList = {
      comics,
      total_pages: 1, // This API does not support pagination
      current_page: 1,
    };
    res.json(result);
  } catch (error: any) {
    console.error('API Error:', error.message);
    res.status(500).json({ error: `Failed to fetch top ${req.params.type} comics`, details: error.message });
  }
});


router.get('/comics', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const url = `${BASE_URL}/stories`;
    const params = { pageNo: page - 1, pageSize: 20 };
    const response = await axios.get(url, { headers: HEADERS, params });
    const data = response.data; // Data is an object with pagination

    const comics: Comic[] = data.content.map((item: any) => ({
      id: item.slug,
      title: item.story.name,
      thumbnail: `https://daotruyen.me${item.imageSrc}`,
      description: item.story.description,
      authors: item.story.authorName || item.teamName,
      status: item.story.state === 1 ? 'Ongoing' : 'Completed',
      total_views: item.storyTotalView.toString(),
      followers: '0',
      short_description: item.descriptions?.join('\n') || '',
      updated_at: item.story.updatedAt,
      genres: item.categories.map((cat: any) => ({
        id: cat.id.toString(),
        name: cat.categoryName,
      }))
    }));

    const result: ComicList = {
      comics,
      total_pages: data.totalPages,      // Use totalPages from response
      current_page: data.number + 1,       // Use number from response
    };
    res.json(result);
  } catch (error: any) {
    console.error('API Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch comics', details: error.message });
  }
});


router.get('/comics/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const url = `${BASE_URL}/v2/${slug}`;
    const response = await axios.get(url, { headers: HEADERS });
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

router.get('/comics/:slug/chapters/:chapter_id', async (req, res) => {
  try {
    const { slug, chapter_id } = req.params;
    const url = `${BASE_URL}/v2/${slug}/${chapter_id}`;
    const response = await axios.get(url, {
      headers: { ...HEADERS, 'Request-Token': '38c35cb62625475812102025112044' }
    });
    const data = response.data;

    const result: ContentChapter = {
      chapter_name: data.chapter.title,
      comic_name: data.story.name,
      chapters: data.chapters.map((chap: DaoChapter) => ({
        id: chap.chapterNumber.toString(),
        name: chap.title
      })),
      images: [],
      content: data.chapter.paragraph
    };

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch chapter', details: error.message });
  }
});

router.get('/images', async (req: any, res: any) => {
  try {
    const { src } = req.query;
    const response = await axios.get(src, {
      responseType: 'stream',
      headers: HEADERS,
    });
    response.data.pipe(res);
  } catch (err) {
    throw err;
  }
});

export default router;
