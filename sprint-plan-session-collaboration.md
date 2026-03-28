# Sprint Plan: Session-Based Real-Time Collaboration for Three.js App

## Overview

Build a **no-auth, link-sharing collaboration system** where any user can create a session, get a shareable link, and collaborators can join instantly — like Excalidraw but for a Three.js 3D environment. All scene state (objects, transforms, materials) syncs in real-time across all connected users.

---

## Recommended Architecture

### Deployment Strategy: Railway (All-in-One)

Everything runs on **Railway** — frontend, backend, and Redis — all in one project with shared internal networking.

| What | Where | Why |
|---|---|---|
| **React + Three.js frontend** | **Railway** (static site or Nixpacks) | Same project as backend, simple deploys |
| **Node.js + Socket.IO server** | **Railway** (Node.js service) | WebSocket support out of the box, always-on |
| **Redis** | **Railway** (database plugin) | One-click provisioning, auto-connects to backend |

#### Railway Setup (Sprint 1 prerequisite — 30 min)

1. Railway project already created: `thecitieswedeserve`
2. Add a **Redis** database → Railway auto-provisions it and exposes `REDIS_URL` as an env var
3. Add a **Node.js** service → point it at the `/server` subfolder for the backend
4. Add a **static site** or second service for the React frontend
5. Railway gives you public URLs for both frontend and backend
6. Backend picks up `REDIS_URL` automatically — zero config

**Cost:** Railway's free tier gives you $5/month of usage — enough for dev and light production. Redis is included. You only pay more if you get real traffic.

### Why This Stack?

| Layer | Choice | Why |
|---|---|---|
| **Real-time transport** | **Socket.IO** | Easiest WebSocket abstraction, auto-reconnects, rooms built-in |
| **Session + persistence storage** | **Redis on Railway** | Fast key-value store, TTL auto-cleanup, persists across server restarts |
| **Session IDs** | **nanoid** (8–12 chars) | Short, URL-safe, collision-resistant — no UUID ugliness in links |
| **State sync strategy** | **Operation-based (OT-lite)** | Send deltas (add/move/delete object) not full state — keeps bandwidth low |

### How It Works (30-Second Version)

```
User A clicks "New Session"
  → Server generates session ID (e.g., "k7xQ3mPv")
  → Returns shareable link: yourapp.com/s/k7xQ3mPv
  → User A connects via WebSocket, joins Socket.IO room "k7xQ3mPv"

User B opens the link
  → Server sends current scene state from Redis
  → User B joins the same Socket.IO room
  → All changes broadcast to room in real-time
```

---

## Sprint 1: Foundation (Days 1–3)

**Goal:** Users can create sessions and join via link. No real-time sync yet.

### Task 1.1 — Session ID Generation & API
**Estimate:** 3 hours

Create the backend endpoint that generates sessions.

```
POST /api/sessions → { sessionId: "k7xQ3mPv", shareUrl: "https://yourapp.com/s/k7xQ3mPv" }
GET  /api/sessions/:id → { sessionId, createdAt, scene: {} }
```

**Implementation notes:**
- Install `nanoid` — use `nanoid(8)` for short IDs
- Store session in Redis with a 24-hour TTL: `SET session:k7xQ3mPv {scene: {}, users: []} EX 86400`
- Add a simple collision check (regenerate if ID exists, astronomically unlikely but safe)

### Task 1.2 — Frontend Routing for Session Links
**Estimate:** 2 hours

- Add route `/s/:sessionId` using React Router
- When user hits this route, call `GET /api/sessions/:id`
- If session exists → load the Three.js canvas
- If session doesn't exist → show "Session expired or not found" page
- Add a "Start New Session" button on the landing page that calls `POST /api/sessions` and redirects to `/s/:newId`

### Task 1.3 — Redis Setup via Railway
**Estimate:** 1.5 hours

- Add Redis database to the Railway project: `railway add --database redis`
- Railway auto-provisions Redis and exposes `REDIS_URL` (e.g., `redis://default:password@host:port`)
- Install `ioredis` on the backend: `npm i ioredis`
- Connect using the env var Railway injects automatically:
  ```javascript
  const Redis = require('ioredis');
  const redis = new Redis(process.env.REDIS_URL);
  ```
- Create a `SessionStore` service class with methods:
  - `createSession(id)` — initialize empty scene
  - `getSession(id)` — return full state
  - `updateScene(id, delta)` — apply a change
  - `deleteSession(id)` — manual cleanup
- All keys use prefix `session:` and auto-expire after 24h
- **For local dev:** Either use Docker (`redis:7-alpine`) or connect to your Railway Redis directly using the `REDIS_URL` from your Railway dashboard (works from anywhere)

