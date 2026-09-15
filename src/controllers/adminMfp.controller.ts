import { Request, Response } from 'express';
import {
	MfpCredentialsBodySchema,
	MfpJobInputBodySchema,
	MfpWorkerJobPatchSchema,
} from '@/models/mfp.model';
import * as mfpService from '@/services/mfp.service';

function paramId(req: Request): string {
	const id = req.params.id;
	return Array.isArray(id) ? id[0] : id;
}

export async function sessionStatus(req: Request, res: Response) {
	try {
		const status = await mfpService.getSessionStatus();
		res.json(status);
	} catch (err) {
		console.error(`[${req.requestId}] mfp session status failed:`, err);
		res.status(500).json({ error: 'Failed to get MFP session status' });
	}
}

export async function putCredentials(req: Request, res: Response) {
	const parsed = MfpCredentialsBodySchema.safeParse(req.body ?? {});
	if (!parsed.success) {
		return res.status(400).json({ error: 'Valid email and password are required' });
	}
	try {
		await mfpService.saveCredentials(parsed.data.email, parsed.data.password);
		res.json({
			ok: true,
			connected: true,
			emailMasked: mfpService.maskEmail(parsed.data.email),
		});
	} catch (err) {
		console.error(`[${req.requestId}] mfp put credentials failed:`, err);
		res.status(500).json({ error: 'Failed to save credentials' });
	}
}

export async function disconnectSession(req: Request, res: Response) {
	try {
		await mfpService.disconnectSession();
		res.json({ ok: true, connected: false });
	} catch (err) {
		console.error(`[${req.requestId}] mfp disconnect failed:`, err);
		res.status(500).json({ error: 'Failed to disconnect' });
	}
}

export async function startLog(req: Request, res: Response) {
	try {
		const result = await mfpService.startLogJob(paramId(req));
		if (!result.ok) {
			if ('workerOffline' in result && result.workerOffline) {
				return res.status(503).json({
					workerOffline: true,
					error: result.error,
				});
			}
			if ('busy' in result && result.busy) {
				const status = await mfpService.getSessionStatus();
				return res.status(409).json({
					busy: true,
					error: result.error,
					activeJobId: status.activeJobId,
					activeEntryId: status.activeEntryId,
				});
			}
			return res.status(400).json({
				error: 'error' in result ? result.error : 'Failed to start log job',
			});
		}
		res.status(202).json({ job: result.job });
	} catch (err) {
		console.error(`[${req.requestId}] mfp log start failed:`, err);
		res.status(500).json({ error: 'Failed to start MFP log job' });
	}
}

export async function cancelJob(req: Request, res: Response) {
	try {
		const result = await mfpService.cancelActiveJob();
		res.json(result);
	} catch (err) {
		console.error(`[${req.requestId}] mfp cancel job failed:`, err);
		res.status(500).json({ error: 'Failed to cancel MyFitnessPal job' });
	}
}

export async function getJob(req: Request, res: Response) {
	try {
		const job = await mfpService.getJob(paramId(req));
		if (!job) return res.status(404).json({ error: 'Job not found' });
		res.json({ job });
	} catch (err) {
		console.error(`[${req.requestId}] mfp get job failed:`, err);
		res.status(500).json({ error: 'Failed to load job' });
	}
}

export async function jobInput(req: Request, res: Response) {
	const parsed = MfpJobInputBodySchema.safeParse(req.body ?? {});
	if (!parsed.success) {
		return res.status(400).json({ error: 'text or resume is required' });
	}
	try {
		const job = await mfpService.provideJobInput(paramId(req), parsed.data);
		if (!job) return res.status(404).json({ error: 'Job not found' });
		res.json({ job });
	} catch (err) {
		console.error(`[${req.requestId}] mfp job input failed:`, err);
		res.status(409).json({
			error: err instanceof Error ? err.message : 'Failed to provide input',
		});
	}
}

export async function workerHeartbeat(req: Request, res: Response) {
	try {
		const hostname =
			typeof req.body?.hostname === 'string' ? req.body.hostname : undefined;
		await mfpService.recordWorkerHeartbeat(hostname);
		res.json({ ok: true });
	} catch (err) {
		console.error(`[${req.requestId}] mfp worker heartbeat failed:`, err);
		res.status(500).json({ error: 'Failed to record heartbeat' });
	}
}

export async function workerClaimNext(req: Request, res: Response) {
	try {
		const claimed = await mfpService.claimNextJob();
		if (!claimed) {
			return res.status(204).end();
		}
		res.json(claimed);
	} catch (err) {
		console.error(`[${req.requestId}] mfp worker claim failed:`, err);
		res.status(500).json({ error: 'Failed to claim job' });
	}
}

export async function workerPatchJob(req: Request, res: Response) {
	const parsed = MfpWorkerJobPatchSchema.safeParse(req.body ?? {});
	if (!parsed.success) {
		return res.status(400).json({ error: 'Invalid job patch' });
	}
	try {
		const job = await mfpService.patchJobFromWorker(paramId(req), parsed.data);
		if (!job) return res.status(404).json({ error: 'Job not found' });
		res.json({ job });
	} catch (err) {
		console.error(`[${req.requestId}] mfp worker patch failed:`, err);
		res.status(500).json({ error: 'Failed to update job' });
	}
}
