interface Props { value: number; size?: number }

export default function CalibrationGauge({ value, size = 26 }: Props) {
  const r = size * 0.42
  const cx = size / 2
  const cy = size / 2
  const sa = Math.PI
  const ang = sa + (value / 100) * Math.PI
  const x1 = cx + r * Math.cos(sa), y1 = cy + r * Math.sin(sa)
  const x2 = cx + r * Math.cos(0),  y2 = cy + r * Math.sin(0)
  const px = cx + r * Math.cos(ang), py = cy + r * Math.sin(ang)
  const nx = cx + r * 0.65 * Math.cos(ang), ny = cy + r * 0.65 * Math.sin(ang)
  const sw = size * 0.1
  const col = value >= 85 ? 'var(--green)' : value >= 70 ? 'var(--amber)' : 'var(--red)'
  const h = size * 0.55

  return (
    <svg width={size} height={h} viewBox={`0 0 ${size} ${h}`} style={{ display: 'block', flexShrink: 0 }}>
      <path d={`M${x1},${y1} A${r},${r} 0 0,1 ${x2},${y2}`}
        fill="none" stroke="var(--bdr-2)" strokeWidth={sw} strokeLinecap="round" />
      <path d={`M${x1},${y1} A${r},${r} 0 ${ang - sa > Math.PI ? 1 : 0},1 ${px},${py}`}
        fill="none" stroke={col} strokeWidth={sw} strokeLinecap="round" />
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={col} strokeWidth={size * 0.07} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={size * 0.07} fill={col} />
    </svg>
  )
}
