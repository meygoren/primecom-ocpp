import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { formatDateTime } from '../lib/time';

export default function RfidTags() {
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newTag, setNewTag] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState(null);
  const [deletingTag, setDeletingTag] = useState(null);

  async function load() {
    try {
      const data = await api.getRfidTags();
      setTags(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd() {
    if (!newTag.trim()) return;
    setAdding(true);
    setAddError(null);
    try {
      await api.addRfidTag(newTag.trim(), newLabel.trim());
      setNewTag('');
      setNewLabel('');
      await load();
    } catch (err) {
      setAddError(err.message);
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(tag) {
    setDeletingTag(tag);
    try {
      await api.deleteRfidTag(tag);
      await load();
    } catch (err) {
      console.error(err);
    } finally {
      setDeletingTag(null);
    }
  }

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1280 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#f1f5f9' }}>RFID Tags</h1>
        <div style={{ fontSize: 13, color: '#8892a4', marginTop: 4 }}>Authorized charging tags</div>
      </div>

      {/* Info banner */}
      <div
        style={{
          background: '#1a2a1a',
          border: '1px solid #2d5c2a',
          borderRadius: 10,
          padding: '12px 16px',
          marginBottom: 24,
          fontSize: 13,
          color: '#8892a4',
        }}
      >
        {tags.length === 0
          ? 'No tags in the list — all RFID tags are currently accepted (open access mode).'
          : `${tags.length} tag${tags.length === 1 ? '' : 's'} in the authorized list. Only these tags will be accepted for charging.`}
      </div>

      {/* Add tag form */}
      <div
        style={{
          background: '#1a1d27',
          border: '1px solid #2e3347',
          borderRadius: 12,
          padding: 20,
          marginBottom: 24,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9', marginBottom: 14 }}>Add Tag</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontSize: 12, color: '#8892a4', display: 'block', marginBottom: 5 }}>Tag ID</label>
            <input
              type="text"
              placeholder="e.g. 04A3B2C1"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              style={{
                background: '#22263a',
                border: '1px solid #2e3347',
                borderRadius: 7,
                padding: '8px 12px',
                color: '#f1f5f9',
                fontSize: 13,
                outline: 'none',
                width: 200,
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#8892a4', display: 'block', marginBottom: 5 }}>Label (optional)</label>
            <input
              type="text"
              placeholder="e.g. John's card"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              style={{
                background: '#22263a',
                border: '1px solid #2e3347',
                borderRadius: 7,
                padding: '8px 12px',
                color: '#f1f5f9',
                fontSize: 13,
                outline: 'none',
                width: 220,
              }}
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={adding || !newTag.trim()}
            style={{
              background: adding || !newTag.trim() ? '#22263a' : '#47a141',
              border: 'none',
              borderRadius: 7,
              padding: '8px 20px',
              color: adding || !newTag.trim() ? '#8892a4' : '#fff',
              fontWeight: 600,
              fontSize: 14,
              cursor: adding || !newTag.trim() ? 'not-allowed' : 'pointer',
              height: 36,
            }}
          >
            {adding ? 'Adding...' : 'Add Tag'}
          </button>
        </div>
        {addError && (
          <div style={{ marginTop: 10, background: '#3f1515', border: '1px solid #ef4444', borderRadius: 7, padding: '8px 12px', color: '#ef4444', fontSize: 13 }}>
            {addError}
          </div>
        )}
      </div>

      {/* Tags table */}
      <div style={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 12, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#8892a4', fontSize: 13 }}>Loading...</div>
        ) : error ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#ef4444', fontSize: 13 }}>{error}</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #2e3347' }}>
                {['Tag', 'Label', 'Added', 'Actions'].map((h) => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: '#8892a4', fontWeight: 600, fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tags.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: '40px', textAlign: 'center', color: '#8892a4' }}>
                    No tags added yet. Add a tag above to restrict access.
                  </td>
                </tr>
              ) : tags.map((t) => (
                <tr key={t.tag} style={{ borderBottom: '1px solid #2e3347' }}>
                  <td style={{ padding: '12px 16px', color: '#47a141', fontWeight: 600, fontFamily: 'monospace' }}>{t.tag}</td>
                  <td style={{ padding: '12px 16px', color: '#f1f5f9' }}>{t.label || '—'}</td>
                  <td style={{ padding: '12px 16px', color: '#8892a4' }}>{t.created_at ? formatDateTime(t.created_at) : '—'}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <button
                      onClick={() => handleDelete(t.tag)}
                      disabled={deletingTag === t.tag}
                      style={{
                        background: '#3f1515',
                        border: '1px solid #ef4444',
                        borderRadius: 6,
                        padding: '4px 12px',
                        color: '#ef4444',
                        fontSize: 12,
                        fontWeight: 500,
                        cursor: deletingTag === t.tag ? 'not-allowed' : 'pointer',
                        opacity: deletingTag === t.tag ? 0.6 : 1,
                      }}
                    >
                      {deletingTag === t.tag ? 'Removing...' : 'Remove'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
