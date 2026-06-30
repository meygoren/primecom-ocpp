import { useState, useEffect, useRef } from 'react';
import { Menu } from 'lucide-react';
import { api } from '../lib/api';

export default function TopBar({ onMenuClick }) {
  const [open,     setOpen]     = useState(false);
  const [issues,   setIssues]   = useState([]);
  const [count,    setCount]    = useState(0);
  const [loading,  setLoading]  = useState(false);
  const panelRef   = useRef();

  // Poll open issue count every 60s for the badge
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const data = await api.getIssueOpenCount();
        if (!cancelled) setCount(data.count || 0);
      } catch {}
    }
    poll();
    const iv = setInterval(poll, 60000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  // Load issue list when panel opens
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api.getIssues('?status=open&priority=high')
      .then((data) => setIssues(data.slice(0, 8)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  // Close on outside click
  useEffect(() => {
    function handler(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const PRIORITY_COLOR = { high: '#ef4444', medium: '#f59e0b', low: '#3b82f6' };

  function timeAgo(ts) {
    const diff = (Date.now() - new Date(ts)) / 1000;
    if (diff < 3600)  return `${Math.round(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
    return `${Math.round(diff / 86400)}d ago`;
  }

  return (
    <div style={{
      height: 48,
      background: '#1a1d27',
      borderBottom: '1px solid #2e3347',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 12px 0 12px',
      flexShrink: 0,
    }}>
      <button
        onClick={onMenuClick}
        className="flex md:hidden"
        style={{
          background: 'none',
          border: '1px solid #2e3347',
          borderRadius: 8,
          width: 36,
          height: 36,
          alignItems: 'center',
          justifyContent: 'center',
          color: '#8892a4',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        <Menu size={17} />
      </button>
      <div className="hidden md:block" style={{ flex: 1 }} />
      <div ref={panelRef} style={{ position: 'relative' }}>
        {/* Bell button */}
        <button
          onClick={() => setOpen((o) => !o)}
          style={{
            background: open ? '#22263a' : 'none',
            border: `1px solid ${open ? '#2e3347' : 'transparent'}`,
            borderRadius: 8,
            width: 36,
            height: 36,
            cursor: 'pointer',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Bell SVG */}
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={count > 0 ? '#f59e0b' : '#8892a4'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {/* Badge */}
          {count > 0 && (
            <span style={{
              position: 'absolute',
              top: 3,
              right: 3,
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: '#ef4444',
              color: '#fff',
              fontSize: 9,
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1.5px solid #1a1d27',
            }}>
              {count > 9 ? '9+' : count}
            </span>
          )}
        </button>

        {/* Dropdown panel */}
        {open && (
          <div style={{
            position: 'absolute',
            top: 44,
            right: 0,
            width: 340,
            background: '#1a1d27',
            border: '1px solid #2e3347',
            borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            zIndex: 500,
            overflow: 'hidden',
          }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #2e3347', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>Open Issues</span>
              <a href="/issues" style={{ fontSize: 11, color: '#47a141', textDecoration: 'none', fontWeight: 600 }}>View all →</a>
            </div>

            {loading ? (
              <div style={{ padding: '20px 18px', color: '#8892a4', fontSize: 12 }}>Loading…</div>
            ) : issues.length === 0 ? (
              <div style={{ padding: '20px 18px', color: '#8892a4', fontSize: 12, textAlign: 'center' }}>
                No open high-priority issues
              </div>
            ) : (
              issues.map((issue) => (
                <a
                  key={issue.id}
                  href="/issues"
                  style={{ display: 'flex', gap: 10, padding: '12px 18px', borderBottom: '1px solid #2e3347', textDecoration: 'none', background: 'transparent' }}
                >
                  <span style={{ width: 3, borderRadius: 2, background: PRIORITY_COLOR[issue.priority] || '#6b7280', flexShrink: 0, alignSelf: 'stretch' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {issue.title || issue.category}
                    </div>
                    <div style={{ fontSize: 11, color: '#8892a4', marginTop: 2 }}>
                      {issue.truck_number ? `Truck ${issue.truck_number} · ` : ''}{timeAgo(issue.created_at)}
                    </div>
                  </div>
                </a>
              ))
            )}

            <div style={{ padding: '10px 18px', textAlign: 'center' }}>
              <a href="/issues" style={{ fontSize: 12, color: '#47a141', textDecoration: 'none', fontWeight: 600 }}>
                Go to Issues page →
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
