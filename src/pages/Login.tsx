import { useState } from 'react'

interface Props { onLogin: (email: string, role: 'Doctor' | 'Technician') => void }

export default function Login({ onLogin }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password) { setError('Please fill in all fields.'); return }
    setLoading(true)
    setError('')
    await new Promise(r => setTimeout(r, 600)) // swap for real auth call
    
    const normalizedEmail = email.toLowerCase().trim()
    if (normalizedEmail === 'admin@ortho.com' && password === 'password') {
      onLogin('admin@ortho.com', 'Doctor')
    } else if (normalizedEmail === 'tech@ortho.com' && password === 'password') {
      onLogin('tech@ortho.com', 'Technician')
    } else {
      setError('Invalid clinic credentials.')
      setLoading(false)
    }
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '10px 12px',
    fontSize: 13, color: 'var(--ink)',
    background: 'var(--surface)',
    border: '1px solid var(--bdr)',
    borderRadius: 'var(--r)',
    outline: 'none',
    transition: 'border-color 0.15s',
  }

  return (
    <div style={{
      height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)',
    }}>
      <div style={{ width: 360 }}>
        {/* Logo */}
        <div style={{ marginBottom: 28, textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em', marginBottom: 6 }}>
            OrthoMeasure <sup style={{ fontSize: 9, fontWeight: 600, color: 'var(--accent)', letterSpacing: 0 }}>WORKSTATION</sup>
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>Medical-Grade 3D Casting Platform</div>
        </div>

        {/* Card */}
        <form onSubmit={handleSubmit} style={{
          background: 'var(--surface)',
          border: '1px solid var(--bdr)',
          borderRadius: 10,
          padding: 26,
          display: 'flex', flexDirection: 'column', gap: 14,
          boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
        }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Clinic User Email
            </label>
            <input
              type="email" value={email} placeholder="admin@ortho.com or tech@ortho.com"
              onChange={e => setEmail(e.target.value)}
              style={inp}
              onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
              onBlur={e => (e.target.style.borderColor = 'var(--bdr)')}
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Password</label>
              <span style={{ fontSize: 11, color: 'var(--accent)', cursor: 'pointer', fontWeight: 500 }}>Forgot?</span>
            </div>
            <input
              type="password" value={password} placeholder="••••••••"
              onChange={e => setPassword(e.target.value)}
              style={inp}
              onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
              onBlur={e => (e.target.style.borderColor = 'var(--bdr)')}
            />
          </div>

          {error && (
            <div style={{ fontSize: 12, color: 'var(--red)', background: 'var(--red-bg)', border: '1px solid var(--red-bdr)', padding: '8px 10px', borderRadius: 'var(--r)' }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={{
            marginTop: 6,
            padding: '10px 0', borderRadius: 'var(--r)',
            fontSize: 13, fontWeight: 600,
            background: loading ? 'var(--accent-bg)' : 'var(--accent)',
            color: loading ? 'var(--accent)' : '#fff',
            border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s',
            boxShadow: '0 2px 4px rgba(99,102,241,0.2)'
          }}>
            {loading ? 'Authenticating Medical Node…' : 'Sign In'}
          </button>
        </form>

        <div style={{
          marginTop: 20, fontSize: 11, color: 'var(--ink-3)',
          background: 'var(--surface)', border: '1px solid var(--bdr)',
          borderRadius: 6, padding: '10px 12px', textAlign: 'center', lineHeight: 1.6
        }}>
          <strong>Demo Logins (Password: password):</strong>
          <br />
          Doctor Workspace: <code style={{ fontFamily: 'var(--mono)', color: 'var(--accent)', fontWeight: 600 }}>admin@ortho.com</code>
          <br />
          Technician Scanner: <code style={{ fontFamily: 'var(--mono)', color: 'var(--green)', fontWeight: 600 }}>tech@ortho.com</code>
        </div>
      </div>
    </div>
  )
}

