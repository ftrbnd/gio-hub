import { Router } from 'express';
import {
	callback,
	calendars,
	loginRedirect,
	timeOffSync,
} from '@/controllers/calendar.controller';
import { authenticateCron, authenticateQuerySecret } from '@/middleware/auth';

const router = Router();

router.get('/calendar/login', authenticateQuerySecret, loginRedirect);
router.get('/calendar/callback', callback);
router.get('/calendar/calendars', authenticateQuerySecret, calendars);
router.post('/calendar/time-off-sync', authenticateCron, timeOffSync);

export default router;
