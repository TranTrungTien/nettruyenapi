import { Router } from 'express';
import axios from 'axios';
import rateLimit from 'express-rate-limit';
import { Genre, DaoCategory, DaoTeam } from '../types';
import crypto from 'crypto';
import { BASE_URL, HEADERS } from '../../constants';
import { generateToken } from '../../utils';

const router = Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
router.use(limiter);

router.get('/', async (req, res) => {
  try {
    let url = `${BASE_URL}/categories`;
    let response = await axios.get(url, {
      headers: { ...HEADERS, 'Request-Token': generateToken() }
    });
    let genres: Genre[] = response.data.map((item: DaoCategory) => ({
      id: item.id.toString(),
      name: item.categoryName,
      description: item.url || ''
    }));

    res.json(genres);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch genres', details: error.message });
  }
});

export default router;