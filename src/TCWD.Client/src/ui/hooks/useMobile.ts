import { useSyncExternalStore } from 'react';
import { mobileQuery } from '../../core/Mobile';

function subscribe(cb: () => void) {
	mobileQuery.addEventListener('change', cb);
	return () => mobileQuery.removeEventListener('change', cb);
}

function getSnapshot() {
	return mobileQuery.matches;
}

/** Reactive hook — returns true when viewport is ≤ 768 px or primary pointer is coarse. */
export function useMobile(): boolean {
	return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
