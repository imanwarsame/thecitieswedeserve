import { useState, useEffect, useCallback } from 'react';
import { useEngine } from '../hooks/useEngine';
import { events } from '../../core/Events';
import { BUILDING_LABELS } from '../../simulation/bridge/BuildingFactory';
import { EntityType } from '../../simulation/types';
import { Trash2 } from 'lucide-react';
import type { Entity as SimEntity } from '../../simulation';
import type { Entity } from '../../entities/Entity';
import styles from './EntityTooltip.module.css';

interface Selection {
	entity: Entity;
	simEntity: SimEntity;
	buildingType: string;
	screenX: number;
	screenY: number;
}

export function EntityTooltip() {
	const engine = useEngine();
	const [selected, setSelected] = useState<Selection | null>(null);

	// Project entity world position to screen coordinates
	const projectToScreen = useCallback((entity: Entity) => {
		const camera = engine.getIsometricCamera().getCamera();
		const canvas = engine.getRenderer().getWebGLRenderer().domElement;
		const pos = entity.position.clone();
		pos.y += 1.5; // above the object

		pos.project(camera);
		const x = (pos.x * 0.5 + 0.5) * canvas.clientWidth;
		const y = (-pos.y * 0.5 + 0.5) * canvas.clientHeight;
		return { screenX: x, screenY: y };
	}, [engine]);

	useEffect(() => {
		const onSelect = (...args: unknown[]) => {
			const data = args[0] as { cellIndex: number; entity?: Entity };
			if (!data.entity) { setSelected(null); return; }

			const bridge = engine.getSimulationBridge();
			const bt = bridge.getBuildingType(data.entity.id);
			const sim = bridge.getSimEntity(data.entity.id);

			if (bt && sim) {
				const { screenX, screenY } = projectToScreen(data.entity);
				setSelected({ entity: data.entity, simEntity: sim, buildingType: bt, screenX, screenY });
			} else {
				setSelected(null);
			}
		};

		const onDeselect = () => setSelected(null);

		events.on('grid:cellSelected', onSelect);
		events.on('grid:cellDeselected', onDeselect);
		return () => {
			events.off('grid:cellSelected', onSelect);
			events.off('grid:cellDeselected', onDeselect);
		};
	}, [engine, projectToScreen]);

	// Update screen position each frame for smooth tracking
	useEffect(() => {
		if (!selected) return;
		let raf: number;

		const update = () => {
			const { screenX, screenY } = projectToScreen(selected.entity);
			setSelected(prev => prev ? { ...prev, screenX, screenY } : null);
			raf = requestAnimationFrame(update);
		};
		raf = requestAnimationFrame(update);

		return () => cancelAnimationFrame(raf);
	}, [selected?.entity, projectToScreen]); // eslint-disable-line react-hooks/exhaustive-deps

	// Delete or ESC with keyboard
	useEffect(() => {
		if (!selected) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Delete' || e.key === 'Backspace') {
				handleRemove();
			} else if (e.key === 'Escape') {
				engine.deselectCell();
				setSelected(null);
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	const handleRemove = () => {
		if (!selected) return;
		engine.getSimulationBridge().removeBuilding(selected.entity.id);
		engine.deselectCell();
		setSelected(null);
	};

	if (!selected) return null;

	// Position tooltip above the object, clamped to viewport
	const tooltipX = Math.max(110, Math.min(selected.screenX, window.innerWidth - 110));
	const tooltipY = Math.max(10, selected.screenY - 16);

	return (
		<div
			className={styles.tooltip}
			style={{ left: tooltipX, bottom: window.innerHeight - tooltipY }}
		>
			<div className={styles.header}>
				<span className={styles.title}>
					{BUILDING_LABELS[selected.buildingType as keyof typeof BUILDING_LABELS] ?? selected.buildingType}
				</span>
				<button
					className={styles.deleteBtn}
					onClick={handleRemove}
					title="Remove (Delete)"
				>
					<Trash2 size={13} strokeWidth={2} />
				</button>
			</div>

			<div className={styles.stats}>
				<BuildingStats sim={selected.simEntity} />
			</div>

			<div className={styles.hint}>
				<span className={styles.kbd}>Del</span> remove
			</div>
		</div>
	);
}

function BuildingStats({ sim }: { sim: SimEntity }) {
	switch (sim.type) {
		case EntityType.Housing:
			return (
				<>
					<Stat label="Units" value={sim.units.toLocaleString()} />
					<Stat label="Avg kWh/yr" value={sim.avgConsumptionKWh.toLocaleString()} />
				</>
			);
		case EntityType.DataCentre:
			return (
				<>
					<Stat label="Racks" value={sim.rackCount.toLocaleString()} />
					<Stat label="PUE" value={sim.pueRatio.toFixed(2)} />
					<Stat label="IT Load" value={`${sim.itLoadMW} MW`} />
				</>
			);
		case EntityType.EnergyPlant:
			return (
				<>
					<Stat label="Fuel" value={sim.fuelType} />
					<Stat label="Capacity" value={`${sim.capacityMW} MW`} />
					<Stat label="Efficiency" value={`${(sim.efficiencyPct * 100).toFixed(0)}%`} />
					<Stat label="Cost" value={`$${sim.variableCostPerMWh}/MWh`} />
					<Stat label="CO\u2082" value={`${sim.co2PerMWh} t/MWh`} />
				</>
			);
		default:
			return null;
	}
}

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div className={styles.stat}>
			<span className={styles.statLabel}>{label}</span>
			<span className={styles.statValue}>{value}</span>
		</div>
	);
}
