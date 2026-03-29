import { useRef, useState, useCallback, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { createSession } from './api';
import { events } from '../core/Events';

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? '';
const STORAGE_KEY = 'tcwd-collab-session';

export type CollabRole = 'creator' | 'collaborator';

function saveSession(sessionId: string, role: CollabRole) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ sessionId, role }));
}

function loadSession(): { sessionId: string; role: CollabRole } | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function clearSession() {
  sessionStorage.removeItem(STORAGE_KEY);
}

export interface UserInfo {
  id: string;
  name: string;
  color: string;
}

export interface CollabState {
  active: boolean;
  sessionId: string | null;
  role: CollabRole | null;
  shareUrl: string | null;
  users: UserInfo[];
  me: UserInfo | null;
  error: string | null;
}

export function useCollabSession() {
  const socketRef = useRef<Socket | null>(null);
  const [state, setState] = useState<CollabState>({
    active: false,
    sessionId: null,
    role: null,
    shareUrl: null,
    users: [],
    me: null,
    error: null,
  });

  const getSocket = useCallback(() => {
    if (!socketRef.current) {
      socketRef.current = io(SERVER_URL || window.location.origin, {
        autoConnect: false,
        transports: ['websocket', 'polling'],
      });
    }
    return socketRef.current;
  }, []);

  const setupListeners = useCallback((socket: Socket, role: CollabRole) => {
    socket.on('session-joined', (data: { sessionId: string; role: string; user: UserInfo }) => {
      const shareUrl = `${window.location.origin}/s/${data.sessionId}`;

      // Update browser URL to /s/:sessionId
      window.history.replaceState(null, '', `/s/${data.sessionId}`);

      setState(s => ({
        ...s,
        active: true,
        sessionId: data.sessionId,
        role: role,
        shareUrl,
        me: data.user,
        error: null,
      }));
    });

    socket.on('users-updated', (users: UserInfo[]) => {
      setState(s => ({ ...s, users }));
    });

    socket.on('session-error', (msg: string) => {
      setState(s => ({ ...s, error: msg }));
    });

    socket.on('session-closed', () => {
      clearSession();
      events.emit('collab:socketDisconnected');
      setState({
        active: false, sessionId: null, role: null,
        shareUrl: null, users: [], me: null, error: 'Session ended by creator.',
      });
      events.emit('collab:sessionClosed');
      socket.disconnect();
    });

    // Remote cursor positions (stays on raw Socket.IO)
    socket.on('cursor-move', (data: { userId: string; color: string; name: string; x: number; y: number; z: number }) => {
      events.emit('collab:cursorMove', data);
    });

    // Notify CollabBridge that the socket is ready for Yjs sync
    events.emit('collab:socketReady', socket);
  }, []);

  const wireLocalEvents = useCallback((socket: Socket) => {
    // Cursor broadcasting stays on raw Socket.IO
    const onLocalCursor = (...args: unknown[]) => {
      const pos = args[0] as { x: number; y: number; z: number };
      socket.emit('cursor-move', pos);
    };

    events.on('collab:localCursor', onLocalCursor);

    (socket as unknown as Record<string, unknown>).__cleanupFns = [
      () => events.off('collab:localCursor', onLocalCursor),
    ];
  }, []);

  const startCollab = useCallback(async () => {
    const socket = getSocket();
    const session = await createSession();
    setupListeners(socket, 'creator');
    socket.connect();
    socket.emit('create-session', session.sessionId);
    wireLocalEvents(socket);
    saveSession(session.sessionId, 'creator');
  }, [getSocket, setupListeners, wireLocalEvents]);

  const joinCollab = useCallback((sessionId: string) => {
    const socket = getSocket();
    setupListeners(socket, 'collaborator');
    socket.connect();
    socket.emit('join-session', sessionId);
    wireLocalEvents(socket);
    saveSession(sessionId, 'collaborator');
  }, [getSocket, setupListeners, wireLocalEvents]);

  // Rejoin creator session (after refresh)
  const rejoinCollab = useCallback((sessionId: string) => {
    const socket = getSocket();
    setupListeners(socket, 'creator');
    socket.connect();
    socket.emit('rejoin-session', sessionId);
    wireLocalEvents(socket);
  }, [getSocket, setupListeners, wireLocalEvents]);

  const stopCollab = useCallback(() => {
    const socket = socketRef.current;
    if (socket) {
      events.emit('collab:socketDisconnected');
      const fns = (socket as unknown as Record<string, unknown>).__cleanupFns as Array<() => void> | undefined;
      fns?.forEach(fn => fn());
      socket.disconnect();
      socketRef.current = null;
    }
    clearSession();
    window.history.replaceState(null, '', '/');
    setState({
      active: false, sessionId: null, role: null,
      shareUrl: null, users: [], me: null, error: null,
    });
  }, []);

  const updateName = useCallback((newName: string) => {
    socketRef.current?.emit('update-name', newName);
    setState(s => s.me ? { ...s, me: { ...s.me, name: newName } } : s);
  }, []);

  const sendCursor = useCallback((x: number, y: number, z: number) => {
    socketRef.current?.emit('cursor-move', { x, y, z });
  }, []);

  // Auto-rejoin saved session on mount (handles page refresh)
  const autoRejoinedRef = useRef(false);
  useEffect(() => {
    if (autoRejoinedRef.current) return;
    const saved = loadSession();
    if (!saved) return;
    autoRejoinedRef.current = true;

    if (saved.role === 'creator') {
      rejoinCollab(saved.sessionId);
    } else {
      joinCollab(saved.sessionId);
    }
  }, [rejoinCollab, joinCollab]);

  useEffect(() => {
    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, []);

  return { ...state, startCollab, joinCollab, stopCollab, updateName, sendCursor };
}
