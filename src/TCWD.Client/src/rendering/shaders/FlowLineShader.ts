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
		uFade:     { value: 1.0 }, // cross-fade controller
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
		uniform float uFade;

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

			// Travelling dot — speed and cycle scale gently with flow.
			// Dot moves at a leisurely walking pace at low flow and a brisk
			// but non-jarring pace at high flow.  No strobe: a single small dot
			// per segment, never flashing the whole segment at once.
			float speed = 0.30 + flow * 0.80;
			float cycle = 3.0  - flow * 0.8;  // 2.2–3.0 s cycle
			float t     = mod(uTime * speed + vTimeOffset, cycle);
			float pos   = t / cycle;           // 0→1 position along segment

			float d         = abs(vSegmentT - pos);
			d               = min(d, 1.0 - d); // wrap
			float pulseSize = 0.07;
			float pulse     = smoothstep(pulseSize, 0.0, d);

			// Day: subtle contrast;  Night: gentle glow
			float bright = mix(-0.08, 0.20, uDarkness);
			col   += pulse * bright;
			// Dot adds a modest opacity nudge only (no full-opacity flash)
			alpha += pulse * 0.18;

			gl_FragColor = vec4(col, clamp(alpha * uFade, 0.0, 1.0));
		}
	`,
};
