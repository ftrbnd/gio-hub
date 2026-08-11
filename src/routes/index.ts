import { Router } from 'express';
import healthRoutes from './health.routes';
import scheduleRoutes from './schedule.routes';
import spotifyRoutes from './spotify.routes';
import ticktickRoutes from './ticktick.routes';

const router = Router();

router.use(healthRoutes);
router.use(scheduleRoutes);
router.use(spotifyRoutes);
router.use(ticktickRoutes);

export default router;
