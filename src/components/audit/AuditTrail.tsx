import { useState, useEffect } from 'react'
import type { AuditLog } from '../../types'
import { getStoredAuditLogs } from '../../data/api'

export default function AuditTrail() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    setLogs(getStoredAuditLogs())
  }, [])

  const filteredLogs = logs.filter(l => 
    l.action.toLowerCase().includes(search.toLowerCase()) ||
    l.details.toLowerCase().includes(search.toLowerCase()) ||
    l.userEmail.toLowerCase().includes(search.toLowerCase()) ||
    l.id.toLowerCase().includes(search.toLowerCase())
  )

  const th: React.CSSProperties = {
    padding: '10px 14px',
    textAlign: 'left',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--ink-3)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    borderBottom: '1px solid var(--bdr)',
    background: 'var(--bg)',
    position: 'sticky',
    top: 0
  }

  const td: React.CSSProperties = {
    padding: '12px 14px',
    fontSize: 12,
    borderBottom: '1px solid var(--bdr)',
    color: 'var(--ink-2)',
    verticalAlign: 'top'
  }

  return (
    <div style={{ padding: '20px 24px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--ink)' }}>HIPAA Security & Activity Audit Log</h2>
          <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>
            Immutable records of patient scans, measurement overrides, logins, and fabrication approvals.
          </p>
        </div>

        <button
          onClick={() => {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(logs, null, 2))
            const downloadAnchor = document.createElement('a')
            downloadAnchor.setAttribute("href",     dataStr)
            downloadAnchor.setAttribute("download", `ortho_measure_audit_${new Date().toISOString().split('T')[0]}.json`)
            document.body.appendChild(downloadAnchor)
            downloadAnchor.click()
            downloadAnchor.remove()
          }}
          style={{
            fontSize: 12, fontWeight: 500, padding: '6px 14px',
            borderRadius: 'var(--r)', border: '1px solid var(--bdr-2)',
            background: 'var(--surface)', color: 'var(--ink)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
          }}
        >
          <span>⤓</span> Export Audit JSON
        </button>
      </div>

      {/* Filter */}
      <div style={{ marginBottom: 14, flexShrink: 0 }}>
        <input
          type="text"
          placeholder="Filter audit logs by action, details, user, or ID..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%', padding: '8px 12px', fontSize: 13,
            background: 'var(--surface)', border: '1px solid var(--bdr)',
            borderRadius: 'var(--r)', outline: 'none', color: 'var(--ink)'
          }}
        />
      </div>

      {/* Table Container */}
      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--bdr)', borderRadius: 8 }}>
        {filteredLogs.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)' }}>
            No audit records match the filter query.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 80 }}>Log ID</th>
                <th style={{ ...th, width: 140 }}>Timestamp</th>
                <th style={{ ...th, width: 160 }}>User & Role</th>
                <th style={{ ...th, width: 180 }}>Action</th>
                <th style={th}>Operation Details</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map(l => (
                <tr key={l.id} style={{ transition: 'background 0.05s' }}>
                  <td style={{ ...td, fontFamily: 'var(--mono)', fontSize: 11 }}>{l.id}</td>
                  <td style={{ ...td, fontSize: 11 }}>{new Date(l.timestamp).toLocaleString()}</td>
                  <td style={td}>
                    <div style={{ color: 'var(--ink)', fontWeight: 500 }}>{l.userEmail}</div>
                    <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{
                        display: 'inline-block', width: 4, height: 4, borderRadius: '50%',
                        background: l.userRole === 'Doctor' ? 'var(--accent)' : 'var(--green)'
                      }} />
                      {l.userRole}
                    </div>
                  </td>
                  <td style={td}>
                    <span style={{
                      fontWeight: 500, color: 'var(--ink)', padding: '2px 6px', borderRadius: 4,
                      background: l.action.includes('Approved') ? 'var(--green-bg)' : l.action.includes('Adjust') ? 'var(--accent-bg)' : 'var(--bg)',
                      border: `1px solid ${l.action.includes('Approved') ? 'var(--green-bdr)' : l.action.includes('Adjust') ? 'var(--accent-bdr)' : 'var(--bdr)'}`
                    }}>
                      {l.action}
                    </span>
                  </td>
                  <td style={{ ...td, lineHeight: 1.4 }}>{l.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
