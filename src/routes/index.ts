import { Router } from 'express';
import adminRoutes from './admin.routes';
import discordRoutes from './discord.routes';
import filmRoutes from './film.routes';
import healthRoutes from './health.routes';
import scheduleRoutes from './schedule.routes';
import spotifyRoutes from './spotify.routes';
import ticktickRoutes from './ticktick.routes';

const router = Router();

router.use(adminRoutes);
router.use(discordRoutes);
router.use(filmRoutes);
router.use(healthRoutes);
router.use(scheduleRoutes);
router.use(spotifyRoutes);
router.use(ticktickRoutes);

export default router;
