import { useState, useEffect } from 'react'
import type { OrthoCase, CaseStatus } from '../../types'
import { fetchCases } from '../../data/api'
import { relativeTime, qColor } from '../../utils'
import StatusBadge from '../shared/StatusBadge'

interface Props { 
  selectedId: string | null
  onSelect: (c: OrthoCase) => void
  activeFilter: CaseStatus | 'all'
  onChangeFilter: (f: CaseStatus | 'all') => void
}

const FILTERS: { label: string; value: CaseStatus | 'all' }[] = [
  { label: 'All',     value: 'all'     },
  { label: 'Review',  value: 'review'  },
  { label: 'Pending', value: 'pending' },
  { label: 'Re-scan', value: 'rescan'  },
]

const th: React.CSSProperties = {
  padding: '8px 16px', textAlign: 'left',
  fontSize: 11, fontWeight: 500, color: 'var(--ink-3)',
  borderBottom: '1px solid var(--bdr)',
  background: 'var(--bg)',
  position: 'sticky', top: 0, whiteSpace: 'nowrap',
}

export default function CaseQueue({ selectedId, onSelect, activeFilter, onChangeFilter }: Props) {
  const [cases, setCases] = useState<OrthoCase[]>([])

  useEffect(() => { fetchCases(activeFilter).then(setCases) }, [activeFilter])

  return (
    <section style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
      {/* Head */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '14px 20px 10px',
        gap: 10, flexShrink: 0, borderBottom: '1px solid var(--bdr)',
      }}>
        <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em' }}>Incoming Scan Queue</span>
        <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{cases.length} cases</span>
        <div style={{ flex: 1 }} />
        {/* Segmented filter */}
        <div style={{
          display: 'flex', background: 'var(--bg)',
          border: '1px solid var(--bdr)', borderRadius: 'var(--r)',
          padding: 2, gap: 2,
        }}>
          {FILTERS.map(f => (
            <button key={f.value} onClick={() => onChangeFilter(f.value)} style={{
              fontSize: 11, padding: '3px 10px', borderRadius: 4,
              border: 'none', cursor: 'pointer', transition: 'all 0.1s',
              background: activeFilter === f.value ? 'var(--surface)' : 'transparent',
              color: activeFilter === f.value ? 'var(--ink)' : 'var(--ink-2)',
              fontWeight: activeFilter === f.value ? 500 : 400,
              boxShadow: activeFilter === f.value ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
            }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>


      {/* Table */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Patient</th>
              <th style={th}>Part</th>
              <th style={th}>Doctor</th>
              <th style={th}>Submitted</th>
              <th style={th}>Quality</th>
              <th style={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {cases.map(c => {
              const sel = c.id === selectedId
              return (
                <tr
                  key={c.id}
                  onClick={() => onSelect(c)}
                  style={{
                    borderBottom: '1px solid var(--bdr)',
                    borderLeft: `2px solid ${sel ? 'var(--accent)' : 'transparent'}`,
                    background: sel ? 'var(--accent-bg)' : 'transparent',
                    cursor: 'pointer', transition: 'background 0.08s',
                  }}
                  onMouseEnter={e => { if (!sel) (e.currentTarget as HTMLElement).style.background = '#FAFAFF' }}
                  onMouseLeave={e => { if (!sel) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  <td style={{ padding: '10px 16px' }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{c.patientName}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 1 }}>
                      {c.patientAge}y {c.patientGender} · {c.diagnosis}
                    </div>
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--ink-2)' }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--ink-4)', flexShrink: 0 }} />
                      {c.bodyPart} · {c.side}
                    </span>
                  </td>
                  <td style={{ padding: '10px 16px', fontSize: 11, color: 'var(--ink-3)' }}>{c.doctorName}</td>
                  <td style={{ padding: '10px 16px', fontSize: 11, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
                    {relativeTime(c.submittedAt)}
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <div style={{ width: 40, height: 2, background: 'var(--bdr)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${c.overallQuality}%`, height: '100%', background: qColor(c.overallQuality), borderRadius: 2 }} />
                      </div>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-2)' }}>{c.overallQuality}</span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 16px' }}><StatusBadge status={c.status} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
