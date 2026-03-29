/**
 * Mobile / touch-device detection and responsive utilities.
 * Uses capability-based detection (pointer: coarse, touch points)
 * rather than user-agent sniffing.
 */

/** True when the primary pointer is coarse (finger) rather than fine (mouse). */
export const isTouchDevice =
	typeof window !== 'undefined' &&
	(window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0);

/** True when viewport width ≤ 768 px at load time. Re-check via the media query if needed. */
export const isSmallScreen =
	typeof window !== 'undefined' && window.innerWidth <= 768;

/** Convenience: touch device OR small screen. */
export const isMobile = isTouchDevice || isSmallScreen;

/** Media query list — subscribe to changes with .addEventListener('change', fn). */
export const mobileQuery =
	typeof window !== 'undefined'
		? window.matchMedia('(max-width: 768px), (pointer: coarse)')
		: (null as unknown as MediaQueryList);

/** React-friendly hook lives in the ui/ layer — see useMobile.ts */
