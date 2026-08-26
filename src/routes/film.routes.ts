import { Router, json } from 'express';
import { orientFolder } from '@/controllers/film.controller';
import { authenticate } from '@/middleware/auth';

const router = Router();

router.post('/film/orient', json(), authenticate, orientFolder);

export default router;
