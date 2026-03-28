// In production (same origin), use empty string. In dev, Vite proxies /api to localhost:3001.
const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? '';

export interface SessionInfo {
  sessionId: string;
  createdAt: string;
  scene: Record<string, unknown>;
}

export async function createSession(): Promise<SessionInfo> {
  const res = await fetch(`${SERVER_URL}/api/sessions`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to create session');
  return res.json();
}

export async function getSession(id: string): Promise<SessionInfo | null> {
  const res = await fetch(`${SERVER_URL}/api/sessions/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Failed to fetch session');
  return res.json();
}
