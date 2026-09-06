import { useEffect, useReducer, useRef, useState } from 'react';
import {
	clearInstagramDraft,
	getInstagramDraft,
	saveInstagramDraft,
} from '../lib/api';
import {
	clearLocalDraft,
	composerReducer,
	initialComposerState,
	loadDraft,
	normalizeDraft,
	saveDraft,
	type ComposerAction,
} from '../lib/instagram/composerState';
import type { ComposerState } from '../lib/instagram/types';

const REDIS_SAVE_DEBOUNCE_MS = 600;

export function useInstagramComposer() {
	const [state, dispatch] = useReducer(composerReducer, initialComposerState, () => {
		return loadDraft() ?? initialComposerState;
	});
	const [remoteReady, setRemoteReady] = useState(false);
	const skipNextRemoteSave = useRef(true);
	const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const latestState = useRef(state);
	latestState.current = state;

	useEffect(() => {
		let cancelled = false;

		void (async () => {
			try {
				const { draft } = await getInstagramDraft();
				if (cancelled) return;
				const normalized = normalizeDraft(draft);
				if (normalized) {
					skipNextRemoteSave.current = true;
					dispatch({ type: 'HYDRATE', state: normalized });
					saveDraft(normalized);
				}
			} catch {
				// Keep local draft if Redis is unavailable.
			} finally {
				if (!cancelled) setRemoteReady(true);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		saveDraft(state);

		if (!remoteReady) return;
		if (skipNextRemoteSave.current) {
			skipNextRemoteSave.current = false;
			return;
		}

		if (saveTimer.current) clearTimeout(saveTimer.current);
		saveTimer.current = setTimeout(() => {
			const snapshot = latestState.current;
			const isEmpty =
				snapshot.stories.every((slide) => slide.slots.every((slot) => slot === null)) &&
				snapshot.post.photos.length === 0 &&
				snapshot.mode === initialComposerState.mode &&
				snapshot.post.aspect === initialComposerState.post.aspect;

			void (async () => {
				try {
					if (isEmpty && snapshot.stories.length === 1) {
						await clearInstagramDraft();
						clearLocalDraft();
						return;
					}
					await saveInstagramDraft(snapshot);
				} catch {
					// Local draft remains as fallback.
				}
			})();
		}, REDIS_SAVE_DEBOUNCE_MS);

		return () => {
			if (saveTimer.current) clearTimeout(saveTimer.current);
		};
	}, [state, remoteReady]);

	return { state, dispatch, remoteReady };
}

export type ComposerDispatch = (action: ComposerAction) => void;

export type UseInstagramComposerReturn = {
	state: ComposerState;
	dispatch: ComposerDispatch;
	remoteReady: boolean;
};
