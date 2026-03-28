import { useContext } from 'react';
import { EngineContext } from '../EngineContext';
import type { Engine } from '../../core/Engine';

export function useEngine(): Engine {
	const engine = useContext(EngineContext);
	if (!engine) throw new Error('useEngine must be used within EngineContext');
	return engine;
}
