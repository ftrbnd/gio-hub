import { Router, json } from 'express';
import * as adminController from '@/controllers/admin.controller';
import * as adminFilmController from '@/controllers/adminFilm.controller';
import { requireAdminSession } from '@/middleware/adminAuth';

const router = Router();

router.get('/auth/google', adminController.googleLogin);
router.get('/auth/google/callback', adminController.googleCallback);

router.get('/api/me', adminController.me);
router.post('/api/logout', adminController.logout);

router.get('/api/status', requireAdminSession, adminController.status);
router.post(
	'/api/spotify/sync',
	requireAdminSession,
	adminController.syncSpotify,
);
router.get(
	'/api/spotify/connect',
	requireAdminSession,
	adminController.connectSpotify,
);
router.get(
	'/api/ticktick/connect',
	requireAdminSession,
	adminController.connectTickTick,
);
router.patch(
	'/api/ticktick/reminder',
	json(),
	requireAdminSession,
	adminController.setReminder,
);
router.get(
	'/api/ticktick/projects',
	requireAdminSession,
	adminController.listProjects,
);
router.post(
	'/api/discord/test',
	requireAdminSession,
	adminController.testDiscord,
);
router.get(
	'/api/calendar/connect',
	requireAdminSession,
	adminController.connectCalendar,
);
router.get(
	'/api/calendar/calendars',
	requireAdminSession,
	adminController.listCalendars,
);
router.get('/api/time-off/events', requireAdminSession, adminController.listTimeOffEvents);
router.patch(
	'/api/time-off/events/:eventId',
	json(),
	requireAdminSession,
	adminController.markTimeOffCompleted,
);
router.post('/api/time-off/sync', requireAdminSession, adminController.syncTimeOff);

router.get(
	'/api/film/folders',
	requireAdminSession,
	adminFilmController.listFolders,
);
router.get(
	'/api/film/photos',
	requireAdminSession,
	adminFilmController.listPhotos,
);
router.post(
	'/api/film/photos/rotate',
	json(),
	requireAdminSession,
	adminFilmController.rotatePhoto,
);

router.get(
	'/api/film/sessions',
	requireAdminSession,
	adminFilmController.listSessions,
);
router.post(
	'/api/film/sessions',
	json(),
	requireAdminSession,
	adminFilmController.createSession,
);
router.get(
	'/api/film/sessions/:id',
	requireAdminSession,
	adminFilmController.getSession,
);
router.post(
	'/api/film/sessions/:id/nav',
	json(),
	requireAdminSession,
	adminFilmController.navigateSession,
);
router.post(
	'/api/film/sessions/:id/rotate',
	json(),
	requireAdminSession,
	adminFilmController.rotateSession,
);

// Old /admin prefix → root (bookmarks / stale links).
router.get('/admin', (_req, res) => res.redirect(301, '/'));
router.get('/admin/', (_req, res) => res.redirect(301, '/'));
router.get('/admin/photos', (_req, res) => res.redirect(301, '/photos'));
router.use('/admin/auth', (req, res) => {
	res.redirect(301, `/auth${req.url === '/' ? '' : req.url}`);
});
router.use('/admin/api', (req, res) => {
	res.redirect(308, `/api${req.url === '/' ? '' : req.url}`);
});

export default router;
