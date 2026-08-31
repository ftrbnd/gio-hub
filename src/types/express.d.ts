declare global {
	namespace Express {
		interface Request {
			requestId: string;
			adminEmail?: string;
		}
	}
}

export {};
