import { Router } from 'express';
import { callback, loginRedirect, sync } from '@/controllers/spotify.controller';
import { authenticateCron, authenticateQuerySecret } from '@/middleware/auth';

const router = Router();

router.get('/spotify/login', authenticateQuerySecret, loginRedirect);
router.get('/spotify/callback', callback);
router.post('/spotify/sync', authenticateCron, sync);

export default router;
