import { loadTexture } from './loaders/TextureLoader';
import { loadModel } from './loaders/ModelLoader';
import { events } from '../core/Events';
import type { GLTF } from './loaders/ModelLoader';
import type * as THREE from 'three';

type AssetType = 'texture' | 'model';

interface AssetEntry {
	path: string;
	type: AssetType;
}

export class AssetManager {
	private registry = new Map<string, AssetEntry>();
	private cache = new Map<string, THREE.Texture | GLTF>();
	private loading = new Set<string>();
	private loaded = 0;
	private total = 0;
	private onProgress: ((loaded: number, total: number) => void) | null = null;

	register(id: string, path: string, type: AssetType): void {
		if (this.registry.has(id)) {
			console.warn(`[AssetManager] Asset "${id}" already registered.`);
			return;
		}
		this.registry.set(id, { path, type });
	}

	setProgressCallback(cb: (loaded: number, total: number) => void): void {
		this.onProgress = cb;
	}

	async preload(ids?: string[]): Promise<void> {
		const targets = ids
			? ids.filter(id => this.registry.has(id))
			: Array.from(this.registry.keys());

		const toLoad = targets.filter(id => !this.cache.has(id) && !this.loading.has(id));

		this.total = toLoad.length;
		this.loaded = 0;

		if (this.total === 0) {
			console.log('[AssetManager] Nothing to preload.');
			return;
		}

		console.log(`[AssetManager] Preloading ${this.total} assets...`);

		const promises = toLoad.map(id => this.loadAsset(id));
		await Promise.all(promises);

		events.emit('assets:loaded');
		console.log('[AssetManager] Preload complete.');
	}

	get<T>(id: string): T {
		const asset = this.cache.get(id);
		if (!asset) {
			throw new Error(`[AssetManager] Asset "${id}" not found. Was it preloaded?`);
		}
		return asset as T;
	}

	has(id: string): boolean {
		return this.cache.has(id);
	}

	getProgress(): number {
		if (this.total === 0) return 1;
		return this.loaded / this.total;
	}

	dispose(id?: string): void {
		if (id) {
			this.disposeOne(id);
		} else {
			for (const key of this.cache.keys()) {
				this.disposeOne(key);
			}
		}
	}

	private async loadAsset(id: string): Promise<void> {
		const entry = this.registry.get(id);
		if (!entry) return;

		this.loading.add(id);

		try {
			let asset: THREE.Texture | GLTF;

			if (entry.type === 'texture') {
				asset = await loadTexture(entry.path);
			} else {
				asset = await loadModel(entry.path);
			}

			this.cache.set(id, asset);
		} catch (err) {
			console.error(`[AssetManager] Failed to load "${id}" from "${entry.path}":`, err);
		} finally {
			this.loading.delete(id);
			this.loaded++;
			this.onProgress?.(this.loaded, this.total);
		}
	}

	private disposeOne(id: string): void {
		const asset = this.cache.get(id);
		if (!asset) return;

		if ('dispose' in asset && typeof asset.dispose === 'function') {
			asset.dispose();
		}

		this.cache.delete(id);
		this.registry.delete(id);
	}
}
