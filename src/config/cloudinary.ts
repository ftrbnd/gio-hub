import { v2 as cloudinary } from 'cloudinary';

/**
 * Cloudinary Node SDK reads CLOUDINARY_URL automatically
 * (`cloudinary://API_KEY:API_SECRET@CLOUD_NAME`). Call this before any Admin /
 * Upload API work so a missing env fails with a clear error.
 */
export function ensureCloudinaryConfigured(): void {
	if (!process.env.CLOUDINARY_URL) {
		throw new Error('Missing required environment variable: CLOUDINARY_URL');
	}
	cloudinary.config({ secure: true });
}

export { cloudinary };
