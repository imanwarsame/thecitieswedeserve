import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getSession } from './api';
import { SessionContext } from './SessionContext';
import { events } from '../core/Events';
import App from '../App';

type Status = 'loading' | 'active' | 'not_found' | 'closed';

export function SessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    if (!sessionId) { setStatus('not_found'); return; }

    let cancelled = false;
    getSession(sessionId).then((s) => {
      if (cancelled) return;
      setStatus(s ? 'active' : 'not_found');
    }).catch(() => {
      if (!cancelled) setStatus('not_found');
    });

    const onClosed = () => setStatus('closed');
    events.on('collab:sessionClosed', onClosed);

    return () => {
      cancelled = true;
      events.off('collab:sessionClosed', onClosed);
    };
  }, [sessionId]);

  if (status === 'loading') {
    return (
      <div style={styles.center}>
        <p style={styles.text}>Joining session...</p>
      </div>
    );
  }

  if (status === 'not_found') {
    return (
      <div style={styles.center}>
        <p style={styles.text}>Session expired or not found.</p>
        <a href="/" style={styles.link}>Back to home</a>
      </div>
    );
  }

  if (status === 'closed') {
    return (
      <div style={styles.center}>
        <p style={styles.text}>Session ended by the creator.</p>
        <a href="/" style={styles.link}>Start your own</a>
      </div>
    );
  }

  // Wrap App in SessionContext so SessionControls knows to auto-join
  return (
    <SessionContext.Provider value={sessionId!}>
      <App />
    </SessionContext.Provider>
  );
}

const styles = {
  center: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    background: '#0a0a0a',
    gap: '1rem',
  },
  text: {
    color: '#ccc',
    fontFamily: 'monospace',
    fontSize: '1.1rem',
  },
  link: {
    color: '#7b9',
    fontFamily: 'monospace',
    fontSize: '0.9rem',
  },
};
