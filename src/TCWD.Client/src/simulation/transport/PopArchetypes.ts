import { EntityType } from '../types';
import type { ArchetypeProfile } from './types';

// ── Pop Archetypes ──────────────────────────────────────────
//
// Each archetype represents a fraction of the city population with
// distinct travel patterns and mode preferences.  The scheduler
// generates trips per-archetype based on their daily schedule.

export const ARCHETYPES: readonly ArchetypeProfile[] = [
	{
		name: 'OfficeWorker',
		fraction: 0.35,
		weights: { timePenalty: -1.2, costPenalty: -0.8, cyclePref: 0.2, transitPref: 0.5 },
		schedule: [
			{ hour: 8, destination: EntityType.Office, returnHour: 17 },
			{ hour: 12, destination: EntityType.Commercial },
		],
	},
	{
		name: 'Student',
		fraction: 0.2,
		weights: { timePenalty: -0.8, costPenalty: -1.5, cyclePref: 0.8, transitPref: 0.7 },
		schedule: [
			{ hour: 9, destination: EntityType.School, returnHour: 15 },
			{ hour: 16, destination: EntityType.Leisure },
		],
	},
	{
		name: 'RemoteWorker',
		fraction: 0.15,
		weights: { timePenalty: -0.6, costPenalty: -0.5, cyclePref: 0.6, transitPref: 0.3 },
		schedule: [
			{ hour: 10, destination: EntityType.Commercial },
			{ hour: 14, destination: EntityType.Park },
		],
	},
	{
		name: 'StayAtHomeParent',
		fraction: 0.15,
		weights: { timePenalty: -1.0, costPenalty: -1.0, cyclePref: 0.3, transitPref: 0.4 },
		schedule: [
			{ hour: 9, destination: EntityType.School },
			{ hour: 10, destination: EntityType.Commercial },
			{ hour: 15, destination: EntityType.Park },
		],
	},
	{
		name: 'Retiree',
		fraction: 0.15,
		weights: { timePenalty: -0.4, costPenalty: -0.6, cyclePref: 0.1, transitPref: 0.6 },
		schedule: [
			{ hour: 10, destination: EntityType.Park },
			{ hour: 14, destination: EntityType.Leisure },
		],
	},
];
