import type { Measurement } from '../../types'
import CalibrationGauge from '../shared/CalibrationGauge'

function Ruler() {
  const ticks = [6,3,3,6,3,3,6,3]
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', height: 6, marginTop: 4, gap: 2 }}>
      {ticks.map((h, i) => (
        <div key={i} style={{
          width: 1, height: h,
          background: h === 6 ? 'var(--accent)' : 'var(--bdr-2)',
          flexShrink: 0,
        }} />
      ))}
      <div style={{ flex: 1, height: 1, background: 'var(--bdr)', marginBottom: 0, alignSelf: 'flex-end' }} />
    </div>
  )
}

interface Props { measurements: Measurement[]; bodyPart: string; side: string }

export default function MeasurementReadout({ measurements, bodyPart, side }: Props) {
  return (
    <div style={{ padding: '10px 16px' }}>
      <div style={{
        fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: '0.06em', color: 'var(--ink-3)', marginBottom: 10,
      }}>
        Measurements — {bodyPart} ({side})
      </div>
      {measurements.map((m, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 11 }}>
          <div style={{ fontSize: 11, color: 'var(--ink-3)', width: 108, flexShrink: 0 }}>{m.key}</div>
          <div style={{ flex: 1 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.02em' }}>
              {m.value.toFixed(1)}
            </span>
            <span style={{ fontFamily: 'inherit', fontSize: 10, color: 'var(--ink-3)', marginLeft: 2 }}>{m.unit}</span>
            <Ruler />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
            <CalibrationGauge value={m.confidence} size={26} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)', minWidth: 28, textAlign: 'right' }}>
              {m.confidence}%
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
