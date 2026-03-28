import express from 'express';
import http from 'http';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import { SessionStore } from './SessionStore.js';
import { sessionsRouter } from './routes/sessions.js';

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const CLIENT_URL = process.env.CLIENT_URL ?? 'http://localhost:5173';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const httpServer = http.createServer(app);
const store = new SessionStore();

// Socket.IO — attach to the HTTP server
const io = new Server(httpServer, {
  cors: { origin: CLIENT_URL },
});

app.use(cors({ origin: CLIENT_URL }));
app.use(express.json());

// API routes
app.use('/api/sessions', sessionsRouter(store));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// ---- Socket.IO: session rooms ----

// Track which socket created each session
const sessionCreators = new Map<string, string>(); // sessionId → socketId

// Track users per session: sessionId → Map<socketId, UserInfo>
interface UserInfo { id: string; name: string; color: string }
const sessionUsers = new Map<string, Map<string, UserInfo>>();

const COLOR_NAMES: Array<{ hex: string; label: string }> = [
  { hex: '#b0b0b0', label: 'Silver' },
  { hex: '#808080', label: 'Grey' },
  { hex: '#d0d0d0', label: 'Light' },
  { hex: '#606060', label: 'Dark' },
  { hex: '#9a9a9a', label: 'Ash' },
  { hex: '#c8c8c8', label: 'Pearl' },
  { hex: '#707070', label: 'Steel' },
  { hex: '#e0e0e0', label: 'Snow' },
];
const ANIMALS = ['Fox','Owl','Bear','Wolf','Deer','Hawk','Lynx','Hare','Crow','Pike'];

function randomUser(socketId: string): UserInfo {
  const c = COLOR_NAMES[Math.floor(Math.random() * COLOR_NAMES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  return { id: socketId, name: `${c.label} ${animal}`, color: c.hex };
}

function getUserList(sessionId: string): UserInfo[] {
  return Array.from(sessionUsers.get(sessionId)?.values() ?? []);
}

io.on('connection', (socket) => {
  let currentSession: string | null = null;
  let userInfo: UserInfo | null = null;

  socket.on('create-session', async (sessionId: string) => {
    const session = await store.getSession(sessionId);
    if (!session) return;

    currentSession = sessionId;
    userInfo = randomUser(socket.id);
    sessionCreators.set(sessionId, socket.id);

    if (!sessionUsers.has(sessionId)) sessionUsers.set(sessionId, new Map());
    sessionUsers.get(sessionId)!.set(socket.id, userInfo);

    socket.join(sessionId);
    socket.emit('session-joined', { sessionId, role: 'creator', user: userInfo });
    io.to(sessionId).emit('users-updated', getUserList(sessionId));
  });

  socket.on('join-session', async (sessionId: string) => {
    const session = await store.getSession(sessionId);
    if (!session) {
      socket.emit('session-error', 'Session not found or expired');
      return;
    }

    currentSession = sessionId;
    userInfo = randomUser(socket.id);

    if (!sessionUsers.has(sessionId)) sessionUsers.set(sessionId, new Map());
    sessionUsers.get(sessionId)!.set(socket.id, userInfo);

    socket.join(sessionId);

    // Request full state from creator
    const creatorSocketId = sessionCreators.get(sessionId);
    if (creatorSocketId) {
      io.to(creatorSocketId).emit('state-request', { requesterId: socket.id });
    }

    socket.emit('session-joined', { sessionId, role: 'collaborator', user: userInfo });
    io.to(sessionId).emit('users-updated', getUserList(sessionId));
  });

  // Creator sends full state to a specific joiner
  socket.on('state-response', (data: { targetId: string; state: unknown }) => {
    io.to(data.targetId).emit('sync-state', data.state);
  });

  // Name change
  socket.on('update-name', (newName: string) => {
    if (!currentSession || !userInfo) return;
    const trimmed = String(newName).trim().slice(0, 24);
    if (!trimmed) return;
    userInfo.name = trimmed;
    sessionUsers.get(currentSession)?.set(socket.id, userInfo);
    io.to(currentSession).emit('users-updated', getUserList(currentSession));
  });

  // Cursor position — relay to others in room (throttled by client)
  socket.on('cursor-move', (pos: { x: number; y: number; z: number }) => {
    if (!currentSession || !userInfo) return;
    socket.to(currentSession).emit('cursor-move', {
      userId: socket.id,
      color: userInfo.color,
      name: userInfo.name,
      x: pos.x, y: pos.y, z: pos.z,
    });
  });

  // Scene deltas — broadcast to everyone else in the room
  socket.on('scene-delta', (delta: unknown) => {
    if (!currentSession) return;
    socket.to(currentSession).emit('scene-delta', delta);
  });

  socket.on('disconnect', async () => {
    if (!currentSession) return;

    // Remove user from tracking
    sessionUsers.get(currentSession)?.delete(socket.id);

    // If the creator disconnects, destroy the session
    if (sessionCreators.get(currentSession) === socket.id) {
      io.to(currentSession).emit('session-closed', 'Creator left — session ended.');
      sessionCreators.delete(currentSession);
      sessionUsers.delete(currentSession);
      await store.deleteSession(currentSession);
    } else {
      io.to(currentSession).emit('users-updated', getUserList(currentSession));
    }
  });
});

// ---- Static file serving ----

const clientDist = process.env.CLIENT_DIST ?? path.resolve(__dirname, 'client');
app.use(express.static(clientDist));
app.get('{*path}', (_req, res, next) => {
  if (_req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(clientDist, 'index.html'));
});

httpServer.listen(PORT, () => {
  console.log(`[TCWD Server] listening on :${PORT}`);
  console.log(`[TCWD Server] serving client from: ${clientDist}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[TCWD Server] shutting down...');
  httpServer.close();
  await store.disconnect();
  process.exit(0);
});

export { app, httpServer as server, store, io };
