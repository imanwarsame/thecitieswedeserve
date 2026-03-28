export const EnergyLineShader = {
	uniforms: {
		uTime: { value: 0 },
		uLineLength: { value: 1 },
		uTimeOffset: { value: 0 },      // random per-line offset for desync
		uColor: { value: null },         // THREE.Color
		uOpacity: { value: 0.4 },
		uPulseSpeed: { value: 0.25 },    // how fast the dot travels (cycles/sec)
		uPulseSize: { value: 0.04 },     // dot radius in normalised line coords
		uPulseBright: { value: 0.55 },   // extra brightness at the dot
	},

	vertexShader: /* glsl */ `
		attribute float lineDistance;
		varying float vDist;

		void main() {
			vDist = lineDistance;
			gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
		}
	`,

	fragmentShader: /* glsl */ `
		uniform float uTime;
		uniform float uLineLength;
		uniform float uTimeOffset;
		uniform vec3  uColor;
		uniform float uOpacity;
		uniform float uPulseSpeed;
		uniform float uPulseSize;
		uniform float uPulseBright;

		varying float vDist;

		void main() {
			// ── solid continuous line ─────────────────────────────
			float alpha = uOpacity;
			vec3  col   = uColor;

			// ── small dot pulse travelling source → dest ─────────
			float norm = vDist / uLineLength;                              // 0→1 along line
			float dotPos = fract((uTime + uTimeOffset) * uPulseSpeed);    // per-line desync
			float dist = abs(norm - dotPos);
			float dot = smoothstep(uPulseSize, 0.0, dist);

			col   += dot * uPulseBright;
			alpha += dot * (1.0 - alpha);

			gl_FragColor = vec4(col, alpha);
		}
	`,
};
