import { useState, useEffect, useCallback, useRef } from 'react';
import { useEngine } from '../hooks/useEngine';
import { Slider } from '../components/Slider';
import { radialFogUniforms } from '../../rendering/RadialFog';
import { X } from 'lucide-react';
import styles from './ViewportSettings.module.css';

export function ViewportSettings() {
	const engine = useEngine();
	const [visible, setVisible] = useState(false);

	// Drag state
	const panelRef = useRef<HTMLDivElement>(null);
	const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
	const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

	const onDragStart = useCallback((e: React.MouseEvent) => {
		if ((e.target as HTMLElement).closest('button')) return;
		e.preventDefault();
		const panel = panelRef.current;
		if (!panel) return;
		const rect = panel.getBoundingClientRect();
		dragRef.current = { startX: e.clientX, startY: e.clientY, originX: rect.left, originY: rect.top };

		const onMove = (ev: MouseEvent) => {
			if (!dragRef.current) return;
			const dx = ev.clientX - dragRef.current.startX;
			const dy = ev.clientY - dragRef.current.startY;
			setPos({ x: dragRef.current.originX + dx, y: dragRef.current.originY + dy });
		};
		const onUp = () => {
			dragRef.current = null;
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('mouseup', onUp);
		};
		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup', onUp);
	}, []);

	// Edges
	const [edgesOn, setEdgesOn] = useState(true);
	const [edgeOpacity, setEdgeOpacity] = useState(0.35);

	// AO
	const [aoOn, setAoOn] = useState(true);
	const [aoRadius, setAoRadius] = useState(0.3);
	const [aoIntensity, setAoIntensity] = useState(0.4);

	// Bloom
	const [bloomOn, setBloomOn] = useState(false);
	const [bloomStrength, setBloomStrength] = useState(0.1);
	const [bloomThreshold, setBloomThreshold] = useState(0.95);

	// Fog
	const [fogInner, setFogInner] = useState(radialFogUniforms.fogInnerRadius.value);
	const [fogOuter, setFogOuter] = useState(radialFogUniforms.fogOuterRadius.value);

	// Shadows
	const [shadowsOn, setShadowsOn] = useState(true);

	// Alt+V toggle
	const onKey = useCallback((e: KeyboardEvent) => {
		const tag = (e.target as HTMLElement).tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA') return;
		if (e.altKey && (e.key === 'v' || e.key === 'V')) {
			e.preventDefault();
			setVisible(v => {
				if (!v) setPos(null);
				return !v;
			});
		}
	}, []);

	useEffect(() => {
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [onKey]);

	if (!visible) return null;

	const pp = engine.getRenderPipeline().getPostProcessing();
	const renderer = engine.getRenderer().getWebGLRenderer();

	const toggleEdges = () => {
		const next = !edgesOn;
		setEdgesOn(next);
		pp.setEffectEnabled('edges', next);
	};

	const toggleAo = () => {
		const next = !aoOn;
		setAoOn(next);
		pp.setEffectEnabled('ao', next);
	};

	const toggleBloom = () => {
		const next = !bloomOn;
		setBloomOn(next);
		pp.setEffectEnabled('bloom', next);
	};

	const toggleShadows = () => {
		const next = !shadowsOn;
		setShadowsOn(next);
		renderer.shadowMap.enabled = next;
		renderer.shadowMap.needsUpdate = true;
	};

	const panelStyle = pos
		? { left: pos.x, top: pos.y, transform: 'none' } as React.CSSProperties
		: undefined;

	return (
		<div ref={panelRef} className={styles.panel} style={panelStyle}>
			<div className={styles.header} onMouseDown={onDragStart}>
				<span className={styles.title}>Viewport</span>
				<button className={styles.closeBtn} onClick={() => setVisible(false)} aria-label="Close">
					<X size={14} strokeWidth={2} />
				</button>
			</div>

			<div className={styles.body}>
				{/* Edges */}
				<div className={styles.section}>
					<span className={styles.sectionTitle}>Edges</span>
					<div className={styles.row}>
						<span className={styles.rowLabel}>Show edges</span>
						<button className={`${styles.toggle} ${edgesOn ? styles.on : ''}`} onClick={toggleEdges}>
							<span className={styles.toggleKnob} />
						</button>
					</div>
					{edgesOn && (
						<Slider label="Opacity" value={edgeOpacity} min={0.05} max={1} step={0.05}
							onChange={v => { setEdgeOpacity(v); pp.setEdgeParams(v); }} />
					)}
				</div>

				{/* Ambient Occlusion */}
				<div className={styles.section}>
					<span className={styles.sectionTitle}>Ambient Occlusion</span>
					<div className={styles.row}>
						<span className={styles.rowLabel}>Enabled</span>
						<button className={`${styles.toggle} ${aoOn ? styles.on : ''}`} onClick={toggleAo}>
							<span className={styles.toggleKnob} />
						</button>
					</div>
					{aoOn && (
						<>
							<Slider label="Radius" value={aoRadius} min={0.05} max={3} step={0.05}
								onChange={v => { setAoRadius(v); pp.setAoParams(v, aoIntensity); }} />
							<Slider label="Intensity" value={aoIntensity} min={0} max={2} step={0.05}
								onChange={v => { setAoIntensity(v); pp.setAoParams(aoRadius, v); }} />
						</>
					)}
				</div>

				{/* Bloom */}
				<div className={styles.section}>
					<span className={styles.sectionTitle}>Bloom</span>
					<div className={styles.row}>
						<span className={styles.rowLabel}>Enabled</span>
						<button className={`${styles.toggle} ${bloomOn ? styles.on : ''}`} onClick={toggleBloom}>
							<span className={styles.toggleKnob} />
						</button>
					</div>
					{bloomOn && (
						<>
							<Slider label="Strength" value={bloomStrength} min={0} max={2} step={0.05}
								onChange={v => { setBloomStrength(v); pp.setBloomParams(v, bloomThreshold, 0.4); }} />
							<Slider label="Threshold" value={bloomThreshold} min={0} max={1} step={0.05}
								onChange={v => { setBloomThreshold(v); pp.setBloomParams(bloomStrength, v, 0.4); }} />
						</>
					)}
				</div>

				{/* Fog */}
				<div className={styles.section}>
					<span className={styles.sectionTitle}>Fog</span>
					<Slider label="Inner" value={fogInner} min={0} max={5000} step={10}
						onChange={v => { setFogInner(v); radialFogUniforms.fogInnerRadius.value = v; }} />
					<Slider label="Outer" value={fogOuter} min={100} max={15000} step={50}
						onChange={v => { setFogOuter(v); radialFogUniforms.fogOuterRadius.value = v; }} />
				</div>

				{/* Shadows */}
				<div className={styles.section}>
					<span className={styles.sectionTitle}>Shadows</span>
					<div className={styles.row}>
						<span className={styles.rowLabel}>Enabled</span>
						<button className={`${styles.toggle} ${shadowsOn ? styles.on : ''}`} onClick={toggleShadows}>
							<span className={styles.toggleKnob} />
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
