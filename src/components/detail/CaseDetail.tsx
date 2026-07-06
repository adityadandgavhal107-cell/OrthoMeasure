import { useState, useEffect, useRef } from 'react'
import type { OrthoCase, Measurement } from '../../types'
import { updateCaseStatus, updateCaseMeasurements, updateCaseCastSettings, writeAuditLog } from '../../data/api'
import StatusBadge from '../shared/StatusBadge'
import ImageGrid from './ImageGrid'
import MeasurementReadout from './MeasurementReadout'
import Cast3DVisualizer from './Cast3DVisualizer'
import { relativeTime } from '../../utils'

// ── Default measurements per body part (used when scan has no stored measurements) ──
function getDefaultMeasurements(bodyPart: string): Measurement[] {
  const part = (bodyPart || 'Forearm').toLowerCase()
  if (part.includes('wrist')) {
    return [
      { key: 'Wrist width',      value: 5.4,  unit: 'cm', confidence: 90, landmarkKeys: ['mid'] },
      { key: 'Wrist depth',      value: 3.7,  unit: 'cm', confidence: 86, landmarkKeys: ['mid'] },
      { key: 'Circumference',    value: 15.3, unit: 'cm', confidence: 91, landmarkKeys: ['mid', 'distal'] },
      { key: 'Thumb base girth', value: 7.2,  unit: 'cm', confidence: 84, landmarkKeys: ['distal'] },
    ]
  }
  if (part.includes('ankle')) {
    return [
      { key: 'Ankle height',       value: 9.6,  unit: 'cm', confidence: 82, landmarkKeys: ['proximal', 'mid'] },
      { key: 'Malleolus width',    value: 7.4,  unit: 'cm', confidence: 79, landmarkKeys: ['mid'] },
      { key: 'Heel circumference', value: 32.1, unit: 'cm', confidence: 76, landmarkKeys: ['mid', 'distal'] },
      { key: 'Arch circumference', value: 24.8, unit: 'cm', confidence: 81, landmarkKeys: ['distal'] },
    ]
  }
  if (part.includes('elbow')) {
    return [
      { key: 'Joint width',      value: 8.3,  unit: 'cm', confidence: 93, landmarkKeys: ['mid'] },
      { key: 'Upper arm circ.', value: 28.6, unit: 'cm', confidence: 91, landmarkKeys: ['proximal'] },
      { key: 'Forearm circ.',   value: 22.4, unit: 'cm', confidence: 89, landmarkKeys: ['distal'] },
      { key: 'Olecranon depth', value: 4.1,  unit: 'cm', confidence: 87, landmarkKeys: ['mid'] },
    ]
  }
  // Default → Forearm
  return [
    { key: 'Total length',        value: 26.1, unit: 'cm', confidence: 92, landmarkKeys: ['proximal', 'distal'] },
    { key: 'Proximal width',      value: 8.2,  unit: 'cm', confidence: 90, landmarkKeys: ['proximal'] },
    { key: 'Distal width',        value: 6.1,  unit: 'cm', confidence: 91, landmarkKeys: ['distal'] },
    { key: 'Mid circumference',   value: 22.8, unit: 'cm', confidence: 89, landmarkKeys: ['mid'] },
    { key: 'Wrist circumference', value: 16.4, unit: 'cm', confidence: 88, landmarkKeys: ['distal'] },
  ]
}

interface Props {
  orthoCase: OrthoCase | null
  onUpdated: (c: OrthoCase) => void
  userEmail: string
  userRole: 'Doctor' | 'Technician'
}

type TabType = 'images' | 'manufacturing' | 'history'

const btn = (label: string, onClick: () => void, style: React.CSSProperties) => (
  <button onClick={onClick} style={{
    fontSize: 11, fontWeight: 600, padding: '6px 12px',
    borderRadius: 'var(--r)', cursor: 'pointer', border: '1px solid',
    transition: 'all 0.1s', ...style,
  }}>{label}</button>
)

