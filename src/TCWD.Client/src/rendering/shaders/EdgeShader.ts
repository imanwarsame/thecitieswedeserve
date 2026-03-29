/**
 * Depth-based edge detection shader.
 *
 * Works directly on raw depth buffer values [0,1] — no linearization needed.
 * Detects silhouette edges (depth jumps) and crease edges (depth curvature)
 * using Sobel + Laplacian operators. Clean, thin, muted architectural lines.
 *
 * Works correctly with both orthographic and perspective cameras.
 */
export const EdgeShader = {
	name: 'EdgeShader',

	uniforms: {
		tDiffuse: { value: null },
		tDepth: { value: null },
		resolution: { value: null },
		edgeColor: { value: null },
		edgeOpacity: { value: 0.35 },
		depthThreshold: { value: 0.0015 },
	},

	vertexShader: /* glsl */ `
		varying vec2 vUv;
		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
		}
	`,

	fragmentShader: /* glsl */ `
		uniform sampler2D tDiffuse;
		uniform sampler2D tDepth;
		uniform vec2 resolution;
		uniform vec3 edgeColor;
		uniform float edgeOpacity;
		uniform float depthThreshold;

		varying vec2 vUv;

		float rawDepth(vec2 uv) {
			return texture2D(tDepth, uv).r;
		}

		void main() {
			vec4 color = texture2D(tDiffuse, vUv);
			vec2 t = 1.0 / resolution;

			// Sample 3x3 neighbourhood (raw depth, [0,1])
			float d   = rawDepth(vUv);
			float dL  = rawDepth(vUv + vec2(-t.x, 0.0));
			float dR  = rawDepth(vUv + vec2( t.x, 0.0));
			float dT  = rawDepth(vUv + vec2(0.0,  t.y));
			float dB  = rawDepth(vUv + vec2(0.0, -t.y));
			float dTL = rawDepth(vUv + vec2(-t.x,  t.y));
			float dTR = rawDepth(vUv + vec2( t.x,  t.y));
			float dBL = rawDepth(vUv + vec2(-t.x, -t.y));
			float dBR = rawDepth(vUv + vec2( t.x, -t.y));

			// Sobel gradient magnitude (silhouette edges — depth jumps)
			float sobelX = (dTR + 2.0 * dR + dBR) - (dTL + 2.0 * dL + dBL);
			float sobelY = (dTL + 2.0 * dT + dTR) - (dBL + 2.0 * dB + dBR);
			float sobel = sqrt(sobelX * sobelX + sobelY * sobelY);

			// Laplacian (crease edges — surface angle changes)
			float laplacian = abs((dL + dR + dT + dB) - 4.0 * d);

			// Combine: sobel catches silhouettes, laplacian catches creases
			float edgeStrength = max(sobel, laplacian);

			// Skip sky / far plane (depth ≈ 1.0)
			if (d > 0.999) edgeStrength = 0.0;

			float edge = smoothstep(depthThreshold * 0.4, depthThreshold, edgeStrength);

			color.rgb = mix(color.rgb, edgeColor, edge * edgeOpacity);
			gl_FragColor = color;
		}
	`,
};
