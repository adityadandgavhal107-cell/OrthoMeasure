import type { CaseStatus } from '../../types'
import { STATUS } from '../../utils'

const styles: Record<CaseStatus, React.CSSProperties> = {
  review:   { background: 'var(--accent-bg)', color: 'var(--accent)' },
  pending:  { background: 'var(--amber-bg)',  color: 'var(--amber)'  },
  approved: { background: 'var(--green-bg)',  color: 'var(--green)'  },
  rescan:   { background: 'var(--red-bg)',    color: 'var(--red)'    },
}

export default function StatusBadge({ status }: { status: CaseStatus }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      fontSize: 11, fontWeight: 500,
      padding: '2px 8px', borderRadius: 20,
      ...styles[status],
    }}>
      {STATUS[status].label}
    </span>
  )
}
