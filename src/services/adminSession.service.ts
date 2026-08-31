import { createHmac, timingSafeEqual } from 'node:crypto';
import { CookieOptions, Request, Response } from 'express';
import { requireEnv } from '@/lib/env';

export const ADMIN_SESSION_COOKIE = 'gio_admin_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

export type AdminSession = {
	email: string;
	exp: number;
};

function signingSecret(): string | null {
	return process.env.SESSION_SECRET?.trim() || null;
}

function sign(payload: string, secret: string): string {
	return createHmac('sha256', secret).update(payload).digest('base64url');
}

function cookieOptions(): CookieOptions {
	const secure =
		process.env.NODE_ENV === 'production' ||
		(process.env.GOOGLE_REDIRECT_URI ?? '').startsWith('https://');
	return {
		httpOnly: true,
		sameSite: 'lax',
		secure,
		path: '/',
		maxAge: SESSION_TTL_MS,
	};
}

export function createSessionToken(email: string): string {
	const secret = requireEnv('SESSION_SECRET');
	const session: AdminSession = {
		email: email.trim().toLowerCase(),
		exp: Date.now() + SESSION_TTL_MS,
	};
	const payload = Buffer.from(JSON.stringify(session), 'utf8').toString('base64url');
	return `${payload}.${sign(payload, secret)}`;
}

export function parseSessionToken(token: string): AdminSession | null {
	const secret = signingSecret();
	if (!secret) return null;

	const [payload, signature] = token.split('.');
	if (!payload || !signature) return null;

	const expected = sign(payload, secret);
	const sigBuf = Buffer.from(signature);
	const expBuf = Buffer.from(expected);
	if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
		return null;
	}

	try {
		const session = JSON.parse(
			Buffer.from(payload, 'base64url').toString('utf8'),
		) as AdminSession;
		if (typeof session.email !== 'string' || typeof session.exp !== 'number') {
			return null;
		}
		if (session.exp < Date.now()) return null;
		return session;
	} catch {
		return null;
	}
}

export function readSession(req: Request): AdminSession | null {
	const raw = req.cookies?.[ADMIN_SESSION_COOKIE];
	if (typeof raw !== 'string' || !raw) return null;
	return parseSessionToken(raw);
}

export function setSessionCookie(res: Response, email: string): void {
	res.cookie(ADMIN_SESSION_COOKIE, createSessionToken(email), cookieOptions());
}

export function clearSessionCookie(res: Response): void {
	res.clearCookie(ADMIN_SESSION_COOKIE, {
		httpOnly: true,
		sameSite: 'lax',
		secure: cookieOptions().secure,
		path: '/',
	});
}
