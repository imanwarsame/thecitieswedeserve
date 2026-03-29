import { isMobile } from '../core/Mobile';

export const EngineConfig = {
	renderer: {
		antialias: !isMobile,         // disable MSAA on mobile for perf
		shadows: !isMobile,           // disable shadows on mobile
		maxPixelRatio: isMobile ? 1.5 : 2, // cap DPR on mobile
	},
	camera: {
		zoom: 1,
		minZoom: 0.015,
		maxZoom: 8,
	},
	world: {
		dayLengthInSeconds: 300,
		startHour: 8,
	},
	environment: {
		fog: true,
		preset: 'day' as const,
		hdrPath: '' as string,  // e.g. '/assets/environment/studio.hdr' — leave empty for fallback
	},
	postProcessing: {
		enabled: !isMobile,           // disable post-processing on mobile
		ao: {
			enabled: !isMobile,
			radius: 0.3,
			intensity: 0.4,
		},
		bloom: {
			enabled: false,
			threshold: 0.95,
			strength: 0.1,
			radius: 0.3,
		},
	},
	debug: import.meta.env.DEV,
};
