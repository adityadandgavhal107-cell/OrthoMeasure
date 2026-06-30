import type { ScanImage } from '../../types'

interface Props { images: ScanImage[]; selectedIndex: number; onSelect: (i: number) => void }

export default function ImageGrid({ images, selectedIndex, onSelect }: Props) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 3, padding: '12px 16px 8px' }}>
      {images.map((img, i) => (
        <div key={img.id} onClick={() => onSelect(i)} style={{
          aspectRatio: '1', borderRadius: 5,
          background: 'var(--bg)',
          border: `1px solid ${i === selectedIndex ? 'var(--accent)' : 'var(--bdr)'}`,
          overflow: 'hidden', position: 'relative', cursor: 'pointer',
          transition: 'border-color 0.1s',
        }}>
          <img src={img.url} alt={img.angle} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          <div style={{
            position: 'absolute', bottom: 3, left: 4,
            fontSize: 9, fontFamily: 'var(--mono)',
            background: 'rgba(255,255,255,0.85)', color: 'var(--ink-3)',
            padding: '1px 4px', borderRadius: 3,
          }}>{img.angle}</div>
          <div style={{
            position: 'absolute', top: 3, right: 3,
            fontSize: 9, fontFamily: 'var(--mono)',
            padding: '1px 4px', borderRadius: 3,
            background: img.qualityScore >= 85 ? 'var(--green-bg)' : 'var(--amber-bg)',
            color: img.qualityScore >= 85 ? 'var(--green)' : 'var(--amber)',
          }}>{img.qualityScore}</div>
          {img.blurDetected && (
            <div style={{
              position: 'absolute', bottom: 3, right: 3,
              width: 5, height: 5, borderRadius: '50%', background: 'var(--red)',
            }} title="Quality issue" />
          )}
        </div>
      ))}
    </div>
  )
}
