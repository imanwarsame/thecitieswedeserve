import { createContext, useContext } from 'react';

/** If set, the app was loaded via /s/:sessionId and should auto-join collab. */
export const SessionContext = createContext<string | null>(null);

export function useJoinSessionId(): string | null {
  return useContext(SessionContext);
}
