import { useState, useEffect, useCallback } from 'react';
import { useEngine } from '../hooks/useEngine';
import { Slider } from '../components/Slider';
import { radialFogUniforms } from '../../rendering/RadialFog';
import { applyPreset, listPresets } from '../../rendering/MoodPresets';
import { MaterialDebugPanel } from './MaterialDebugPanel';
import styles from './DebugPanel.module.css';

export function DebugPanel() {
	const engine = useEngine();
	const [visible, setVisible] = useState(false);
	const [fogInner, setFogInner] = useState(radialFogUniforms.fogInnerRadius.value);
	const [fogOuter, setFogOuter] = useState(radialFogUniforms.fogOuterRadius.value);
	const [bloomStrength, setBloomStrength] = useState(0.25);
	const [bloomThreshold, setBloomThreshold] = useState(0.85);

	const toggle = useCallback((e: KeyboardEvent) => {
		if (e.key === '`' || e.key === 'F9') setVisible(v => !v);
	}, []);

	useEffect(() => {
		window.addEventListener('keydown', toggle);
		return () => window.removeEventListener('keydown', toggle);
	}, [toggle]);

	if (!visible) return null;

	const pp = engine.getRenderPipeline().getPostProcessing();
	const scene = engine.getScene();
	const lighting = scene.root.children.find(c => c.name === 'environment');

	return (
		<div className={styles.panel}>
			<div className={styles.section}>
				<span className={styles.sectionTitle}>Fog</span>
				<Slider label="Inner" value={fogInner} min={0} max={100} step={1}
					onChange={v => { setFogInner(v); radialFogUniforms.fogInnerRadius.value = v; }} />
				<Slider label="Outer" value={fogOuter} min={10} max={300} step={1}
					onChange={v => { setFogOuter(v); radialFogUniforms.fogOuterRadius.value = v; }} />
			</div>

			<div className={styles.section}>
				<span className={styles.sectionTitle}>Bloom</span>
				<Slider label="Str" value={bloomStrength} min={0} max={1}
					onChange={v => { setBloomStrength(v); pp.setBloomParams(v, bloomThreshold, 0.4); }} />
				<Slider label="Thr" value={bloomThreshold} min={0} max={1}
					onChange={v => { setBloomThreshold(v); pp.setBloomParams(bloomStrength, v, 0.4); }} />
			</div>

			<MaterialDebugPanel />

			<div className={styles.section}>
				<span className={styles.sectionTitle}>Mood Presets</span>
				<div className={styles.presets}>
					{listPresets().map(name => (
						<button key={name} className={styles.presetBtn}
							onClick={() => applyPreset(name, scene.root, lighting as never, pp)}>
							{name}
						</button>
					))}
				</div>
			</div>
		</div>
	);
}
