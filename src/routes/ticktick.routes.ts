import { Router } from 'express';
import { callback, loginRedirect, projects } from '@/controllers/ticktick.controller';
import { authenticateQuerySecret } from '@/middleware/auth';

const router = Router();

router.get('/ticktick/login', authenticateQuerySecret, loginRedirect);
router.get('/ticktick/callback', callback);
router.get('/ticktick/projects', authenticateQuerySecret, projects);

export default router;
