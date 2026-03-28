import { Engine } from '../core/Engine';

let engine: Engine | null = null;

export async function bootstrap(canvas: HTMLCanvasElement): Promise<Engine> {
	if (engine) {
		engine.stop();
	}

	engine = new Engine();
	await engine.init(canvas);
	engine.start();

	return engine;
}

export function shutdown(): void {
	if (engine) {
		engine.stop();
		engine = null;
		console.log('[Bootstrap] Engine shut down.');
	}
}
