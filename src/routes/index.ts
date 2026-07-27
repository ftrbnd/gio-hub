import { Router } from 'express';
import healthRoutes from './health.routes';
import scheduleRoutes from './schedule.routes';

const router = Router();

router.use(healthRoutes);
router.use(scheduleRoutes);

export default router;
