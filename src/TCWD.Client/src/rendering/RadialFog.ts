import * as THREE from 'three';
import { Palette } from './Palette';

/** Global uniforms shared by all patched materials */
export const radialFogUniforms = {
	fogCenter: { value: new THREE.Vector3(0, 0, 0) },
	fogInnerRadius: { value: 30.0 },
	fogOuterRadius: { value: 120.0 },
	fogColor: { value: new THREE.Color(Palette.fog) },
};

/**
 * Patch Three.js shader chunks to replace camera-distance fog
 * with world-space radial fog measured from a center point on the ground plane.
 *
 * MUST be called before any materials are created.
 */
export function installRadialFog(): void {
	// Declare radial fog uniforms and vWorldPosition varying
	THREE.ShaderChunk.fog_pars_vertex = /* glsl */ `
		#ifdef USE_FOG
			varying vec3 vWorldPosition;
		#endif
	`;

	// Pass world position from vertex shader
	THREE.ShaderChunk.fog_vertex = /* glsl */ `
		#ifdef USE_FOG
			vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
		#endif
	`;

	// Declare uniforms in fragment shader
	THREE.ShaderChunk.fog_pars_fragment = /* glsl */ `
		#ifdef USE_FOG
			varying vec3 vWorldPosition;
			uniform vec3 fogCenter;
			uniform float fogInnerRadius;
			uniform float fogOuterRadius;
			uniform vec3 fogColor;
		#endif
	`;

	// Apply radial fog in fragment shader
	THREE.ShaderChunk.fog_fragment = /* glsl */ `
		#ifdef USE_FOG
			float fogDist = distance(vWorldPosition.xz, fogCenter.xz);
			float fogFactor = smoothstep(fogInnerRadius, fogOuterRadius, fogDist);
			gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
		#endif
	`;

	console.log('[RadialFog] Shader chunks patched.');
}

/**
 * Inject radial fog uniforms into a material via onBeforeCompile.
 * This is called automatically for standard materials when fog is enabled on the scene,
 * but we need to ensure our custom uniforms are available.
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
