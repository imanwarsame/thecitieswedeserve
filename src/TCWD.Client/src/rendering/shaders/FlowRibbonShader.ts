// ── Flow Ribbon Shader ────────────────────────────────────────────────────────
//
// Renders the variable-width flow overlay ribbons with:
//   • Soft centre-glow profile — brightest at the ribbon centre,
//     falls to transparent at both edges (like a neon tube).
//   • Breathing animation — slow sine-wave oscillation whose speed
//     and amplitude scale with flow intensity so congested edges
//     pulse noticeably faster than quiet ones.
//   • Peak brightness burst — tiny colour boost at each breath peak
//     so the ribbon can trigger scene bloom.
//
// Custom vertex attributes:
//   aColor   : vec3  — per-vertex RGB from the green→yellow→red flow ramp
//   aEdgeUV  : float — 0.0 = left edge, 1.0 = right edge (linear across ribbon)
//   aFlow    : float — normalised flow intensity 0–1
//   aPhase   : float — per-ribbon random phase offset for visual desync

export const FlowRibbonShader = {
	uniforms: {
		uDarkness: { value: 0.0 }, // 0 = bright day, 1 = dark night
		uFade:     { value: 1.0 }, // 0 = invisible (fade-in/out), 1 = fully visible
	},

	vertexShader: /* glsl */ `
		attribute vec3  aColor;
		attribute float aEdgeUV;
		attribute float aFlow;

		varying vec3  vColor;
		varying float vEdgeUV;
		varying float vFlow;

		void main() {
			vColor  = aColor;
			vEdgeUV = aEdgeUV;
			vFlow   = aFlow;
			gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
		}
	`,

	fragmentShader: /* glsl */ `
		#define PI 3.14159265359

		uniform float uDarkness;
		uniform float uFade;

		varying vec3  vColor;
		varying float vEdgeUV;
		varying float vFlow;

		void main() {
			// Very flat edge profile — most of the ribbon stays near full brightness,
			// only the last 20% toward each edge fades to transparent.
			float edgeFade = pow(sin(vEdgeUV * PI), 0.35);

			// Strong base opacity: low-flow ~0.50, high-flow ~0.78.
			float alpha = (0.50 + vFlow * 0.28) * edgeFade;

			// Full colour — no desaturation.
			vec3 col = vColor + uDarkness * 0.08;

			gl_FragColor = vec4(clamp(col, 0.0, 1.0), clamp(alpha * uFade, 0.0, 1.0));
		}
	`,
};
