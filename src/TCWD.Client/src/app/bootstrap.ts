import { Engine } from '../core/Engine';

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
	return newEngine;
}

export function shutdown(): void {
	if (engine) {
		engine.stop();
		engine = null;
		console.log('[Bootstrap] Engine shut down.');
	}
}
