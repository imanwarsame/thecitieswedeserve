import { Engine } from '../core/Engine';
import { runStressTest } from '../utils/stressTest';

let engine: Engine | null = null;

export async function bootstrap(canvas: HTMLCanvasElement): Promise<Engine> {
	if (engine) {
		engine.stop();
	}

	const newEngine = new Engine();
	engine = newEngine;

	await newEngine.init(canvas);

	// If shutdown() or another bootstrap() replaced us during init, bail out
	if (engine !== newEngine) {
		newEngine.stop();
		throw new Error('[Bootstrap] Engine was superseded during initialization.');
	}

	newEngine.start();

	// Expose stress test on window for console access
	(window as Record<string, unknown>).stressTest = (count?: number) => {
		if (!engine) { console.warn('No engine'); return; }
		runStressTest(engine, count);
	};

	return newEngine;
}

export function shutdown(): void {
	if (engine) {
		engine.stop();
		engine = null;
		console.log('[Bootstrap] Engine shut down.');
	}
}
