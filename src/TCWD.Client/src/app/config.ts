export const EngineConfig = {
	renderer: {
		useWebGPU: true,
		antialias: true,
		shadows: true,
	},
	camera: {
		zoom: 1,
		minZoom: 0.5,
		maxZoom: 3,
	},
	world: {
		dayLengthInSeconds: 300,
		startHour: 8,
	},
	environment: {
		fog: true,
		preset: 'day' as const,
	},
	postProcessing: {
		enabled: true,
		bloom: {
			enabled: false,
			threshold: 0.8,
			strength: 0.3,
			radius: 0.4,
		},
	},
	debug: import.meta.env.DEV,
};
