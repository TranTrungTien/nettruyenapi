import app from '../dist/index';
// @ts-ignore
import { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  app(req, res);
}
