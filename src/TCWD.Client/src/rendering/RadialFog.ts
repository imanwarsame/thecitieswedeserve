import * as THREE from 'three';
import { Palette } from './Palette';

/** Global uniforms shared by all patched materials */
export const radialFogUniforms = {
	fogCenter: { value: new THREE.Vector3(0, 0, 0) },
	fogInnerRadius: { value: 2500 },
	fogOuterRadius: { value: 4000 },
	fogColor: { value: new THREE.Color(Palette.fog) },
};

/**
 * Patch Three.js shader chunks to replace camera-distance fog
 * with world-space radial fog measured from a center point on the ground plane.
 *
 * Uses `vFogWorldPos` (not `vWorldPosition`) to avoid redefinition conflicts
 * with Three.js built-in varyings.
 *
 * MUST be called before any materials are created.
 */
export function installRadialFog(): void {
	THREE.ShaderChunk.fog_pars_vertex = /* glsl */ `
		#ifdef USE_FOG
			varying vec3 vFogWorldPos;
		#endif
	`;

	THREE.ShaderChunk.fog_vertex = /* glsl */ `
		#ifdef USE_FOG
			vFogWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
		#endif
	`;

	THREE.ShaderChunk.fog_pars_fragment = /* glsl */ `
		#ifdef USE_FOG
			varying vec3 vFogWorldPos;
			uniform vec3 fogCenter;
			uniform float fogInnerRadius;
			uniform float fogOuterRadius;
			uniform vec3 fogColor;
		#endif
	`;

	// Guard: if fogOuterRadius <= fogInnerRadius (e.g. uniforms not injected, both 0),
	// skip fog entirely to avoid smoothstep(0,0,x) = 1.0 blanking out the material.
	THREE.ShaderChunk.fog_fragment = /* glsl */ `
		#ifdef USE_FOG
			if (fogOuterRadius > fogInnerRadius) {
				float fogDist = distance(vFogWorldPos.xz, fogCenter.xz);
				float fogFactor = smoothstep(fogInnerRadius, fogOuterRadius, fogDist);
				gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
			}
		#endif
	`;

	console.log('[RadialFog] Shader chunks patched.');
}

/**
 * Inject radial fog uniforms into a material via onBeforeCompile.
 */
export function patchMaterialUniforms(material: THREE.Material): void {
	const originalCompile = material.onBeforeCompile;
	material.onBeforeCompile = (shader, renderer) => {
		shader.uniforms.fogCenter = radialFogUniforms.fogCenter;
		shader.uniforms.fogInnerRadius = radialFogUniforms.fogInnerRadius;
		shader.uniforms.fogOuterRadius = radialFogUniforms.fogOuterRadius;
		shader.uniforms.fogColor = radialFogUniforms.fogColor;
		if (originalCompile) {
			originalCompile.call(material, shader, renderer);
		}
	};
	material.needsUpdate = true;
}
