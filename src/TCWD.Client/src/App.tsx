import { useRef, useEffect, useState } from 'react';
import { bootstrap, shutdown } from './app/bootstrap';
import { EngineContext } from './ui/EngineContext';
import { HudShell } from './ui/layout/HudShell';
import { DebugPanel } from './ui/controls/DebugPanel';
import { EngineConfig } from './app/config';
import type { Engine } from './core/Engine';
import './App.css';

function App() {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [engine, setEngine] = useState<Engine | null>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		let cancelled = false;
		bootstrap(canvas).then((eng) => {
			if (cancelled) { shutdown(); return; }
			setEngine(eng);
		});

		return () => {
			cancelled = true;
			shutdown();
			setEngine(null);
		};
	}, []);

	return (
		<EngineContext.Provider value={engine}>
			<div id="engine-root">
				<canvas ref={canvasRef} id="engine-canvas" />
				{engine && <HudShell />}
				{engine && EngineConfig.debug && <DebugPanel />}
			</div>
		</EngineContext.Provider>
	);
}

export default App;
