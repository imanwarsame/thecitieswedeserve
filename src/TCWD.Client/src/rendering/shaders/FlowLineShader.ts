// ── Flow Line Shader ──────────────────────────────────────────────────────────
//
// Used by FlowOverlayRenderer for the animated DirectionalPulse layer.
//
// Each LineSegments segment pair carries:
//   aSegmentT   — 0.0 at start vertex, 1.0 at end vertex
//   aFlow       — 0–1 normalised flow intensity (same for both vertices in pair)
//   aTimeOffset — per-segment random phase offset for desync (same for both)
//
// The fragment shader:
//   • Maps flow → colour ramp: green (low) → yellow (mid) → red (high)
//   • Animates a travelling dot along each segment; speed and cycle scale
//     with flow so congested edges look visibly busier.

export const FlowLineShader = {
	uniforms: {
		uTime:     { value: 0 },
		uDarkness: { value: 0.0 }, // 0 = bright day, 1 = dark night
	},

	vertexShader: /* glsl */ `
		attribute float aSegmentT;   // 0.0 at segment start, 1.0 at segment end
		attribute float aFlow;       // 0–1 normalised flow intensity
		attribute float aTimeOffset; // per-segment random phase offset

		varying float vSegmentT;
		varying float vFlow;
		varying float vTimeOffset;

		void main() {
			vSegmentT  = aSegmentT;
			vFlow      = aFlow;
			vTimeOffset = aTimeOffset;
			gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
		}
	`,

	fragmentShader: /* glsl */ `
		uniform float uTime;
		uniform float uDarkness;

		varying float vSegmentT;
		varying float vFlow;
		varying float vTimeOffset;

		// Green (120°) → Yellow (60°) → Red (0°) colour ramp
		vec3 flowColor(float f) {
			// Hue goes from 120° down to 0° as f increases
			float hue = (1.0 - clamp(f, 0.0, 1.0)) * (120.0 / 360.0);
			float c   = 0.95;
			float x   = c * (1.0 - abs(mod(hue * 6.0, 2.0) - 1.0));
			float h6  = hue * 6.0;
			if      (h6 < 1.0) return vec3(c, x, 0.0);
			else if (h6 < 2.0) return vec3(x, c, 0.0);
			else if (h6 < 3.0) return vec3(0.0, c, x);
			else if (h6 < 4.0) return vec3(0.0, x, c);
			else if (h6 < 5.0) return vec3(x, 0.0, c);
			else               return vec3(c, 0.0, x);
		}

		void main() {
			float flow = vFlow;
			vec3  col  = flowColor(flow);

			// Base opacity scales slightly with flow
			float alpha = 0.30 + flow * 0.38;

			// Travelling pulse — speed and cycle duration scale with flow intensity
			// Low flow: slow, sparse pulses  |  High flow: fast, frequent pulses
			float speed = 0.35 + flow * 1.30;
			float cycle = 2.6  - flow * 1.0;  // 1.6–2.6 s cycle
			float t     = mod(uTime * speed + vTimeOffset, cycle);
			float pos   = t / cycle;           // 0→1 position along segment

			float d         = abs(vSegmentT - pos);
			d               = min(d, 1.0 - d); // wrap so pulse re-enters cleanly
			float pulseSize = 0.09;
			float pulse     = smoothstep(pulseSize, 0.0, d);

			// Day: slightly darken pulse for contrast on light bg
			// Night: brighten so it glows against dark bg
			float bright = mix(-0.10, 0.26, uDarkness);
			col   += pulse * bright;
			alpha += pulse * (0.38 - flow * 0.15); // pulse contribution smaller at high flow

			gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
		}
	`,
};
