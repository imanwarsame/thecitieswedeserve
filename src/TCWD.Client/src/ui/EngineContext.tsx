import { createContext } from 'react';
import type { Engine } from '../core/Engine';

export const EngineContext = createContext<Engine | null>(null);
