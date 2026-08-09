import { Router } from 'express';
import { callback, loginRedirect, sync } from '@/controllers/spotify.controller';
import { authenticateCron } from '@/middleware/auth';

const router = Router();

router.get('/spotify/login', loginRedirect);
router.get('/spotify/callback', callback);
router.post('/spotify/sync', authenticateCron, sync);

export default router;
