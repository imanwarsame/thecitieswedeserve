import { useState, useEffect } from 'react';
import { useEngine } from '../hooks/useEngine';
import { events } from '../../core/Events';
import { BUILDING_LABELS } from '../../simulation/bridge/BuildingFactory';
import { EntityType } from '../../simulation/types';
import type { Entity as SimEntity } from '../../simulation';
import type { Entity } from '../../entities/Entity';
import styles from './SidePanel.module.css';

export function SidePanel() {
	const engine = useEngine();
	const [collapsed, setCollapsed] = useState(true);
	const [selected, setSelected] = useState<{
		entity: Entity;
		simEntity: SimEntity;
		buildingType: string;
	} | null>(null);

	useEffect(() => {
		const onSelect = (...args: unknown[]) => {
			const data = args[0] as { cellIndex: number; entity?: Entity };
			if (!data.entity) { setSelected(null); return; }
			const bridge = engine.getSimulationBridge();
			const bt = bridge.getBuildingType(data.entity.id);
			const sim = bridge.getSimEntity(data.entity.id);
			if (bt && sim) {
				setSelected({ entity: data.entity, simEntity: sim, buildingType: bt });
				setCollapsed(false);
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
	}, [engine]);

	const handleRemove = () => {
		if (!selected) return;
		engine.getSimulationBridge().removeBuilding(selected.entity.id);
		engine.deselectCell();
		setSelected(null);
	};

	return (
		<div
			className={`${styles.anchor} ${collapsed ? styles.anchorCollapsed : styles.anchorOpen}`}
		>
			{!collapsed && (
				<div className={styles.panel}>
					{selected ? (
						<>
							<div className={styles.heading}>
								{BUILDING_LABELS[selected.buildingType as keyof typeof BUILDING_LABELS] ??
									selected.buildingType}
							</div>
							<div className={styles.stats}>
								<BuildingStats sim={selected.simEntity} />
							</div>
							<button
								type="button"
								className={styles.removeBtn}
								onClick={handleRemove}
							>
								Remove
							</button>
						</>
					) : (
						<span>No selection</span>
					)}
				</div>
			)}
			<button
				type="button"
				className={`${styles.toggle} ${collapsed ? styles.toggleCollapsed : styles.toggleOpen}`}
				onClick={() => setCollapsed(!collapsed)}
				aria-label={collapsed ? 'Open panel' : 'Close panel'}
			>
				{collapsed ? '\u25C0' : '\u25B6'}
			</button>
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
					<Stat label="CO₂" value={`${sim.co2PerMWh} t/MWh`} />
				</>
			);
		default:
			return <span>Unknown type</span>;
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
