export const EnergyLineShader = {
	uniforms: {
		uTime: { value: 0 },
		uLineLength: { value: 1 },
		uTimeOffset: { value: 0 },      // random per-line offset for desync
		uColor: { value: null },         // THREE.Color
		uOpacity: { value: 0.4 },
		uPulseSpeed: { value: 0.4 },     // travel speed once a pulse is active
		uPulseSize: { value: 0.04 },     // dot radius in normalised line coords
		uPulseBright: { value: 0.55 },   // extra brightness at the dot
		uDarkness: { value: 0.0 },       // 0 = day, 1 = night — drives pulse contrast
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
		uniform float uDarkness;

		varying float vDist;

		// cheap hash for per-pulse variation
		float hash(float n) {
			return fract(sin(n * 127.1) * 43758.5453);
		}

		void main() {
			float alpha = uOpacity;
			vec3  col   = uColor;

			float norm = vDist / uLineLength;   // 0→1 along line
			float dot  = 0.0;

			// 2 gentle pulses, each on a long random cycle (~2-4s)
			for (int i = 0; i < 2; i++) {
				float fi     = float(i);
				float seed   = uTimeOffset + fi * 5.31;
				// each pulse has its own cycle duration: 2-4 seconds
				float cycle  = 2.0 + hash(seed) * 2.0;
				float t      = mod(uTime + hash(seed + 1.0) * 50.0, cycle); // where we are in this cycle
				// pulse travels during the first 40% of the cycle, then quiet
				float travel = t / (cycle * 0.4);
				float pos    = clamp(travel, 0.0, 1.0);
				// only visible while travelling (pos < 1)
				float visible = step(travel, 1.0);
				float d      = abs(norm - pos);
				dot += smoothstep(uPulseSize, 0.0, d) * visible;
			}

			dot = min(dot, 1.0);
			// Day: darken the pulse so it contrasts against light background
			// Night: brighten the pulse so it glows against dark background
			float bright = mix(-uPulseBright, uPulseBright, uDarkness);
			col   += dot * bright;
			alpha += dot * (1.0 - alpha);

			gl_FragColor = vec4(col, alpha);
		}
	`,
};
