import { useCallback, useEffect, useState } from 'react';
import { Slider02 } from '../components/Slider02';
import { useEngine } from '../hooks/useEngine';
import { radialFogUniforms } from '../../rendering/RadialFog';
import styles from './ViewRadiusControl.module.css';

/** Discrete radius steps — clean round values where the hex edge is visible. */
const STEPS = [250, 500, 750, 1000, 1250, 1500, 1750, 2000];
const DEFAULT_INDEX = 3; // 1000 m = 1 km

/** Fraction of the visible radius where fog starts to kick in. */
const FOG_INNER_RATIO = 0.92;
/** Fraction past the visible radius where fog is fully opaque. */
const FOG_OUTER_RATIO = 1.3;

const FRUSTUM_BASE = 1000;
const ISO_PITCH = Math.atan(1 / Math.sqrt(2));

function formatRadius(v: number): string {
	const r = STEPS[v];
	return r >= 1000 ? `${(r / 1000).toFixed(1)} km` : `${r} m`;
}

function applyFog(radius: number) {
	radialFogUniforms.fogInnerRadius.value = radius * FOG_INNER_RATIO;
	radialFogUniforms.fogOuterRadius.value = radius * FOG_OUTER_RATIO;
}

function zoomForRadius(radius: number, aspect: number): number {
	const zoomH = (FRUSTUM_BASE * aspect) / radius;
	const zoomV = FRUSTUM_BASE / (radius * Math.sin(ISO_PITCH));
	return Math.min(zoomH, zoomV);
}

applyFog(STEPS[DEFAULT_INDEX]);

export function ViewRadiusControl() {
	const engine = useEngine();
	const [stepIdx, setStepIdx] = useState(DEFAULT_INDEX);

	useEffect(() => {
		const cam = engine.getIsometricCamera().getCamera();
		const aspect = cam.right / cam.top;
		const ctrl = engine.getCameraController();
		ctrl.setTargetLookAt(0, 0);
		ctrl.setTargetZoom(zoomForRadius(STEPS[DEFAULT_INDEX], aspect));
	}, [engine]);

	const onChange = useCallback((v: number) => {
		const idx = Math.round(v);
		setStepIdx(idx);
		const radius = STEPS[idx];
		applyFog(radius);

		const cam = engine.getIsometricCamera().getCamera();
		const aspect = cam.right / cam.top;
		const ctrl = engine.getCameraController();
		ctrl.setTargetLookAt(0, 0);
		ctrl.setTargetZoom(zoomForRadius(radius, aspect));
	}, [engine]);

	return (
		<div className={styles.wrapper}>
			<Slider02
				label="View"
				value={stepIdx}
				min={0}
				max={STEPS.length - 1}
				step={1}
				barSize={0.32}
				textSize={0.6}
				formatDisplay={formatRadius}
				onChange={onChange}
			/>
		</div>
	);
}