### Task 1.4 — "Copy Link" UI
**Estimate:** 1 hour

- After session creation, show the shareable URL
- Add a "Copy Link" button using `navigator.clipboard.writeText()`
- Show a small toast confirmation: "Link copied!"

**Sprint 1 deliverable:** User can create a session, get a link, share it, and another user can open that link to see the Three.js canvas (no sync yet).

---

## Sprint 2: Real-Time Connection (Days 4–7)

**Goal:** Multiple users connect to the same session via WebSocket and see each other's cursors/presence.

### Task 2.1 — Socket.IO Server Setup (on Railway)
**Estimate:** 3 hours

- Install `socket.io` on the backend
- Attach Socket.IO to your existing Express/HTTP server
- **Railway note:** Railway supports WebSockets natively — no extra config needed. Just make sure your server listens on `process.env.PORT` (Railway injects this)
- Configure CORS for your frontend domain:
  ```javascript
  const io = new Server(server, {
    cors: { origin: process.env.CLIENT_URL || 'http://localhost:3000' }
  });
  ```
- Handle connection lifecycle:

```javascript
io.on('connection', (socket) => {
  socket.on('join-session', (sessionId) => {
    socket.join(sessionId);
    // Send current state to the new user
    const state = await sessionStore.getSession(sessionId);
    socket.emit('sync-state', state);
    // Notify others
    socket.to(sessionId).emit('user-joined', { userId: socket.id });
  });

  socket.on('disconnect', () => {
    socket.to(sessionId).emit('user-left', { userId: socket.id });
  });
});
```

### Task 2.2 — Socket.IO Client Integration
**Estimate:** 2 hours

- Install `socket.io-client`
- Create a `useSession(sessionId)` React hook that:
  - Connects to Socket.IO on mount
  - Emits `join-session` with the session ID
  - Listens for `sync-state` to initialize the scene
  - Returns `{ connected, users, emit }` for the rest of the app
- Clean up connection on unmount

### Task 2.3 — User Presence (Who's in the Session)
**Estimate:** 3 hours

- Assign each connecting user a random color and name (e.g., "Blue Penguin", "Red Fox") using a small word list
- Track connected users in Redis: `HSET session:k7xQ3mPv:users <socketId> {color, name, cursor}`
- Show a small avatar bar in the top-right corner of the canvas showing who's connected
- Remove users from the list on disconnect

### Task 2.4 — 3D Cursor Broadcasting
**Estimate:** 4 hours

- Use Three.js raycasting to get each user's pointer position in 3D space
- Throttle cursor updates to ~15fps (every 66ms) to save bandwidth
- Broadcast via Socket.IO: `socket.emit('cursor-move', { x, y, z })`
- Render other users' cursors as small colored spheres or pointer meshes in the scene
- Use `lerp` to smoothly interpolate cursor positions between updates

**Sprint 2 deliverable:** Multiple users in the same session, see each other's cursors moving in 3D space, presence indicator showing who's connected.

---

## Sprint 3: Scene State Sync (Days 8–12)

**Goal:** When one user adds, moves, or modifies a 3D object, all other users see the change instantly.

### Task 3.1 — Define the Scene Delta Protocol
**Estimate:** 3 hours

Design the message format for scene changes. Keep it operation-based (not full-state dumps):

```typescript
type SceneDelta =
  | { op: 'add',    objectId: string, data: SerializedObject }
  | { op: 'update', objectId: string, changes: Partial<SerializedObject> }
  | { op: 'delete', objectId: string }
  | { op: 'select', objectId: string, userId: string }

type SerializedObject = {
  id: string;
  type: 'mesh' | 'light' | 'group' | 'camera';
  geometry?: { type: string, params: any };
  material?: { type: string, params: any };
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  // ... other properties
}
```

### Task 3.2 — Object Serialization Layer
**Estimate:** 5 hours

- Create `serializeObject(threeObj)` — converts a Three.js object to the JSON format above
- Create `deserializeObject(data)` — creates a Three.js object from JSON
- Handle common types: BoxGeometry, SphereGeometry, PlaneGeometry, MeshStandardMaterial, lights, groups
- Store each object with a unique `nanoid` so it can be referenced across clients

### Task 3.3 — Broadcast Scene Changes
**Estimate:** 4 hours

