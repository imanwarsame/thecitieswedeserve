import * as THREE from 'three';
import type { Engine } from '../core/Engine';

/**
 * Stress-test the rendering pipeline.
 *
 * Spawns N extra meshes, measures FPS and draw call count over a
 * configurable sample window, then reports whether WebGPU would help.
 *
 * Usage (browser console):  window.stressTest()
 *                           window.stressTest(5000)
 */
export function runStressTest(engine: Engine, meshCount = 2000): void {
	const renderer = engine.getRenderer().getWebGLRenderer();
	const scene = engine.getScene().root;

	// ── Baseline snapshot ────────────────────────────────
	renderer.info.autoReset = false;
	renderer.info.reset();

	// Force one render to populate info
	const camera = engine.getIsometricCamera().getCamera();
	renderer.render(scene, camera);

	const baselineCalls = renderer.info.render.calls;
	const baselineTris = renderer.info.render.triangles;
	const baselinePoints = renderer.info.render.points;
	const baselineLines = renderer.info.render.lines;

	console.log('══════════════════════════════════════════════');
	console.log('  STRESS TEST — BASELINE (before extra meshes)');
	console.log('══════════════════════════════════════════════');
	console.log(`  Draw calls:   ${baselineCalls}`);
	console.log(`  Triangles:    ${baselineTris.toLocaleString()}`);
	console.log(`  Lines:        ${baselineLines.toLocaleString()}`);
	console.log(`  Points:       ${baselinePoints.toLocaleString()}`);
	console.log(`  Programs:     ${renderer.info.programs?.length ?? '?'}`);
	console.log(`  Geometries:   ${renderer.info.memory.geometries}`);
	console.log(`  Textures:     ${renderer.info.memory.textures}`);
	console.log('──────────────────────────────────────────────');

	// ── Spawn stress meshes ──────────────────────────────
	const stressGroup = new THREE.Group();
	stressGroup.name = '__stress_test__';

	const sharedGeo = new THREE.BoxGeometry(2, 4, 2);
	const sharedMat = new THREE.MeshStandardMaterial({
		color: 0xcccccc,
		roughness: 1.0,
		metalness: 0.0,
	});

	const spread = 500; // metres
	for (let i = 0; i < meshCount; i++) {
		const mesh = new THREE.Mesh(sharedGeo, sharedMat);
		mesh.position.set(
			(Math.random() - 0.5) * spread,
			2,
			(Math.random() - 0.5) * spread,
		);
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		stressGroup.add(mesh);
	}

	scene.add(stressGroup);

	// ── Measure FPS over 3 seconds ───────────────────────
	console.log(`\n  Spawned ${meshCount} stress meshes. Measuring FPS over 3 seconds…\n`);

	let frames = 0;
	const startTime = performance.now();
	let stressDrawCalls = 0;
	let stressTris = 0;

	const measure = () => {
		const elapsed = performance.now() - startTime;
		if (elapsed < 3000) {
			frames++;
			requestAnimationFrame(measure);
			return;
		}

		// Capture final render stats
		renderer.info.reset();
		renderer.render(scene, camera);
		stressDrawCalls = renderer.info.render.calls;
		stressTris = renderer.info.render.triangles;

		const fps = (frames / (elapsed / 1000)).toFixed(1);

		console.log('══════════════════════════════════════════════');
		console.log(`  STRESS TEST — WITH ${meshCount} EXTRA MESHES`);
		console.log('══════════════════════════════════════════════');
		console.log(`  FPS:          ${fps}`);
		console.log(`  Draw calls:   ${stressDrawCalls}  (was ${baselineCalls})`);
		console.log(`  Triangles:    ${stressTris.toLocaleString()}  (was ${baselineTris.toLocaleString()})`);
		console.log(`  Geometries:   ${renderer.info.memory.geometries}`);
		console.log('──────────────────────────────────────────────');

		// ── Diagnosis ────────────────────────────────────
		const cpuBound = stressDrawCalls > 500;
		const gpuBound = stressTris > 2_000_000;
		const fpsNum = parseFloat(fps);

		console.log('\n  DIAGNOSIS:');
		if (fpsNum >= 55) {
			console.log('  ✓ FPS is fine (≥55). No WebGPU needed.');
		} else if (cpuBound && !gpuBound) {
			console.log(`  ⚠ CPU-BOUND: ${stressDrawCalls} draw calls is high.`);
			console.log('    → Fix: merge geometries, share materials, instance meshes.');
			console.log('    → WebGPU would NOT help (draw call overhead is CPU-side).');
		} else if (gpuBound && !cpuBound) {
			console.log(`  ⚠ GPU-BOUND: ${stressTris.toLocaleString()} triangles is heavy.`);
			console.log('    → Fix: LOD, reduce geometry complexity.');
			console.log('    → WebGPU MIGHT help with compute shaders for culling.');
		} else if (cpuBound && gpuBound) {
			console.log('  ⚠ BOTH CPU + GPU bound.');
			console.log('    → Fix draw calls first (instancing/merging), then LOD.');
			console.log('    → WebGPU alone won\'t fix this.');
		} else {
			console.log(`  ? FPS dropped to ${fps} but draw calls (${stressDrawCalls}) and tris (${stressTris.toLocaleString()}) look reasonable.`);
			console.log('    → Likely post-processing overhead (GTAO, bloom, outlines).');
			console.log('    → WebGPU would NOT help.');
		}

		console.log('══════════════════════════════════════════════');

		// ── Cleanup ──────────────────────────────────────
		scene.remove(stressGroup);
		sharedGeo.dispose();
		sharedMat.dispose();
		renderer.info.autoReset = true;

		console.log('\n  Stress meshes removed. Scene restored.\n');
	};

	requestAnimationFrame(measure);
}
