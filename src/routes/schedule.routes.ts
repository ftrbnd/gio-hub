import { Router } from 'express';
import { upload } from '@/config/upload';
import { parseSchedule } from '@/controllers/schedule.controller';
import { authenticate } from '@/middleware/auth';

const router = Router();

router.post(
	'/parse-schedule',
	authenticate,
	upload.single('image'),
	parseSchedule,
);

export default router;