- Whenever a user performs an action (add object, move object, change material, delete):
  1. Apply the change locally in Three.js
  2. Emit the delta to Socket.IO: `socket.emit('scene-delta', delta)`
  3. Server receives it, updates Redis, and broadcasts to the room:
     ```javascript
     socket.on('scene-delta', async (delta) => {
       await sessionStore.updateScene(sessionId, delta);
       socket.to(sessionId).emit('scene-delta', delta);
     });
     ```
  4. Other clients receive the delta and apply it to their local Three.js scene

### Task 3.4 — Transform Sync (Move/Rotate/Scale)
**Estimate:** 5 hours

- This is the highest-frequency operation — users dragging objects around
- Throttle transform updates to ~20fps using `requestAnimationFrame` + timestamp check
- Send only the changed transform, not the full object:
  ```javascript
  { op: 'update', objectId: 'abc123', changes: { position: [1, 2, 3] } }
  ```
- On receiving end, use `lerp`/`slerp` (for quaternions) to smoothly interpolate transforms
- Batch rapid successive updates into a single emit

### Task 3.5 — Initial State Sync for Late Joiners
**Estimate:** 3 hours

- When a new user joins, they need the full current scene
- On `join-session`, server reads all objects from Redis and sends as `sync-state`
- Client receives `sync-state` and bulk-deserializes all objects into the scene
- After initial sync, switch to delta-only updates
- Add a loading spinner while initial sync is in progress

**Sprint 3 deliverable:** Full scene synchronization — add, move, modify, delete objects and all users see changes in real-time with smooth interpolation.

---

## Sprint 4: Conflict Resolution & Polish (Days 13–16)

**Goal:** Handle edge cases, prevent conflicts, and make the experience smooth.

### Task 4.1 — Object Locking (Optimistic)
**Estimate:** 4 hours

