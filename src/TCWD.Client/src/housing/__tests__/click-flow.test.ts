import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildGrid, type BuiltGrid } from '../../grid/GridBuilder';
import { GridPlacement } from '../../grid/GridPlacement';
import { HousingSystem } from '../HousingSystem';
import { HousingController } from '../HousingController';
import { HousingConfig } from '../HousingConfig';
import { events } from '../../core/Events';

/**
 * Integration test simulating the exact Engine click flow:
 * 1. Engine emits 'grid:cellClicked' with cellIndex
 * 2. HousingController receives it
 * 3. HousingController calls HousingSystem.placeHousing()
 * 4. Mesh should be generated (we skip mesh since no Three.js in tests)
 */

let grid: BuiltGrid;
let placement: GridPlacement;
let housing: HousingSystem;
let controller: HousingController;
let centerCell: number;

beforeEach(() => {
	events.clear();
	grid = buildGrid();
	placement = new GridPlacement(grid);
	centerCell = grid.query.findCell(0, 0);

	// HousingSystem without mesh generator (pass null group — will skip mesh)
	// We test the data flow, not the rendering
	housing = new HousingSystem(grid, null as never, null as never);
	controller = new HousingController(housing, placement);
});

describe('Click flow integration', () => {
	it('controller starts with action=none', () => {
		expect(controller.getAction()).toBe('none');
	});

	it('clicking without setting action=build does nothing', () => {
		events.emit('grid:cellClicked', { cellIndex: centerCell });
		expect(housing.getHeight(centerCell)).toBe(0);
	});

	it('setting action=build then clicking places housing', () => {
		controller.setAction('build');
		events.emit('grid:cellClicked', { cellIndex: centerCell });
		expect(housing.getHeight(centerCell)).toBe(1);
	});

	it('clicking twice stacks to height 2', () => {
		controller.setAction('build');
		events.emit('grid:cellClicked', { cellIndex: centerCell });
		events.emit('grid:cellClicked', { cellIndex: centerCell });
		expect(housing.getHeight(centerCell)).toBe(2);
	});

	it('cell is marked occupied after first placement', () => {
		controller.setAction('build');
		expect(placement.isCellFree(centerCell)).toBe(true);
		events.emit('grid:cellClicked', { cellIndex: centerCell });
		expect(placement.isCellFree(centerCell)).toBe(false);
	});

	it('can stack on occupied cell with housing', () => {
		controller.setAction('build');
		events.emit('grid:cellClicked', { cellIndex: centerCell });
		// Cell is now occupied
		expect(placement.isCellFree(centerCell)).toBe(false);
		// But has housing, so should still stack
		events.emit('grid:cellClicked', { cellIndex: centerCell });
		expect(housing.getHeight(centerCell)).toBe(2);
	});

	it('cannot place on cell occupied by non-housing', () => {
		// Simulate a solar panel occupying the cell
		placement.occupyCell(centerCell);
		controller.setAction('build');
		events.emit('grid:cellClicked', { cellIndex: centerCell });
		expect(housing.getHeight(centerCell)).toBe(0);
	});

	it('emits housing:placed event', () => {
		const spy = vi.fn();
		events.on('housing:placed', spy);
		controller.setAction('build');
		events.emit('grid:cellClicked', { cellIndex: centerCell });
		expect(spy).toHaveBeenCalledWith({ cellIndex: centerCell, height: 1 });
	});

	it('respects maxLayers limit', () => {
		controller.setAction('build');
		for (let i = 0; i < 35; i++) {
			events.emit('grid:cellClicked', { cellIndex: centerCell });
		}
		expect(housing.getHeight(centerCell)).toBe(HousingConfig.maxLayers);
	});
});
