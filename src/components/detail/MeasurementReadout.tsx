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

interface Props { 
  measurements: Measurement[]; 
  bodyPart: string; 
  side: string;
  onManualChange?: (key: string, val: number | undefined) => void;
  onSaveManual?: () => void;
  isSavingManual?: boolean;
}

export default function MeasurementReadout({ measurements, bodyPart, side, onManualChange, onSaveManual, isSavingManual }: Props) {
  return (
    <div style={{ padding: '10px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 }}>
        <div style={{
          fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
          letterSpacing: '0.06em', color: 'var(--ink-3)'
        }}>
          Measurements — {bodyPart} ({side})
        </div>
      </div>
      
      {measurements.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--ink-3)', fontStyle: 'italic', padding: '4px 0' }}>
          Awaiting scan to generate measurements...
        </div>
      ) : (
        <>
          {measurements.map((m, i) => {
            const hasManual = m.manualValue !== undefined
            const deviation = hasManual ? Math.abs(m.value - m.manualValue!) / m.value : 0
            const isWarning = deviation > 0.10
            
            // Calculate display confidence based on deviation if manual value exists
            const displayConfidence = hasManual 
              ? Math.max(0, Math.round((1 - deviation) * 100))
              : m.confidence

            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: 'var(--ink-3)', width: 90, flexShrink: 0, lineHeight: 1.2 }}>{m.key}</div>
                
                {/* AI Value */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline' }}>
                    <span style={{ fontSize: 9, color: 'var(--ink-3)', textTransform: 'uppercase', marginRight: 4 }}>AI:</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.02em' }}>
                      {m.value.toFixed(1)}
                    </span>
                    <span style={{ fontFamily: 'inherit', fontSize: 10, color: 'var(--ink-3)', marginLeft: 2 }}>{m.unit}</span>
                  </div>
                  <Ruler />
                </div>

                {/* Manual Input */}
                <div style={{ 
                  display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, 
                  background: isWarning ? 'var(--red-bg)' : 'transparent', 
                  padding: '4px', borderRadius: 4, 
                  border: isWarning ? '1px solid var(--red-bdr)' : '1px solid transparent',
                  transition: 'all 0.2s'
                }}>
                  <span style={{ fontSize: 9, color: isWarning ? 'var(--red)' : 'var(--ink-3)', textTransform: 'uppercase' }}>Act:</span>
                  <input 
                    type="number"
                    step="0.1"
                    placeholder="---"
                    value={m.manualValue ?? ''}
                    onChange={(e) => onManualChange && onManualChange(m.key, e.target.value ? parseFloat(e.target.value) : undefined)}
                    style={{
                      width: 48, fontFamily: 'var(--mono)', fontSize: 13, padding: '2px 4px',
                      border: '1px solid var(--bdr)', borderRadius: 4, textAlign: 'right',
                      color: isWarning ? 'var(--red)' : 'var(--ink)', background: 'var(--surface)',
                      outline: 'none'
                    }}
                  />
                  <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>{m.unit}</span>
                </div>

                {/* Confidence */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, width: 55, justifyContent: 'flex-end' }}>
                  <CalibrationGauge value={displayConfidence} size={22} />
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)', minWidth: 26, textAlign: 'right' }}>
                    {displayConfidence}%
                  </span>
                </div>
              </div>
            )
          })}
          
          {onSaveManual && (
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--bdr)', paddingTop: 12 }}>
              <button 
                onClick={onSaveManual}
                disabled={isSavingManual}
                style={{
                  fontSize: 11, fontWeight: 600, padding: '6px 12px',
                  background: 'var(--accent)', border: 'none',
                  borderRadius: 4, cursor: isSavingManual ? 'not-allowed' : 'pointer',
                  color: 'white', display: 'flex', gap: 6, alignItems: 'center'
                }}
              >
                {isSavingManual ? 'Saving...' : 'Save Manual Measurements'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