- When a user selects an object for editing, broadcast a `select` event
- Other clients show a colored outline on that object (matching the user's color)
- Prevent other users from editing a locked object (show tooltip: "Being edited by Blue Penguin")
- Auto-release lock after 10 seconds of inactivity or on deselect
- Store locks in Redis with short TTL: `SET lock:k7xQ3mPv:abc123 <userId> EX 10`

### Task 4.2 — Reconnection & State Recovery
**Estimate:** 4 hours

- Socket.IO handles reconnection automatically, but you need to re-sync state
- On reconnect: re-join the room and request `sync-state` again
- Show a subtle "Reconnecting..." banner during disconnection
- If the session has expired during disconnection, show "Session ended" message
- Handle the case where user's local changes happened while disconnected (queue and replay)

### Task 4.3 — Undo/Redo Per User
**Estimate:** 5 hours

- Maintain a per-user operation stack (local only, not synced)
- Each delta pushed to the stack has an inverse operation:
  - `add` → inverse is `delete`
  - `delete` → inverse is `add` (store the deleted object data)
  - `update` → inverse is `update` with previous values
- Ctrl+Z pops the stack and emits the inverse delta
- Ctrl+Shift+Z redoes
- Clear another user's changes from your undo stack if they modify the same object

### Task 4.4 — Session Expiry & Cleanup
**Estimate:** 2 hours

- Redis TTL handles automatic expiry (24h default)
- Add a "session heartbeat" — extend TTL while users are active
- When last user disconnects, start a 1-hour countdown (reduce TTL)
- Add an optional "Download Scene" button so users can export before session expires
- Show "Session expires in X hours" indicator

### Task 4.5 — Rate Limiting & Abuse Prevention
**Estimate:** 2 hours

- Limit session creation: max 10 sessions per IP per hour (use `express-rate-limit`)
- Limit WebSocket messages: max 60 deltas per second per user (drop extras silently)
- Max 20 users per session (configurable)
- Max scene size: 500 objects per session
- Add basic input validation on all incoming deltas (check types, bounds)

**Sprint 4 deliverable:** Robust collaboration with conflict handling, reconnection recovery, undo/redo, and basic abuse prevention.

---

## Sprint 5: Polish & Performance (Days 17–20)

**Goal:** Quality-of-life features that make the experience feel polished.

### Task 5.1 — Session Persistence via Redis Snapshots
**Estimate:** 3 hours

- Use Redis `PERSIST` + extended TTL to allow "pinned" sessions (up to 7 days)
- Save scene snapshots as versioned Redis keys: `snapshot:k7xQ3mPv:<timestamp>`
- Allow session creators to "pin" a session (extends TTL from 24h to 7 days)
- Add `GET /api/sessions/:id/export` to download scene as JSON or glTF
- Redis already persists data across Railway server restarts — no extra database needed

### Task 5.2 — Chat / Comments
**Estimate:** 3 hours

- Simple text chat sidebar using the existing Socket.IO connection
- Messages are ephemeral (not persisted, gone when session ends)
- Show chat messages with the user's assigned color and name
- Optional: 3D annotations — click a point in space to leave a comment bubble

### Task 5.3 — Viewport Indicators
**Estimate:** 3 hours

- Show other users' camera frustums as semi-transparent wireframes in the scene
- Add a "Follow User" button to sync your camera to another user's view
- Mini-map showing all users' positions in the scene

### Task 5.4 — Performance Optimization
**Estimate:** 4 hours

- Implement spatial partitioning — only sync objects near the user's viewport
- Use binary encoding (MessagePack via `socket.io-msgpack-parser`) instead of JSON for ~30% smaller payloads
- Batch multiple deltas into single WebSocket frames (accumulate for 50ms then flush)
- Add compression for initial state sync (large scenes)

---

## Quick Reference: Key Libraries

| Purpose | Library | Install |
|---|---|---|
| WebSocket | `socket.io` + `socket.io-client` | `npm i socket.io socket.io-client` |
| Session IDs | `nanoid` | `npm i nanoid` |
| Redis client | `ioredis` | `npm i ioredis` |
| Rate limiting | `express-rate-limit` | `npm i express-rate-limit` |
| Binary encoding | `socket.io-msgpack-parser` | `npm i socket.io-msgpack-parser` |
| Random names | `unique-names-generator` | `npm i unique-names-generator` |

---

## Total Estimated Timeline

| Sprint | Focus | Duration | Key Outcome |
|---|---|---|---|
| **Sprint 1** | Foundation | 3 days | Sessions exist, links work |
| **Sprint 2** | Real-time connection | 4 days | Users see each other |
| **Sprint 3** | Scene sync | 5 days | Objects sync across users |
| **Sprint 4** | Conflict resolution | 4 days | Reliable, polished collab |
| **Sprint 5** | Polish & performance | 4 days | Chat, snapshots, perf |

**Total: ~20 working days for a fully functional collaboration system.**

---

## Architecture Diagram

```
                          RAILWAY PROJECT: thecitieswedeserve
  ┌─────────────────────────────────────────────────────────────────────┐
  │                                                                     │
  │  ┌──────────────────┐     ┌──────────────────┐     ┌─────────────┐  │
  │  │  Frontend         │     │  Backend          │     │  Redis      │  │
  │  │  (React+Three.js) │     │  (Node.js +       │────►│  (database  │  │
  │  │                   │────►│   Socket.IO)       │     │   plugin)   │  │
  │  │  Static site or   │ API │                    │◄────│             │  │
  │  │  Nixpacks build   │ +WSS│  PORT=auto         │     │  REDIS_URL  │  │
  │  └──────────────────┘     └──────────────────┘     │  =auto       │  │
  │         ▲                        ▲                  └─────────────┘  │
  │         │                        │                                   │
  └─────────┼────────────────────────┼───────────────────────────────────┘
            │                        │
     ┌──────┴──────┐          ┌──────┴──────┐
     │  Client A    │          │  Client B    │
     │  (Browser)   │          │  (Browser)   │
     └─────────────┘          └─────────────┘

  ENV VARS (auto-injected by Railway):
    REDIS_URL=redis://default:***@host:port
    PORT=<assigned by Railway>
    CLIENT_URL=https://<frontend-service>.up.railway.app
```

---

## Key Design Decisions & Rationale

**Why Socket.IO over raw WebSockets?** Built-in rooms (perfect for sessions), automatic reconnection, fallback to long-polling, and a massive ecosystem. The overhead is negligible.

**Why Redis for everything (no MongoDB)?** Redis already persists data across Railway server restarts. With TTL-based expiry for sessions and snapshot keys for pinned sessions, there's no need for a separate database. One fewer service to manage, lower cost, simpler architecture. If you ever need long-term persistence beyond 7 days, you can add a database later.

**Why Railway for everything?** WebSocket support out of the box (many PaaS don't support this well), one-click Redis plugin with auto-injected env vars, generous free tier ($5/month), and git-push deploys. Frontend, backend, and Redis all live in one Railway project with zero DevOps and shared internal networking.

**Why operation-based sync over CRDT?** CRDTs (like Yjs or Automerge) are powerful but add significant complexity for 3D scene data. For a Three.js app where objects have clear ownership moments (one person moves an object at a time), simple operation broadcasting with optimistic locking is much easier to implement and debug. You can always upgrade to CRDTs later if needed.

**Why no authentication?** Removing auth is a feature, not a shortcut. It eliminates the biggest friction point for collaboration. Session IDs are unguessable (nanoid), so "knowing the link" is the authentication. This is exactly how Excalidraw works.