export default function CaseDetail({ orthoCase, onUpdated, userEmail, userRole }: Props) {
  const c = orthoCase as OrthoCase
  const [activeTab, setActiveTab] = useState<TabType>('images')
  const [selImg, setSelImg] = useState(0)
  const [busy, setBusy] = useState(false)
  const [notification, setNotification] = useState('')

  // Landmark dragging states
  const workspaceRef = useRef<HTMLDivElement>(null)
  const [landmarks, setLandmarks] = useState<Record<string, { label: string; x: number; y: number }>>({})
  const [draggingKey, setDraggingKey] = useState<string | null>(null)
  const [hasLandmarkEdits, setHasLandmarkEdits] = useState(false)
  
  // Manufacturing settings states
  const [castType, setCastType] = useState('Standard Cast')
  const [thickness, setThickness] = useState(3.5)
  const [castColor, setCastColor] = useState('Medical White')
  const [ventPattern, setVentPattern] = useState('Circular mesh')

  // Re-initialize local states when case or image changes
  useEffect(() => {
    if (c && c.images && c.images[selImg]) {
      setLandmarks(JSON.parse(JSON.stringify(c.images[selImg].landmarks || {})))
      setHasLandmarkEdits(false)
    }
  }, [c, selImg])

  useEffect(() => {
    if (c) {
      setCastType(c.castType || 'Standard Cast')
      setThickness(c.castThickness || 3.5)
      setCastColor(c.castColor || 'Medical White')
      setVentPattern(c.ventPattern || 'Circular mesh')
    }
  }, [c])

  if (!orthoCase) return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-3)', gap: 8 }}>
      <div style={{ fontSize: 32, opacity: 0.3 }}>⚕</div>
      <span style={{ fontSize: 13, fontWeight: 500 }}>Select a patient case to review</span>
    </div>
  )

  const isLidar = c.isLidarScan
  const activeImage = c.images[selImg]

  const act = async (status: 'approved' | 'rescan') => {
    if (busy) return
    setBusy(true)
    const updated = await updateCaseStatus(c.id, status)
    
    // Write audit log
    writeAuditLog(
      userEmail,
      userRole,
      status === 'approved' ? 'Case Approved' : 'Re-scan Requested',
      `Case ${c.id} status updated to ${status}. Notes recorded: "${c.doctorNotes || 'N/A'}".`
    )

    onUpdated(updated)
    setBusy(false)
    triggerNotification(`Case status updated to ${status}.`)
  }

  function triggerNotification(msg: string) {
    setNotification(msg)
    setTimeout(() => setNotification(''), 4000)
  }

  // Landmark Drag Handling
  const handleMouseDown = (key: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    setDraggingKey(key)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!draggingKey || !workspaceRef.current) return
    const rect = workspaceRef.current.getBoundingClientRect()
    
    // Calculate percentage coordinates (0-100) relative to image container
    let px = ((e.clientX - rect.left) / rect.width) * 100
    let py = ((e.clientY - rect.top) / rect.height) * 100
    
    // Bound the values
    px = Math.max(5, Math.min(95, px))
    py = Math.max(5, Math.min(95, py))

    setLandmarks(prev => ({
      ...prev,
      [draggingKey]: {
        ...prev[draggingKey],
        x: parseFloat(px.toFixed(1)),
        y: parseFloat(py.toFixed(1))
      }
    }))
    setHasLandmarkEdits(true)
  }

  const handleMouseUp = () => {
    setDraggingKey(null)
  }

  // Recalculate measurements based on landmark drags
  function getAdjustedMeasurements(): Measurement[] {
    if (!c) return []
    // Fall back to anatomical defaults when no measurements are stored yet
    const base: Measurement[] = (c.measurements && c.measurements.length > 0)
      ? c.measurements
      : getDefaultMeasurements(c.bodyPart)
    // If no landmark edits, return base as-is
    if (!hasLandmarkEdits) return base

    return base.map(m => {
      // Find matching landmarks that affect this measurement
      if (m.key.toLowerCase().includes('length') && landmarks.proximal && landmarks.distal) {
        // Map length to Y distance
        const baseDy = 60 // original mock distance (82 - 22)
        const currentDy = landmarks.distal.y - landmarks.proximal.y
        const ratio = currentDy / baseDy
        const newValue = parseFloat((m.value * ratio).toFixed(1))
        const conf = Math.max(50, Math.min(99, m.confidence - 2)) // adjusting AI landmark drops confidence slightly
        return { ...m, value: newValue, confidence: conf }
      }
      if (m.key.toLowerCase().includes('proximal width') && landmarks.proximal) {
        // Map proximal width to X displacement from center
        const dx = Math.abs(landmarks.proximal.x - 50)
        const ratio = (dx + 25) / 25
        const newValue = parseFloat((m.value * ratio).toFixed(1))
        return { ...m, value: newValue, confidence: Math.max(50, m.confidence - 1) }
      }
      if (m.key.toLowerCase().includes('distal width') && landmarks.distal) {
        const dx = Math.abs(landmarks.distal.x - 50)
        const ratio = (dx + 25) / 25
        const newValue = parseFloat((m.value * ratio).toFixed(1))
        return { ...m, value: newValue, confidence: Math.max(50, m.confidence - 1) }
      }
      if (m.key.toLowerCase().includes('circumference') && landmarks.mid) {
        // Circumference scales with mid point shift
        const dy = landmarks.mid.y / 50
        const newValue = parseFloat((m.value * dy).toFixed(1))
        return { ...m, value: newValue }
      }
      return m
    })
  }

  async function saveLandmarks() {
    if (busy) return
    setBusy(true)
    
    // Update the measurements and save
    const adjusted = getAdjustedMeasurements()
    const updatedImages = c.images.map((img, idx) => {
      if (idx === selImg) {
        return {
          ...img,
          landmarks: landmarks as any,
          // Re-generate SVG representation with new coordinates
          url: regenerateSVG(c.bodyPart, img.angle, img.qualityScore, landmarks, img.contourPath || '')
        }
      }
      return img
    })

    const updatedCase = await updateCaseMeasurements(c.id, adjusted, updatedImages)
    
    // Audit log
    writeAuditLog(
      userEmail,
      userRole,
      'Adjust Landmarks',
      `Dr. adjusted anatomical keypoint landmarks for patient ${c.patientName} (${c.id}), image view: ${activeImage.angle}. Centimeter calculations re-indexed.`
    )

    onUpdated(updatedCase)
    setHasLandmarkEdits(false)
    setBusy(false)
    triggerNotification('Landmark alignment updated and saved.')
  }

  function regenerateSVG(part: string, angle: string, _score: number, lms: any, contourPath: string): string {
    const shapes: Record<string, string> = {
      Forearm: `<rect x="30" y="15" width="40" height="70" rx="12" fill="none" stroke="%23D4D4D0" stroke-width="1.5"/><line x1="50" y1="18" x2="50" y2="82" stroke="%235746AF" stroke-width="0.5" opacity="0.4"/>`,
      Wrist:   `<ellipse cx="50" cy="50" rx="26" ry="20" fill="none" stroke="%23D4D4D0" stroke-width="1.5"/><ellipse cx="50" cy="50" rx="16" ry="12" fill="none" stroke="%235746AF" stroke-width="0.5" opacity="0.4"/>`,
      Ankle:   `<path d="M32%2C22 Q28%2C55 36%2C78 Q50%2C84 64%2C78 Q72%2C55 68%2C22 Z" fill="none" stroke="%23D4D4D0" stroke-width="1.5"/>`,
      Elbow:   `<path d="M35%2C18 L35%2C48 Q35%2C62 50%2C66 Q65%2C62 65%2C48 L65%2C18" fill="none" stroke="%23D4D4D0" stroke-width="1.5"/><circle cx="50" cy="52" r="9" fill="none" stroke="%235746AF" stroke-width="0.5" opacity="0.4"/>`,
    }
    const s = shapes[part] ?? shapes.Forearm
    const label = angle.replace(/\s/g, '_').toUpperCase().substring(0, 6)
    const arucoMarker = `<g transform="translate(10, 10)"><rect width="12" height="12" fill="black"/><rect x="2" y="2" width="8" height="8" fill="white"/><rect x="2" y="2" width="4" height="4" fill="black"/><rect x="6" y="6" width="4" height="4" fill="black"/><text x="6" y="-2" font-size="3" fill="%235746AF" font-family="monospace">ARUCO 4cm</text></g>`
    const contour = `<path d="${contourPath}" fill="%235746AF" fill-opacity="0.05" stroke="%2318794E" stroke-width="1" stroke-dasharray="2,2"/>`
    const points = Object.entries(lms).map(([_, lm]: [string, any]) => {
      return `<circle cx="${lm.x}" cy="${lm.y}" r="2.5" fill="%23C62A2F"/><text x="${lm.x + 4}" y="${lm.y + 1.5}" font-size="4" fill="%23C62A2F" font-family="sans-serif" font-weight="bold">${lm.label}</text>`
    }).join('')

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="%23F7F7F5"/>${contour}${s}${arucoMarker}${points}<text x="50" y="94" text-anchor="middle" font-family="monospace" font-size="6" fill="%23A8A8A8">${label}</text></svg>`
    return `data:image/svg+xml,${svg}`
  }

  // Save 3D custom casting parameters
  async function saveCastParameters() {
    setBusy(true)
    const updated = await updateCaseCastSettings(c.id, {
      castType,
      castThickness: thickness,
      castColor,
      ventPattern
    })
    
    writeAuditLog(
      userEmail,
      userRole,
      'Update Cast Specs',
      `Customized 3D printing specs for patient ${c.patientName} (${c.id}). Thickness: ${thickness}mm, Pattern: ${ventPattern}, Color: ${castColor}, Style: ${castType}.`
    )

    onUpdated(updated)
    setBusy(false)
    triggerNotification('3D Cast fabrication specifications saved.')
  }

  // Mock downloading STL / G-Code
  function exportCastFile(type: 'stl' | 'gcode') {
    writeAuditLog(
      userEmail,
      userRole,
      type === 'stl' ? 'Export STL Mesh' : 'Export G-Code',
      `Exported custom ${castType} design in ${type.toUpperCase()} format for patient ${c.patientName} (${c.id}). Spec Weight: ~240g.`
    )
    triggerNotification(`Exporting custom 3D cast ${type.toUpperCase()} mesh...`)
  }

  // Send to 3D printer
  function sendToPrinter() {
    writeAuditLog(
      userEmail,
      userRole,
      'Send to 3D Printer',
      `Sent G-Code instructions for ${c.patientName} custom cast directly to Ultimaker-S5 Printer #3 in casting lab.`
    )
    triggerNotification(`G-Code sent successfully to Ultimaker-S5 Printer #3!`)
  }

  const measurementsToDisplay = getAdjustedMeasurements()

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      
      {/* Header Info */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--bdr)', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)', marginBottom: 2 }}>{c.id}</div>
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--ink)' }}>{c.patientName}</div>
            <div style={{ fontSize: 11, color: 'var(--ink-2)', marginTop: 2 }}>
              {c.patientAge}y {c.patientGender} · {c.bodyPart}, {c.side}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            <StatusBadge status={c.status} />
            <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>{relativeTime(c.submittedAt)}</span>
          </div>
        </div>

        {/* Action triggers */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, opacity: busy ? 0.6 : 1 }}>
          {c.status !== 'approved' && btn('Approve & Model Cast', () => act('approved'), {
            background: 'var(--green-bg)', color: 'var(--green)', borderColor: 'var(--green-bdr)', flex: 1, textAlign: 'center'
          })}
          {c.status !== 'rescan' && btn('Request Re-scan', () => act('rescan'), {
            background: 'var(--red-bg)', color: 'var(--red)', borderColor: 'var(--red-bdr)', flex: 1, textAlign: 'center'
          })}
        </div>
      </div>

      {/* Toast Notification Banner */}
      {notification && (
        <div style={{
          background: 'var(--accent-bg)', borderBottom: '1px solid var(--accent-bdr)',
          padding: '6px 16px', fontSize: 11, color: 'var(--accent)', fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0
        }}>
          <span style={{ animation: 'lidarPulse 1s infinite' }}>●</span>
          {notification}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--bdr)', padding: '0 16px', background: 'var(--surface)', flexShrink: 0 }}>
        {[
          { id: 'images', label: 'Landmarks Workspace' },
          { id: 'manufacturing', label: '3D Cast Prefab' },
          { id: 'history', label: 'Case History' }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as any)}
            style={{
              fontSize: 11, padding: '10px 10px', marginBottom: -1,
              background: 'transparent', border: 'none',
              color: activeTab === t.id ? 'var(--accent)' : 'var(--ink-3)',
              borderBottom: `2.5px solid ${activeTab === t.id ? 'var(--accent)' : 'transparent'}`,
              cursor: 'pointer', fontWeight: activeTab === t.id ? 600 : 400,
              outline: 'none'
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Scrollable Workspace */}
      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)' }}>
        
        {/* TAB 1: Images & Landmark Canvas */}
        {activeTab === 'images' && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            
            {/* Viewfinder workspace */}
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div 
                ref={workspaceRef}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                style={{
                  width: '100%', maxWidth: 280, aspectRatio: '1',
                  background: 'var(--surface)', border: '1px solid var(--bdr)',
                  borderRadius: 6, position: 'relative', overflow: 'hidden',
                  cursor: draggingKey ? 'grabbing' : 'default',
                  userSelect: 'none'
                }}
              >
                {/* SVG base rendering */}
                <img 
                  src={activeImage.url} 
                  alt={activeImage.angle} 
                  style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }}
                />

                {/* ArUco Calibration Tag overlay */}
                {!isLidar && (
                  <div style={{
                    position: 'absolute', top: 6, left: 6,
                    fontSize: 8, fontFamily: 'var(--mono)',
                    background: 'rgba(16, 185, 129, 0.9)', color: 'white',
                    padding: '2px 4px', borderRadius: 3, border: '1px solid rgba(255,255,255,0.2)'
                  }}>
                    ARUCO OK (1px=0.81mm)
                  </div>
                )}

                {/* Draggable Pins */}
                {Object.entries(landmarks).map(([key, lm]) => (
                  <div
                    key={key}
                    onMouseDown={handleMouseDown(key)}
                    style={{
                      position: 'absolute',
                      left: `${lm.x}%`,
                      top: `${lm.y}%`,
                      transform: 'translate(-50%, -50%)',
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: draggingKey === key ? 'var(--accent)' : 'var(--red)',
                      border: '2px solid white',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.25)',
                      cursor: draggingKey === key ? 'grabbing' : 'grab',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 10
                    }}
                    title="Drag pin to calibrate landmark coordinate"
                  >
                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'white' }} />
                  </div>
                ))}
              </div>

              {/* Landmark Helper Note */}
              <div style={{
                fontSize: 10, color: 'var(--ink-2)', width: '100%',
                marginTop: 8, textAlign: 'center', background: 'var(--surface)',
                padding: '6px 10px', borderRadius: 4, border: '1px solid var(--bdr)'
              }}>
                ℹ Drag red keypoints to manually adjust alignment calibration.
              </div>

              {/* Adjustments Action */}
              {hasLandmarkEdits && (
                <div style={{ display: 'flex', gap: 6, width: '100%', marginTop: 8 }}>
                  <button
                    onClick={() => {
                      setLandmarks(JSON.parse(JSON.stringify(activeImage.landmarks || {})))
                      setHasLandmarkEdits(false)
                    }}
                    style={{
                      flex: 1, fontSize: 11, padding: '5px 8px', borderRadius: 4,
                      background: 'var(--surface)', border: '1px solid var(--bdr-2)', cursor: 'pointer'
                    }}
                  >
                    Revert
                  </button>
                  <button
                    onClick={saveLandmarks}
                    style={{
                      flex: 2, fontSize: 11, padding: '5px 8px', borderRadius: 4,
                      background: 'var(--accent)', color: 'white', border: 'none', cursor: 'pointer',
                      fontWeight: 600
                    }}
                  >
                    Save Landmark Edits
                  </button>
                </div>
              )}
            </div>

            {/* Thumbnail selector */}
            <ImageGrid images={c.images} selectedIndex={selImg} onSelect={setSelImg} />
            
            <div style={{ height: 1, background: 'var(--bdr)' }} />

            {/* Calibrated Measurements readouts */}
            <MeasurementReadout 
              measurements={measurementsToDisplay} 
              bodyPart={c.bodyPart} 
              side={c.side} 
            />
          </div>
        )}

        {/* TAB 2: Manufacturing Prep (3D Cast Model Settings) */}
        {activeTab === 'manufacturing' && (
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            
            {/* Interactive 3D Cast Visualizer */}
            <div style={{
              background: '#070A13', borderRadius: 8, border: '1px solid #1E2937',
              position: 'relative', overflow: 'hidden'
            }}>
              <Cast3DVisualizer
                castColor={castColor}
                ventPattern={ventPattern}
                thickness={thickness}
                isLidar={!!isLidar}
              />
              {/* Drag hint */}
              <div style={{
                position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
                fontSize: 9, fontFamily: 'var(--mono)',
                color: '#475569', pointerEvents: 'none', whiteSpace: 'nowrap'
              }}>
                ↔ Drag to rotate · {ventPattern} ({thickness.toFixed(1)}mm)
              </div>
              {/* LiDAR / 2D badge */}
              <div style={{
                position: 'absolute', top: 8, right: 8,
                fontSize: 9, fontFamily: 'var(--mono)',
                background: isLidar ? 'var(--lidar-bg)' : 'rgba(255,255,255,0.05)',
                color: isLidar ? 'var(--lidar-blue)' : '#94A3B8',
                border: `1px solid ${isLidar ? 'var(--lidar-bdr)' : 'rgba(255,255,255,0.1)'}`,
                padding: '2px 6px', borderRadius: 4
              }}>
                {isLidar ? '0.2mm LiDAR Mesh Certified' : '2D Photos Calibration'}
              </div>
            </div>

            {/* Customization controls */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--surface)', padding: 14, borderRadius: 6, border: '1px solid var(--bdr)' }}>
              <div>
                <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase' }}>Cast Design Profile</label>
                <select
                  value={castType}
                  onChange={e => setCastType(e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', fontSize: 12, border: '1px solid var(--bdr-2)', borderRadius: 4, marginTop: 4, outline: 'none', background: 'var(--bg)', color: 'var(--ink)' }}
                >
                  <option value="Standard Cast">Standard Ortho Cast</option>
                  <option value="Exoskeleton splint">Structural Exoskeleton Splint</option>
                  <option value="Ventilated sleeve">High-Aeration Ventilated Sleeve</option>
                </select>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase' }}>
                  <span>Wall Thickness</span>
                  <span>{thickness.toFixed(1)} mm</span>
                </div>
                <input
                  type="range"
                  min="2.0"
                  max="5.0"
                  step="0.5"
                  value={thickness}
                  onChange={e => setThickness(parseFloat(e.target.value))}
                  style={{ width: '100%', marginTop: 6, cursor: 'pointer', accentColor: 'var(--accent)' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase' }}>Ventilation Architecture</label>
                <select
                  value={ventPattern}
                  onChange={e => setVentPattern(e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', fontSize: 12, border: '1px solid var(--bdr-2)', borderRadius: 4, marginTop: 4, outline: 'none', background: 'var(--bg)', color: 'var(--ink)' }}
                >
                  <option value="Circular mesh">Circular Mesh Openings</option>
                  <option value="Honeycomb">Honeycomb (Hexagonal Grid)</option>
                  <option value="Voronoi structure">Organic Voronoi Webbing</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase' }}>Polymer Color Selection</label>
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  {[
                    { label: 'White', value: 'Medical White', color: '#ECEFF1', border: '#CFD8DC' },
                    { label: 'Black', value: 'Carbon Black', color: '#263238', border: '#1A237E' },
                    { label: 'Teal', value: 'Neon Teal', color: '#00BFA5', border: '#004D40' },
                    { label: 'Violet', value: 'Deep Violet', color: '#5C6BC0', border: '#1A237E' }
                  ].map(col => (
                    <button
                      key={col.value}
                      onClick={() => setCastColor(col.value)}
                      title={col.value}
                      style={{
                        flex: 1, padding: '4px 6px', fontSize: 10, borderRadius: 4,
                        border: `1.5px solid ${castColor === col.value ? 'var(--accent)' : 'var(--bdr)'}`,
                        background: 'var(--bg)', color: 'var(--ink-2)', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 4
                      }}
                    >
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: col.color, border: '1px solid #B0BEC5' }} />
                      {col.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={saveCastParameters}
                style={{
                  width: '100%', padding: '8px 0', border: 'none',
                  background: 'var(--accent-bg)', color: 'var(--accent)',
                  fontWeight: 600, borderRadius: 'var(--r)', cursor: 'pointer',
                  marginTop: 6, fontSize: 12
                }}
              >
                Save Fabrication Settings
              </button>
            </div>

            {/* Manufacturing stats */}
            <div style={{
              background: 'var(--surface)', padding: 14, borderRadius: 6,
              border: '1px solid var(--bdr)', fontSize: 11, display: 'flex', flexDirection: 'column', gap: 8
            }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', marginBottom: 2 }}>Fabrication Metrics</div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--ink-2)' }}>Estimated Build Weight:</span>
                <span style={{ fontWeight: 600, color: 'var(--ink)' }}>~245 grams</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--ink-2)' }}>3D Print Time (Ultimaker S5):</span>
                <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{Math.floor(thickness * 1.2)}h {Math.floor((thickness * 1.2 % 1) * 60)}m</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--ink-2)' }}>Material Specification:</span>
                <span style={{ fontWeight: 600, color: 'var(--ink)' }}>Medical TPU (Semi-Flexible)</span>
              </div>
            </div>

            {/* Print actions */}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button
                onClick={() => exportCastFile('stl')}
                style={{
                  flex: 1, padding: '8px 0', borderRadius: 'var(--r)',
                  border: '1px solid var(--bdr-2)', background: 'var(--surface)',
                  color: 'var(--ink)', fontWeight: 500, fontSize: 11, cursor: 'pointer'
                }}
              >
                Export STL Mesh
              </button>
              <button
                onClick={sendToPrinter}
                style={{
                  flex: 1, padding: '8px 0', borderRadius: 'var(--r)',
                  border: 'none', background: 'var(--green)',
                  color: 'white', fontWeight: 600, fontSize: 11, cursor: 'pointer',
                  boxShadow: '0 2px 4px rgba(16,185,129,0.2)'
                }}
              >
                Send G-Code
              </button>
            </div>
          </div>
        )}

        {/* TAB 3: Case History / Logs */}
        {activeTab === 'history' && (
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase' }}>Scan & Device Properties</div>
            
            <div style={{ background: 'var(--surface)', border: '1px solid var(--bdr)', borderRadius: 6, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div>
                <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>Scanner Device:</span>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginTop: 1 }}>{c.deviceModel || 'Unknown Device'}</div>
              </div>
              <div>
                <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>Spatial LiDAR Depth Mapping:</span>
                <div style={{ fontSize: 12, fontWeight: 600, color: isLidar ? 'var(--lidar-blue)' : 'var(--ink-2)', marginTop: 1 }}>
                  {isLidar ? 'Yes (ARKit Point Cloud Exported)' : 'No (2D Multi-Angle Photos Only)'}
                </div>
              </div>
              {isLidar && (
                <div>
                  <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>Point Cloud Density / Vertices:</span>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginTop: 1 }}>12,400 Vertices (OBJ/PLY format)</div>
                </div>
              )}
            </div>

            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', marginTop: 10 }}>Patient Diagnosis Metadata</div>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--bdr)', borderRadius: 6, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div>
                <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>Diagnosis Notes:</span>
                <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 2, lineHeight: 1.5 }}>
                  {c.diagnosis}
                </div>
              </div>
              <div>
                <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>Mobility Status:</span>
                <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 1 }}>{c.mobilityStatus}</div>
              </div>
              <div>
                <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>Swelling Severity:</span>
                <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 1 }}>{c.swellingStatus}</div>
              </div>
              <div>
                <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>Consent Status:</span>
                <div style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600, marginTop: 1 }}>✓ Confirmed & Logged</div>
              </div>
            </div>

            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', marginTop: 10 }}>Doctor Review Log</div>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--bdr)', borderRadius: 6, padding: '12px 14px' }}>
              <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>Review Notes & Guidelines:</span>
              <div style={{ fontSize: 12, color: 'var(--ink-2)', background: 'var(--bg)', border: '1px solid var(--bdr)', padding: 10, borderRadius: 4, marginTop: 4, lineHeight: 1.5 }}>
                {c.doctorNotes || <em>No notes recorded yet.</em>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
