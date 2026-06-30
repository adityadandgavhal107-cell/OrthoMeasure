interface Props {
  userEmail: string
  userRole: 'Doctor' | 'Technician'
  onLogout: () => void
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}

export default function TopBar({ userEmail, userRole, onLogout, theme, onToggleTheme }: Props) {
  const initials = userEmail.split('@')[0].slice(0, 2).toUpperCase()
  
  return (
    <header style={{
      display: 'flex', alignItems: 'center', height: 48,
      padding: '0 16px', gap: 10,
      background: 'var(--surface)',
      borderBottom: '1px solid var(--bdr)',
      flexShrink: 0,
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em', marginRight: 12 }}>
        OrthoMeasure <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--accent)', verticalAlign: 'middle', background: 'var(--accent-bg)', border: '1px solid var(--accent-bdr)', padding: '1px 5px', borderRadius: 4, marginLeft: 6 }}>CLINICAL</span>
      </div>

      <div style={{ flex: 1 }} />

      {/* Theme toggle */}
      <button
        onClick={onToggleTheme}
        style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          fontSize: 14, padding: '4px 8px', borderRadius: 'var(--r)',
          color: 'var(--ink-2)', transition: 'background 0.1s'
        }}
        title="Toggle Theme Mode"
      >
        {theme === 'light' ? '🌙' : '☀️'}
      </button>

      {/* Role and Email */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink)' }}>{userEmail}</div>
          <div style={{ fontSize: 9, color: userRole === 'Doctor' ? 'var(--accent)' : 'var(--green)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {userRole} WORKSPACE
          </div>
        </div>

        {/* Initials circle */}
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          background: userRole === 'Doctor' ? 'var(--accent-bg)' : 'var(--green-bg)', 
          border: `1px solid ${userRole === 'Doctor' ? 'var(--accent-bdr)' : 'var(--green-bdr)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, color: userRole === 'Doctor' ? 'var(--accent)' : 'var(--green)',
        }}>{initials}</div>
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 20, background: 'var(--bdr)', margin: '0 4px' }} />

      {/* Logout button */}
      <button
        onClick={onLogout}
        style={{
          background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid var(--red-bdr)',
          fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 'var(--r)',
          cursor: 'pointer', transition: 'all 0.1s'
        }}
      >
        Sign Out
      </button>
    </header>
  )
}

