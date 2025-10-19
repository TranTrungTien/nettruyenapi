import { Router } from 'express';
import axios from 'axios';
import rateLimit from 'express-rate-limit';
import { Genre, DaoCategory, DaoTeam } from '../types';

const router = Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
router.use(limiter);

const BASE_URL = 'https://daotruyen.me/api/public';
const HEADERS = { /* same as above */ };

router.get('/', async (req, res) => {
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

export default router;