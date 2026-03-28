import type { SocketId } from './SocketTypes';

/** Describes which corner pattern a tile fits. */
export interface CornerPattern {
	minBottomRatio: number;
	maxBottomRatio: number;
	minTopRatio: number;
	maxTopRatio: number;
	exactBottom?: number;
	exactTop?: number;
}

/** A face direction on a voxel. */
export type FaceDir = 'top' | 'bottom' | 'side';

/** Thermal and embodied-carbon properties for energy modeling. */
export interface EnergyProperties {
	/** Thermal transmittance W/(m²·K). Lower = better insulated. */
	uValue: number;
	/** Solar heat gain coefficient (0–1). Only meaningful for glazed tiles. */
	shgc?: number;
	/** Embodied carbon kgCO₂e/m². */
	embodiedCarbon?: number;
	/** Thermal mass kJ/(m²·K). */
	thermalMass?: number;
	/** Material classification for envelope analysis. */
	materialClass: 'opaque' | 'glazed' | 'mixed' | 'open';
}

/**
 * A tile definition — abstract identity, not geometry.
 * Sprint 04 maps each tile id to a mesh generator function.
 */
export interface TileDef {
	id: string;
	label: string;
	pattern: CornerPattern;
	topSocket: SocketId;
	bottomSocket: SocketId;
	sideSocket: SocketId;
	weight: number;
	requiresSupport: boolean;
	energy: EnergyProperties;
}

export class TileRegistry {
	private tiles = new Map<string, TileDef>();

	register(tile: TileDef): void {
		this.tiles.set(tile.id, tile);
	}

	get(id: string): TileDef | undefined {
		return this.tiles.get(id);
	}

	/**
	 * Get all tiles that match a given corner pattern.
	 * Used to build the initial candidate set for a voxel.
	 */
	getCandidates(
		bottomSolidCount: number,
		topSolidCount: number,
		totalVertices: number,
		hasSupport: boolean,
	): TileDef[] {
		const bottomRatio = totalVertices > 0 ? bottomSolidCount / totalVertices : 0;
		const topRatio = totalVertices > 0 ? topSolidCount / totalVertices : 0;

		return Array.from(this.tiles.values()).filter(tile => {
			const p = tile.pattern;

			if (tile.requiresSupport && !hasSupport) return false;
			if (p.exactBottom !== undefined && p.exactBottom !== bottomSolidCount) return false;
			if (p.exactTop !== undefined && p.exactTop !== topSolidCount) return false;
			if (bottomRatio < p.minBottomRatio || bottomRatio > p.maxBottomRatio) return false;
			if (topRatio < p.minTopRatio || topRatio > p.maxTopRatio) return false;

			return true;
		});
	}

	getAll(): TileDef[] {
		return Array.from(this.tiles.values());
	}
}
