import { requireEnv } from '@/lib/env';
import {
	createAndStoreOAuthState as createOAuthState,
	verifyAndConsumeOAuthState as verifyOAuthState,
} from '@/services/oauthState.service';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const SCOPES = 'openid email profile';

export function createAndStoreOAuthState(): Promise<string> {
	return createOAuthState('google-admin');
}

export function verifyAndConsumeOAuthState(state: string): Promise<boolean> {
	return verifyOAuthState('google-admin', state);
}

export function buildAuthorizeUrl(state: string): string {
	const params = new URLSearchParams({
		client_id: requireEnv('GOOGLE_CLIENT_ID'),
		redirect_uri: requireEnv('GOOGLE_REDIRECT_URI'),
		response_type: 'code',
		scope: SCOPES,
		state,
		access_type: 'online',
		prompt: 'select_account',
	});
	return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForAccessToken(code: string): Promise<string> {
	const res = await fetch(GOOGLE_TOKEN_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			code,
			client_id: requireEnv('GOOGLE_CLIENT_ID'),
			client_secret: requireEnv('GOOGLE_CLIENT_SECRET'),
			redirect_uri: requireEnv('GOOGLE_REDIRECT_URI'),
			grant_type: 'authorization_code',
		}),
	});
	if (!res.ok) {
		throw new Error(`Google token request failed: ${res.status} ${await res.text()}`);
	}
	const json = (await res.json()) as { access_token?: string };
	if (!json.access_token) {
		throw new Error('Google token response missing access_token');
	}
	return json.access_token;
}

export async function fetchUserEmail(accessToken: string): Promise<string> {
	const res = await fetch(GOOGLE_USERINFO_URL, {
		headers: { Authorization: `Bearer ${accessToken}` },
	});
	if (!res.ok) {
		throw new Error(`Google userinfo request failed: ${res.status} ${await res.text()}`);
	}
	const json = (await res.json()) as { email?: string; email_verified?: boolean };
	if (!json.email) {
		throw new Error('Google userinfo missing email');
	}
	if (json.email_verified === false) {
		throw new Error('Google email is not verified');
	}
	return json.email;
}

export function isAllowedAdminEmail(email: string): boolean {
	const allowed = process.env.ADMIN_GOOGLE_EMAIL;
	if (!allowed) return false;
	return email.trim().toLowerCase() === allowed.trim().toLowerCase();
}
