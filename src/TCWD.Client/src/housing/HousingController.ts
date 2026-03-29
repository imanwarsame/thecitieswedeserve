import type { HousingSystem } from './HousingSystem';
import type { GridPlacement } from '../grid/GridPlacement';
import { events } from '../core/Events';

export type HousingAction = 'build' | 'demolish' | 'none';

/**
 * Translates player input into housing operations.
 * Listens to grid cell click events and drives the HousingSystem.
 */
export class HousingController {
	private housing: HousingSystem;
	private gridPlacement: GridPlacement;
	private currentAction: HousingAction = 'none';

	constructor(housing: HousingSystem, gridPlacement: GridPlacement) {
		this.housing = housing;
		this.gridPlacement = gridPlacement;

		events.on('grid:cellClicked', this.onCellClicked);
	}

	setAction(action: HousingAction): void {
		this.currentAction = action;
	}

	getAction(): HousingAction {
		return this.currentAction;
	}

	/** Directly demolish all housing at a cell (used by the UI delete button). */
	destroy(cellIndex: number): void {
		this.handleDemolish(cellIndex);
	}

	dispose(): void {
		events.off('grid:cellClicked', this.onCellClicked);
	}

	private onCellClicked = (data: unknown): void => {
		const { cellIndex } = data as { cellIndex: number };
		if (cellIndex === undefined || cellIndex === -1) return;

		if (this.currentAction === 'build') {
			this.handleBuild(cellIndex);
		} else if (this.currentAction === 'demolish') {
			this.handleDemolish(cellIndex);
		}
	};

	private handleBuild(cellIndex: number): void {
		// Can't place housing on a cell occupied by a non-housing building
		if (!this.gridPlacement.isCellFree(cellIndex) && !this.housing.hasHousing(cellIndex)) {
			return;
		}

		const oldHeight = this.housing.getHeight(cellIndex);
		const newHeight = this.housing.placeHousing(cellIndex);

		if (newHeight > oldHeight) {
			if (oldHeight === 0) {
				this.gridPlacement.occupyCell(cellIndex);
			}
			events.emit('housing:placed', { cellIndex, height: newHeight });
		}
	}

	private handleDemolish(cellIndex: number): void {
		if (!this.housing.hasHousing(cellIndex)) return;

		this.housing.demolish(cellIndex);
		this.gridPlacement.freeCell(cellIndex);
		events.emit('housing:demolished', { cellIndex });
	}
}
