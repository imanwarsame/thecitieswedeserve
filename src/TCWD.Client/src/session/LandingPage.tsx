import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createSession } from './api';

export function LandingPage() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const session = await createSession();
      const url = `${window.location.origin}/s/${session.sessionId}`;
      setShareUrl(url);
    } catch {
      alert('Failed to create session. Is the server running?');
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleJoin = () => {
    if (!shareUrl) return;
    const id = shareUrl.split('/s/')[1];
    navigate(`/s/${id}`);
  };

  return (
    <div style={styles.root}>
      <h1 style={styles.title}>The Cities We Deserve</h1>
      <p style={styles.subtitle}>Collaborative city building in real-time</p>

      {!shareUrl ? (
        <button onClick={handleCreate} disabled={creating} style={styles.button}>
          {creating ? 'Creating...' : 'Start New Session'}
        </button>
      ) : (
        <div style={styles.shareBox}>
          <p style={styles.label}>Session created! Share this link:</p>
          <div style={styles.urlRow}>
            <code style={styles.url}>{shareUrl}</code>
            <button onClick={handleCopy} style={styles.copyBtn}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <button onClick={handleJoin} style={styles.button}>
            Join Session
          </button>
        </div>
      )}
    </div>
  );
}

const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    background: '#0a0a0a',
    gap: '1.5rem',
  },
  title: {
    color: '#e0e0e0',
    fontFamily: 'monospace',
    fontSize: '2rem',
    margin: 0,
  },
  subtitle: {
    color: '#888',
    fontFamily: 'monospace',
    fontSize: '0.95rem',
    margin: 0,
  },
  button: {
    padding: '0.75rem 2rem',
    background: '#1a3a2a',
    color: '#7b9',
    border: '1px solid #2a4a3a',
    borderRadius: '4px',
    fontFamily: 'monospace',
    fontSize: '1rem',
    cursor: 'pointer',
  },
  shareBox: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '1rem',
  },
  label: {
    color: '#aaa',
    fontFamily: 'monospace',
    fontSize: '0.9rem',
    margin: 0,
  },
  urlRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  url: {
    color: '#7b9',
    background: '#111',
    padding: '0.5rem 1rem',
    borderRadius: '4px',
    fontFamily: 'monospace',
    fontSize: '0.85rem',
  },
  copyBtn: {
    padding: '0.5rem 1rem',
    background: '#222',
    color: '#ccc',
    border: '1px solid #333',
    borderRadius: '4px',
    fontFamily: 'monospace',
    cursor: 'pointer',
  },
};
