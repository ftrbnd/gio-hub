import { NextFunction, Request, Response } from 'express';
import * as adminSession from '@/services/adminSession.service';

export function requireAdminSession(req: Request, res: Response, next: NextFunction) {
	const session = adminSession.readSession(req);
	if (!session) {
		return res.status(401).json({ error: 'Unauthorized' });
	}
	req.adminEmail = session.email;
	next();
}
