import type { CaseStatus } from '../../types'

interface RailItem {
  icon: string
  label: string
  view: 'queue' | 'register' | 'devices' | 'analytics' | 'audit' | 'capture'
  filter?: CaseStatus | 'all'
  badge?: number
  badgeWarn?: boolean
}

interface Props {
  activeView: 'queue' | 'register' | 'devices' | 'analytics' | 'audit' | 'capture'
  activeFilter: CaseStatus | 'all'
  counts: Record<CaseStatus, number>
  onChangeView: (view: 'queue' | 'register' | 'devices' | 'analytics' | 'audit' | 'capture') => void
  onChangeFilter: (filter: CaseStatus | 'all') => void
}

export default function SideRail({ activeView, activeFilter, counts, onChangeView, onChangeFilter }: Props) {
  const items: RailItem[] = [
    { icon: '⬇', label: 'In review', view: 'queue', filter: 'review', badge: counts.review },
    { icon: '◷', label: 'Pending',  view: 'queue', filter: 'pending', badge: counts.pending, badgeWarn: true },
    { icon: '✓', label: 'Approved', view: 'queue', filter: 'approved', badge: counts.approved },
    { icon: '⟳', label: 'Re-scan',  view: 'queue', filter: 'rescan', badge: counts.rescan },
  ]

  const secondary: RailItem[] = [
    { icon: '⊕', label: 'New Patient Scan', view: 'register' },
    { icon: '▣', label: 'Devices diagnostics', view: 'devices' },
    { icon: '▤', label: 'HIPAA Audit log', view: 'audit' }
  ]

  function handleItemClick(item: RailItem) {
    onChangeView(item.view)
    if (item.filter) {
      onChangeFilter(item.filter)
    }
  }

  const label = (text: string) => (
    <div style={{
      fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
      letterSpacing: '0.06em', color: 'var(--ink-3)',
      padding: '8px 8px 4px',
    }}>{text}</div>
  )

  return (
    <aside style={{
      width: 200, minWidth: 200,
      borderRight: '1px solid var(--bdr)',
      background: 'var(--surface)',
      display: 'flex', flexDirection: 'column',
      padding: '12px 8px', gap: 2, flexShrink: 0,
    }}>
      {label('Workstations')}
      
      {/* All Queue shortcut */}
      <div 
        onClick={() => { onChangeView('queue'); onChangeFilter('all') }}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 12, padding: '6px 8px', borderRadius: 'var(--r)',
          color: activeView === 'queue' && activeFilter === 'all' ? 'var(--accent)' : 'var(--ink-2)',
          background: activeView === 'queue' && activeFilter === 'all' ? 'var(--accent-bg)' : 'transparent',
          fontWeight: activeView === 'queue' && activeFilter === 'all' ? 600 : 400,
          cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: 13, width: 16, textAlign: 'center' }}>⊞</span>
        All Patient cases
      </div>

      {/* Status filters */}
      {items.map(item => {
        const isActive = activeView === 'queue' && activeFilter === item.filter
        return (
          <div
            key={item.label}
            onClick={() => handleItemClick(item)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 12, padding: '6px 8px', borderRadius: 'var(--r)',
              color: isActive ? 'var(--accent)' : 'var(--ink-2)',
              background: isActive ? 'var(--accent-bg)' : 'transparent',
              fontWeight: isActive ? 600 : 400,
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: 13, width: 16, textAlign: 'center' }}>{item.icon}</span>
            {item.label}
            {item.badge !== undefined && item.badge > 0 && (
              <span style={{
                marginLeft: 'auto', fontSize: 10, fontWeight: 600,
                padding: '1px 6px', borderRadius: 20,
                background: item.badgeWarn ? 'var(--amber-bg)' : 'var(--accent-bg)',
                color: item.badgeWarn ? 'var(--amber)' : 'var(--accent)',
              }}>
                {item.badge}
              </span>
            )}
          </div>
        )
      })}
      
      <div style={{ marginTop: 8 }}>{label('Management')}</div>
      
      {secondary.map(item => {
        const isActive = activeView === item.view
        return (
          <div
            key={item.label}
            onClick={() => handleItemClick(item)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 12, padding: '6px 8px', borderRadius: 'var(--r)',
              color: isActive ? 'var(--accent)' : 'var(--ink-2)',
              background: isActive ? 'var(--accent-bg)' : 'transparent',
              fontWeight: isActive ? 600 : 400,
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: 13, width: 16, textAlign: 'center' }}>{item.icon}</span>
            {item.label}
          </div>
        )
      })}
    </aside>
  )
}

