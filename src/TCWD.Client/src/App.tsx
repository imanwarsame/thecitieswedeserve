import { useRef, useEffect, useState } from 'react';
import { bootstrap, shutdown } from './app/bootstrap';
import { EngineContext } from './ui/EngineContext';
import { HudShell } from './ui/layout/HudShell';
import { BuildToolbar } from './ui/controls/BuildToolbar';
import { CommandBorder } from './ui/components/CommandBorder';
import { EntityTooltip } from './ui/controls/EntityTooltip';
import { DebugPanel } from './ui/controls/DebugPanel';
import { EngineConfig } from './app/config';
import { CollabBridge } from './session/CollabBridge';
import type { Engine } from './core/Engine';
import './App.css';

function App() {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [engine, setEngine] = useState<Engine | null>(null);
	const collabBridgeRef = useRef<CollabBridge | null>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		let cancelled = false;
		bootstrap(canvas).then((eng) => {
			if (cancelled) { eng.stop(); return; }
			setEngine(eng);
			collabBridgeRef.current = new CollabBridge(eng);
		}).catch(() => {
			// Engine superseded during init (StrictMode remount) — safe to ignore
		});

		return () => {
			cancelled = true;
			collabBridgeRef.current?.dispose();
			collabBridgeRef.current = null;
			shutdown();
			setEngine(null);
		};
	}, []);

	return (
		<EngineContext.Provider value={engine}>
			<div id="engine-root">
				<canvas ref={canvasRef} id="engine-canvas" />
				{engine && <HudShell />}
				{engine && <BuildToolbar />}
				{engine && <EntityTooltip />}
				{engine && <CommandBorder />}
				{engine && EngineConfig.debug && <DebugPanel />}
			</div>
		</EngineContext.Provider>
	);
}

export default App;
