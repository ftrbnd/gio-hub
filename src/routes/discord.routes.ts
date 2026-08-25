import { verifyKeyMiddleware } from 'discord-interactions';
import { NextFunction, Request, Response, Router } from 'express';
import { interactions, sendTestMessage } from '@/controllers/discord.controller';
import { authenticate } from '@/middleware/auth';

const router = Router();

// Verifies Discord's Ed25519 request signature. Reads the public key at
// request time (not at import time) so the server still boots if
// DISCORD_PUBLIC_KEY isn't set yet.
function verifyDiscordSignature(req: Request, res: Response, next: NextFunction) {
	const publicKey = process.env.DISCORD_PUBLIC_KEY;
	if (!publicKey) {
		console.error(`[${req.requestId}] server missing DISCORD_PUBLIC_KEY configuration`);
		return res.status(500).json({ error: 'Server missing DISCORD_PUBLIC_KEY configuration' });
	}
	return verifyKeyMiddleware(publicKey)(req, res, next);
}

router.post('/discord/test', authenticate, sendTestMessage);
router.post('/discord/interactions', verifyDiscordSignature, interactions);

export default router;
