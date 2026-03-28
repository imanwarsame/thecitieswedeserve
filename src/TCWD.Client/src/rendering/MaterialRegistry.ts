import * as THREE from 'three';
import { Palette } from './Palette';
import { patchMaterialUniforms } from './RadialFog';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MaterialRole =
	| 'structure'
	| 'detail'
	| 'accent'
	| 'ground'
	| 'glass'
	| 'metal'
	| 'foliage'
	| 'custom';

export interface MaterialDef {
	/** Unique key used to look up this material (e.g. 'concrete', 'window-glass'). */
	key: string;
	/** Semantic role — drives default roughness / metalness when not overridden. */
	role: MaterialRole;
	/** Override color. Falls back to Palette color for the role. */
	color?: number;
	/** 0–1. Defaults from role. */
	roughness?: number;
	/** 0–1. Defaults from role. */
	metalness?: number;
	/** Opacity 0–1. If < 1, material is set transparent automatically. */
	opacity?: number;
	/** If true, material receives shadows. Default true. */
	receiveShadow?: boolean;
	/** If true, mesh casts shadows. Default true. */
	castShadow?: boolean;
}

/** A bundle of materials keyed by mesh-name patterns. */
export interface MaterialPreset {
	/** Unique name for this preset (e.g. 'house-wooden', 'office-tower'). */
	name: string;
	/**
	 * Maps a mesh-name pattern to a material key.
	 * Pattern matching: exact match first, then startsWith, then includes.
	 * The special key '*' is a fallback for any unmatched mesh.
	 */
	meshMaterials: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Role defaults
// ---------------------------------------------------------------------------

const ROLE_DEFAULTS: Record<MaterialRole, { color: number; roughness: number; metalness: number }> = {
	structure: { color: Palette.structure, roughness: 0.9, metalness: 0.0 },
	detail:    { color: Palette.detail,    roughness: 0.85, metalness: 0.0 },
	accent:    { color: Palette.accent,    roughness: 0.8, metalness: 0.0 },
	ground:    { color: Palette.ground,    roughness: 1.0, metalness: 0.0 },
	glass:     { color: 0xe8e8e8,          roughness: 0.1, metalness: 0.0 },   // clean glass
	metal:     { color: 0xd0d0d0,          roughness: 0.4, metalness: 0.5 },   // neutral metal
	foliage:   { color: 0xb8d8b8,          roughness: 0.95, metalness: 0.0 },  // pastel green
	custom:    { color: Palette.structure,  roughness: 0.9, metalness: 0.0 },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export class MaterialRegistry {
	private materials = new Map<string, THREE.MeshStandardMaterial>();
	private definitions = new Map<string, MaterialDef>();
	private presets = new Map<string, MaterialPreset>();
	private clonedMaterials = new Set<THREE.MeshStandardMaterial>();

	constructor() {
		// Register built-in materials that match the existing factory functions
		this.define({ key: 'ground',    role: 'ground' });
		this.define({ key: 'road',      role: 'ground', color: Palette.road });
		this.define({ key: 'water',     role: 'glass',  color: Palette.water, opacity: 0.55, roughness: 0.15 });
		this.define({ key: 'structure', role: 'structure' });
		this.define({ key: 'detail',    role: 'detail' });
		this.define({ key: 'accent',    role: 'accent' });
		this.define({ key: 'glass',     role: 'glass', opacity: 0.4 });
		this.define({ key: 'metal',     role: 'metal' });
		this.define({ key: 'foliage',   role: 'foliage' });
		this.define({ key: 'building-white', role: 'structure', color: 0xf2f2f2, roughness: 0.95, metalness: 0.0 });
	}

	// ---- Define & register ------------------------------------------------

	/** Register a material definition. Creates the Three.js material lazily. */
	define(def: MaterialDef): void {
		this.definitions.set(def.key, def);
		// Invalidate any cached instance so next get() rebuilds it
		const existing = this.materials.get(def.key);
		if (existing) {
			existing.dispose();
			this.materials.delete(def.key);
		}
	}

	/** Register a preset (named bundle of mesh→material mappings). */
	definePreset(preset: MaterialPreset): void {
		this.presets.set(preset.name, preset);
	}

	// ---- Retrieve ---------------------------------------------------------

	/** Get (or lazily create) a Three.js material by key. */
	get(key: string): THREE.MeshStandardMaterial {
		let mat = this.materials.get(key);
		if (mat) return mat;

		const def = this.definitions.get(key);
		if (!def) {
			console.warn(`[MaterialRegistry] Unknown material "${key}", falling back to structure.`);
			return this.get('structure');
		}

		mat = this.build(def);
		this.materials.set(key, mat);
		return mat;
	}

	/** Get a preset by name. */
	getPreset(name: string): MaterialPreset | undefined {
		return this.presets.get(name);
	}

	/** Check if a material key is registered. */
	has(key: string): boolean {
		return this.definitions.has(key);
	}

	/** List all registered material keys. */
	keys(): string[] {
		return Array.from(this.definitions.keys());
	}

	// ---- Apply to model ---------------------------------------------------

	/**
	 * Override every material on a GLTF scene graph with monochrome palette
	 * materials. If a preset name is provided, mesh names are matched to
	 * specific materials; otherwise all meshes get the 'structure' material.
	 */
	applyToModel(root: THREE.Object3D, presetName?: string): void {
		const preset = presetName ? this.presets.get(presetName) : undefined;

		root.traverse((child) => {
			if (!(child instanceof THREE.Mesh)) return;

			const materialKey = preset
				? this.resolveMeshMaterial(child.name, preset)
				: 'structure';

			// Clone so each mesh instance has its own material
			const baseMat = this.get(materialKey);
			const cloned = baseMat.clone();
			patchMaterialUniforms(cloned);
			this.clonedMaterials.add(cloned);

			// Dispose the original material(s) from the GLTF
			if (Array.isArray(child.material)) {
				child.material.forEach(m => m.dispose());
			} else {
				child.material.dispose();
			}

			child.material = cloned;
			child.castShadow = true;
			child.receiveShadow = true;
		});
	}

	// ---- Lifecycle --------------------------------------------------------

	/** Dispose all cloned materials on a model (call when removing an entity). */
	disposeModelMaterials(root: THREE.Object3D): void {
		root.traverse((child) => {
			if (!(child instanceof THREE.Mesh)) return;
			const mats = Array.isArray(child.material) ? child.material : [child.material];
			for (const mat of mats) {
				mat.dispose();
				this.clonedMaterials.delete(mat as THREE.MeshStandardMaterial);
			}
		});
	}

	/** Swap all materials on a model to a new preset without removing it from scene. */
	swapModelMaterials(root: THREE.Object3D, newPresetName: string): void {
		this.disposeModelMaterials(root);
		this.applyToModel(root, newPresetName);
	}

	/** Get count of active cloned materials (for debug UI). */
	getClonedCount(): number {
		return this.clonedMaterials.size;
	}

	// ---- Cleanup ----------------------------------------------------------

	dispose(): void {
		for (const mat of this.materials.values()) {
			mat.dispose();
		}
		for (const mat of this.clonedMaterials) {
			mat.dispose();
		}
		this.materials.clear();
		this.definitions.clear();
		this.presets.clear();
		this.clonedMaterials.clear();
	}

	// ---- Private ----------------------------------------------------------

	private build(def: MaterialDef): THREE.MeshStandardMaterial {
		const defaults = ROLE_DEFAULTS[def.role];

		const mat = new THREE.MeshStandardMaterial({
			color: def.color ?? defaults.color,
			roughness: def.roughness ?? defaults.roughness,
			metalness: def.metalness ?? defaults.metalness,
		});

		if (def.opacity !== undefined && def.opacity < 1) {
			mat.transparent = true;
			mat.opacity = def.opacity;
		}

		mat.name = def.key;

		// Patch for radial fog support
		patchMaterialUniforms(mat);

		return mat;
	}

	/**
	 * Match a mesh name to a material key using the preset's meshMaterials map.
	 * Priority: exact match → startsWith → includes → fallback '*' → 'structure'.
	 */
	private resolveMeshMaterial(meshName: string, preset: MaterialPreset): string {
		const map = preset.meshMaterials;
		const lower = meshName.toLowerCase();

		// Exact match
		if (map[meshName]) return map[meshName];
		if (map[lower]) return map[lower];

		// startsWith
		for (const [pattern, key] of Object.entries(map)) {
			if (pattern !== '*' && lower.startsWith(pattern.toLowerCase())) return key;
		}

		// includes
		for (const [pattern, key] of Object.entries(map)) {
			if (pattern !== '*' && lower.includes(pattern.toLowerCase())) return key;
		}

		// Fallback
		return map['*'] ?? 'structure';
	}
}
