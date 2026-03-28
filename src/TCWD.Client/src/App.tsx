import { useRef, useEffect } from 'react';
import { bootstrap, shutdown } from './app/bootstrap';
import './App.css';

function App() {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		let cancelled = false;
		bootstrap(canvas).then(() => {
			if (cancelled) shutdown();
		});

		return () => {
			cancelled = true;
			shutdown();
		};
	}, []);

	return (
		<div id="engine-root">
			<canvas ref={canvasRef} id="engine-canvas" />
		</div>
	);
}

export default App;
