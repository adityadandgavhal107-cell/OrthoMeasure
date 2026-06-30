import type { CaseStatus } from './types'

export function relativeTime(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${m % 60}m ago`
  return `${Math.floor(h / 24)}d ago`
}

export function qColor(q: number): string {
  return q >= 85 ? 'var(--green)' : q >= 70 ? 'var(--amber)' : 'var(--red)'
}

export const STATUS: Record<CaseStatus, { label: string; cls: string }> = {
  pending:  { label: 'Pending',   cls: 'badge-pending'  },
  review:   { label: 'In review', cls: 'badge-review'   },
  approved: { label: 'Approved',  cls: 'badge-approved' },
  rescan:   { label: 'Re-scan',   cls: 'badge-rescan'   },
}
