import { Engine } from '../core/Engine';
import { radialFogUniforms } from '../rendering/RadialFog';

const VIEW_RADIUS = 1000;
const FOG_INNER_RATIO = 0.92;
const FOG_OUTER_RATIO = 1.3;
const FRUSTUM_BASE = 1000;
const ISO_PITCH = Math.atan(1 / Math.sqrt(2));

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

	// Set initial fog + zoom to match the default 1 km view radius
	radialFogUniforms.fogInnerRadius.value = VIEW_RADIUS * FOG_INNER_RATIO;
	radialFogUniforms.fogOuterRadius.value = VIEW_RADIUS * FOG_OUTER_RATIO;
	const cam = newEngine.getIsometricCamera().getCamera();
	const aspect = cam.right / cam.top;
	const zoomH = (FRUSTUM_BASE * aspect) / VIEW_RADIUS;
	const zoomV = FRUSTUM_BASE / (VIEW_RADIUS * Math.sin(ISO_PITCH));
	const ctrl = newEngine.getCameraController();
	ctrl.setTargetLookAt(0, 0);
	ctrl.setTargetZoom(Math.min(zoomH, zoomV));

	return newEngine;
}

export function shutdown(): void {
	if (engine) {
		engine.stop();
		engine = null;
		console.log('[Bootstrap] Engine shut down.');
	}
}
