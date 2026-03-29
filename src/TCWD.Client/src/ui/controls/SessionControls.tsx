import { useState, useCallback, useEffect, useRef } from 'react';
import { Copy, Check, Users, X, Pencil } from 'lucide-react';
import { useCollabSession } from '../../session/useCollabSession';
import { useJoinSessionId } from '../../session/SessionContext';
import styles from './SessionControls.module.css';

export function SessionControls() {
  const collab = useCollabSession();
  const joinSessionId = useJoinSessionId();
  const [copied, setCopied] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const joinedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-join when loaded via /s/:sessionId (collaborator)
  useEffect(() => {
    if (joinSessionId && !collab.active && !joinedRef.current) {
      joinedRef.current = true;
      collab.joinCollab(joinSessionId);
    }
  }, [joinSessionId, collab]);

  // Focus name input when editing
  useEffect(() => {
    if (editingName) inputRef.current?.focus();
  }, [editingName]);

  const handleStart = useCallback(async () => {
    await collab.startCollab();
    setShowPanel(true);
  }, [collab]);

  const handleCopy = useCallback(async () => {
    if (!collab.shareUrl) return;
    await navigator.clipboard.writeText(collab.shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [collab.shareUrl]);

  const handleStop = useCallback(() => {
    collab.stopCollab();
    setShowPanel(false);
  }, [collab]);

  const handleNameSubmit = useCallback(() => {
    const trimmed = nameInput.trim();
    if (trimmed && trimmed !== collab.me?.name) {
      collab.updateName(trimmed);
    }
    setEditingName(false);
  }, [nameInput, collab]);

  const startEditName = useCallback(() => {
    setNameInput(collab.me?.name ?? '');
    setEditingName(true);
  }, [collab.me?.name]);

  // Not active
  if (!collab.active) {
    return (
      <button
        className={styles.shareBtn}
        onClick={handleStart}
        title="Start collaboration session"
      >
        <Users size={11} strokeWidth={2.2} />
        <span>Collab</span>
      </button>
    );
  }

  // Active session
  return (
    <div className={styles.wrapper}>
      <button
        className={styles.avatarGroup}
        onClick={() => setShowPanel(!showPanel)}
        title={`${collab.users.length} user${collab.users.length > 1 ? 's' : ''} connected`}
      >
        {collab.users.map(u => {
          const initials = u.name
            .split(/\s+/)
            .map(w => w[0]?.toUpperCase() ?? '')
            .slice(0, 2)
            .join('');
          return (
            <div
              key={u.id}
              className={styles.avatar}
              style={{ background: u.color }}
              title={u.name + (u.id === collab.me?.id ? ' (you)' : '')}
            >
              <span className={styles.initials}>{initials || '?'}</span>
            </div>
          );
        })}
      </button>

      {showPanel && (
        <div className={styles.panel}>
          <div className={styles.urlRow}>
            <code className={styles.url}>{collab.shareUrl}</code>
            <button className={styles.copyBtn} onClick={handleCopy} title="Copy link">
              {copied
                ? <Check size={10} strokeWidth={2.5} />
                : <Copy size={10} strokeWidth={2} />
              }
            </button>
          </div>

          <div className={styles.userList}>
            {collab.users.map(u => (
              <div key={u.id} className={styles.userRow}>
                <div className={styles.dot} style={{ background: u.color }} />
                <span className={styles.userName}>
                  {u.name}
                </span>
                {u.id === collab.me?.id && !editingName && (
                  <button className={styles.editBtn} onClick={startEditName} title="Edit name">
                    <Pencil size={9} strokeWidth={2} />
                  </button>
                )}
                {u.id === collab.me?.id && editingName && (
                  <form
                    className={styles.nameForm}
                    onSubmit={e => { e.preventDefault(); handleNameSubmit(); }}
                  >
                    <input
                      ref={inputRef}
                      className={styles.nameInput}
                      value={nameInput}
                      onChange={e => setNameInput(e.target.value)}
                      onBlur={handleNameSubmit}
                      maxLength={24}
                    />
                  </form>
                )}
              </div>
            ))}
          </div>

          {collab.role === 'creator' && (
            <button className={styles.stopBtn} onClick={handleStop} title="End session for everyone">
              <X size={10} strokeWidth={2.2} />
              End Session
            </button>
          )}
        </div>
      )}
    </div>
  );
}
