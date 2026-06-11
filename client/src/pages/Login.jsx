import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err) {
      setError(err.message);
    } else {
      navigate('/');
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0f1117',
      }}
    >
      <div
        style={{
          width: 360,
          background: '#1a1d27',
          border: '1px solid #2e3347',
          borderRadius: 16,
          padding: '40px 36px',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#f1f5f9' }}>Primecom</div>
          <div style={{ fontSize: 13, color: '#8892a4', marginTop: 4 }}>OCPP Central System</div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, color: '#8892a4', display: 'block', marginBottom: 6 }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: '100%',
                background: '#22263a',
                border: '1px solid #2e3347',
                borderRadius: 8,
                padding: '10px 12px',
                color: '#f1f5f9',
                fontSize: 14,
                outline: 'none',
              }}
            />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 13, color: '#8892a4', display: 'block', marginBottom: 6 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: '100%',
                background: '#22263a',
                border: '1px solid #2e3347',
                borderRadius: 8,
                padding: '10px 12px',
                color: '#f1f5f9',
                fontSize: 14,
                outline: 'none',
              }}
            />
          </div>

          {error && (
            <div
              style={{
                background: '#3f1515',
                border: '1px solid #ef4444',
                borderRadius: 8,
                padding: '10px 12px',
                color: '#ef4444',
                fontSize: 13,
                marginBottom: 16,
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              background: loading ? '#2d5c2a' : '#47a141',
              border: 'none',
              borderRadius: 8,
              padding: '11px 0',
              color: '#fff',
              fontWeight: 600,
              fontSize: 15,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
