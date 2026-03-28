import { Router } from 'express';
import { nanoid } from 'nanoid';
import type { SessionStore } from '../SessionStore.js';

const MAX_ID_ATTEMPTS = 3;

export function sessionsRouter(store: SessionStore): Router {
  const router = Router();

  // Create a new session
  router.post('/', async (_req, res) => {
    for (let i = 0; i < MAX_ID_ATTEMPTS; i++) {
      const id = nanoid(8);
      try {
        const session = await store.createSession(id);
        res.status(201).json({
          sessionId: session.sessionId,
          createdAt: session.createdAt,
        });
        return;
      } catch (err: unknown) {
        if (err instanceof Error && err.message === 'SESSION_EXISTS') continue;
        throw err;
      }
    }
    res.status(503).json({ error: 'Could not generate unique session ID' });
  });

  // Get session by ID
  router.get('/:id', async (req, res) => {
    const session = await store.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found or expired' });
      return;
    }
    res.json(session);
  });

  // Delete session
  router.delete('/:id', async (req, res) => {
    const deleted = await store.deleteSession(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json({ ok: true });
  });

  return router;
}
