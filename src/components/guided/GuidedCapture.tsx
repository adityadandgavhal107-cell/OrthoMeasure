import { useState, useEffect } from 'react'
import type { OrthoCase, ScanImage, Measurement } from '../../types'
import { saveNewCase, writeAuditLog } from '../../data/api'

interface Props {
  patientData: Omit<OrthoCase, 'id' | 'submittedAt' | 'images' | 'measurements' | 'overallQuality' | 'status' | 'doctorName'>
  doctorName: string
  userEmail: string
  userRole: 'Doctor' | 'Technician'
  onComplete: (newCase: OrthoCase) => void
  onCancel: () => void
}

// 6 standard angles for photography
const ANGLES = ['Front', 'Back', 'Left', 'Right', '45° Left', '45° Right']

export default function GuidedCapture({ patientData, doctorName, userEmail, userRole, onComplete, onCancel }: Props) {
  const [device, setDevice] = useState<'android' | 'iphone_std' | 'ipad_lidar' | 'iphone_lidar'>('ipad_lidar')
  const [currentStep, setCurrentStep] = useState(0)
  const [capturing, setCapturing] = useState(false)
  const [capturedImages, setCapturedImages] = useState<ScanImage[]>([])
  
  // Real-time quality verification states
  const [checking, setChecking] = useState(false)
  const [checks, setChecks] = useState({
    resolution: false,
    blur: false,
    motion: false,
    brightness: false,
    aruco: false
  })
  
  // Simulated processing queue after capture completes
  const [processing, setProcessing] = useState(false)
  const [processProgress, setProcessProgress] = useState(0)
  const [processLogs, setProcessLogs] = useState<string[]>([])

  const isLidar = device === 'ipad_lidar' || device === 'iphone_lidar'
  const stepsCount = isLidar ? 2 : ANGLES.length // LiDAR requires fewer sweeps (Front 180, Back 180) due to 3D point cloud coverage

  const deviceNameMap = {
    android: 'Samsung Galaxy S24 (Android Camera)',
    iphone_std: 'iPhone 15 (Standard Camera)',
    ipad_lidar: 'iPad Pro M4 (LiDAR Depth Mapping)',
    iphone_lidar: 'iPhone 15 Pro (LiDAR Depth Mapping)'
  }

  // Trigger auto-focus / alignment simulations
  useEffect(() => {
    // Reset checks for the current step
    setChecks({
      resolution: false,
      blur: false,
      motion: false,
      brightness: false,
      aruco: false
    })
  }, [currentStep, device])

  function handleCapture() {
    if (capturing || checking) return
    setChecking(true)
    
    // Simulate real-time computer vision analysis on frame
    setTimeout(() => {
      setChecks(prev => ({ ...prev, resolution: true }))
      setTimeout(() => {
        setChecks(prev => ({ ...prev, brightness: true }))
        setTimeout(() => {
          setChecks(prev => ({ ...prev, motion: true }))
          setTimeout(() => {
            setChecks(prev => ({ ...prev, blur: true }))
            setTimeout(() => {
              setChecks(prev => ({ ...prev, aruco: true }))
              setChecking(false)
              setCapturing(true)
            }, 250)
          }, 200)
        }, 200)
      }, 150)
    }, 150)
  }

  function handleConfirmFrame() {
    const angleLabel = isLidar 
      ? (currentStep === 0 ? 'Anterior 180° Sweep' : 'Posterior 180° Sweep')
      : ANGLES[currentStep]

    const quality = Math.floor(Math.random() * 12) + (isLidar ? 88 : 83) // LiDAR provides higher accuracy guidance

    const part = patientData.bodyPart
    const landmarks: Record<string, { label: string; x: number; y: number }> = {}
    let contourPath = ''

    if (part === 'Forearm') {
      landmarks.proximal = { label: 'Elbow Crease', x: 50, y: 22 }
      landmarks.mid = { label: 'Mid Forearm', x: 50, y: 50 }
      landmarks.distal = { label: 'Wrist Joint', x: 50, y: 82 }
      contourPath = 'M 36 15 C 34 30, 32 50, 38 85 C 42 88, 58 88, 62 85 C 68 50, 66 30, 64 15 Z'
    } else if (part === 'Wrist') {
      landmarks.proximal = { label: 'Distal Forearm', x: 50, y: 25 }
      landmarks.mid = { label: 'Wrist Crease', x: 50, y: 50 }
      landmarks.distal = { label: 'MCP Joint', x: 50, y: 75 }
      contourPath = 'M 38 18 C 36 35, 34 50, 36 62 C 35 68, 33 72, 35 78 C 38 82, 62 82, 65 78 C 67 72, 65 68, 64 62 C 66 50, 64 35, 62 18 Z'
    } else if (part === 'Ankle') {
      landmarks.proximal = { label: 'Calf Base', x: 50, y: 22 }
      landmarks.mid = { label: 'Lateral Malleolus', x: 50, y: 62 }
      landmarks.distal = { label: 'Heel Base', x: 50, y: 82 }
      contourPath = 'M 38 20 C 37 40, 34 60, 32 75 C 32 82, 45 84, 68 80 C 68 70, 66 40, 62 20 Z'
    } else { // Elbow
      landmarks.proximal = { label: 'Upper Arm', x: 50, y: 25 }
      landmarks.mid = { label: 'Olecranon Pin', x: 50, y: 52 }
      landmarks.distal = { label: 'Proximal Forearm', x: 50, y: 75 }
      contourPath = 'M 38 18 C 38 35, 35 48, 38 58 C 42 62, 58 62, 62 58 C 65 48, 62 35, 62 18 Z'
    }

    // Create a mock image URL with custom graphics representing the angle
    const shapes: Record<string, string> = {
      Forearm: `<rect x="30" y="15" width="40" height="70" rx="12" fill="none" stroke="%23D4D4D0" stroke-width="1.5"/><line x1="50" y1="18" x2="50" y2="82" stroke="%235746AF" stroke-width="0.5" opacity="0.4"/>`,
      Wrist:   `<ellipse cx="50" cy="50" rx="26" ry="20" fill="none" stroke="%23D4D4D0" stroke-width="1.5"/><ellipse cx="50" cy="50" rx="16" ry="12" fill="none" stroke="%235746AF" stroke-width="0.5" opacity="0.4"/>`,
      Ankle:   `<path d="M32%2C22 Q28%2C55 36%2C78 Q50%2C84 64%2C78 Q72%2C55 68%2C22 Z" fill="none" stroke="%23D4D4D0" stroke-width="1.5"/>`,
      Elbow:   `<path d="M35%2C18 L35%2C48 Q35%2C62 50%2C66 Q65%2C62 65%2C48 L65%2C18" fill="none" stroke="%23D4D4D0" stroke-width="1.5"/>`
    }
    const s = shapes[part] ?? shapes.Forearm
    const label = angleLabel.replace(/\s/g, '_').toUpperCase().substring(0, 7)
    
    // If LiDAR, we render blue depth markers, otherwise standard landmarks
    const overlayGraphic = isLidar 
      ? `<g fill="%230ea5e9" opacity="0.6">${Array.from({length: 15}).map((_, idx) => `<circle cx="${25 + (idx % 4) * 15 + Math.sin(idx) * 2}" cy="${20 + Math.floor(idx / 4) * 18 + Math.cos(idx) * 2}" r="1.5" />`).join('')}</g>`
      : `<path d="${contourPath}" fill="%235746AF" fill-opacity="0.05" stroke="%2318794E" stroke-width="1" stroke-dasharray="2,2"/>`

    const points = isLidar 
      ? `<text x="50" y="52" font-size="4" fill="%230ea5e9" text-anchor="middle" font-weight="bold">LiDAR MESH CAPTURED</text>`
      : Object.entries(landmarks).map(([_, lm]) => `<circle cx="${lm.x}" cy="${lm.y}" r="2" fill="%23C62A2F"/>`).join('')

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="%230F172A"/><g opacity="0.3">${s}</g>${overlayGraphic}${points}<text x="50" y="94" text-anchor="middle" font-family="monospace" font-size="5" fill="%236B7280">${label}</text></svg>`
    const dataUrl = `data:image/svg+xml,${svg}`

    const newImg: ScanImage = {
      id: `${part}-${currentStep}-${Date.now()}`,
      angle: angleLabel,
      url: dataUrl,
      qualityScore: quality,
      blurDetected: false,
      motionDetected: false,
      brightnessValidation: true,
      resolutionCheck: '3024 x 4032',
      landmarks: landmarks as any,
      contourPath
    }

    setCapturedImages([...capturedImages, newImg])
    setCapturing(false)

    if (currentStep + 1 < stepsCount) {
      setCurrentStep(currentStep + 1)
    } else {
      // Completed capturing, enter processing mode
      handleTriggerProcessing([...capturedImages, newImg])
    }
  }

  function handleTriggerProcessing(finalImages: ScanImage[]) {
    setProcessing(true)
    const logs = [
      'Initializing Calibration Engine...',
      isLidar ? 'Retrieving Apple ARKit ARMeshAnchor structures...' : 'Locating ArUco calibration targets in 2D frames...',
      isLidar ? 'Analyzing depth point cloud (12,400 vertices)...' : 'Applying scale factor: 12.44 pixels/mm based on marker...',
      'Isolating anatomical boundaries (DeepLabV3 segmentation)...',
      'Running landmark coordinate localization (YOLOv8-pose)...',
      'Refining mesh dimensions and estimating circumferences...',
      'Compiling medical quality verification report...',
      'Case packaging finalized. Writing audit records.'
    ]

    let logIdx = 0
    const logInterval = setInterval(() => {
      if (logIdx < logs.length) {
        setProcessLogs(prev => [...prev, logs[logIdx]])
        setProcessProgress(Math.floor(((logIdx + 1) / logs.length) * 100))
        logIdx++
      } else {
        clearInterval(logInterval)
        setTimeout(() => {
          finalizeCase(finalImages)
        }, 300)
      }
    }, 400)
  }

  async function finalizeCase(finalImages: ScanImage[]) {
    const id = `OM-2024-${String(Math.floor(Math.random() * 900) + 100)}`
    
    // Generate measurements based on body part
    const part = patientData.bodyPart
    let measurements: Measurement[] = []
    if (part === 'Forearm') {
      measurements = [
        { key: 'Total length',       value: 24.2 + Math.random() * 2, unit: 'cm', confidence: isLidar ? 98 : 91, landmarkKeys: ['proximal', 'distal'] },
        { key: 'Proximal width',     value: 7.2 + Math.random(),  unit: 'cm', confidence: isLidar ? 97 : 89, landmarkKeys: ['proximal'] },
        { key: 'Distal width',       value: 5.2 + Math.random(),  unit: 'cm', confidence: isLidar ? 99 : 92, landmarkKeys: ['distal'] },
        { key: 'Mid circumference',  value: 20.1 + Math.random() * 2, unit: 'cm', confidence: isLidar ? 96 : 87, landmarkKeys: ['mid'] },
        { key: 'Wrist circumference',value: 15.0 + Math.random(), unit: 'cm', confidence: isLidar ? 98 : 90, landmarkKeys: ['distal'] }
      ]
    } else if (part === 'Wrist') {
      measurements = [
        { key: 'Wrist width',   value: 5.2 + Math.random(), unit: 'cm', confidence: isLidar ? 99 : 90, landmarkKeys: ['mid'] },
        { key: 'Wrist depth',   value: 3.8 + Math.random(), unit: 'cm', confidence: isLidar ? 97 : 85, landmarkKeys: ['mid'] },
        { key: 'Circumference', value: 15.4 + Math.random(), unit: 'cm', confidence: isLidar ? 98 : 91, landmarkKeys: ['mid', 'distal'] }
      ]
    } else if (part === 'Ankle') {
      measurements = [
        { key: 'Ankle height',       value: 9.2 + Math.random(), unit: 'cm', confidence: isLidar ? 98 : 88, landmarkKeys: ['proximal', 'mid'] },
        { key: 'Malleolus width',    value: 7.1 + Math.random(), unit: 'cm', confidence: isLidar ? 97 : 86, landmarkKeys: ['mid'] },
        { key: 'Heel circumference', value: 31.2 + Math.random() * 2, unit: 'cm', confidence: isLidar ? 96 : 82, landmarkKeys: ['mid', 'distal'] },
        { key: 'Arch circumference', value: 23.9 + Math.random(), unit: 'cm', confidence: isLidar ? 98 : 89, landmarkKeys: ['distal'] }
      ]
    } else { // Elbow
      measurements = [
        { key: 'Joint width',      value: 8.1 + Math.random(), unit: 'cm', confidence: isLidar ? 98 : 91, landmarkKeys: ['mid'] },
        { key: 'Upper arm circ.', value: 27.9 + Math.random() * 2, unit: 'cm', confidence: isLidar ? 97 : 88, landmarkKeys: ['proximal'] },
        { key: 'Forearm circ.',   value: 21.8 + Math.random() * 2, unit: 'cm', confidence: isLidar ? 96 : 89, landmarkKeys: ['distal'] }
      ]
    }

    const calculatedQuality = Math.floor(finalImages.reduce((sum, im) => sum + im.qualityScore, 0) / finalImages.length)

    const finalCase: OrthoCase = {
      ...patientData,
      id,
      submittedAt: new Date().toISOString(),
      images: finalImages,
      measurements,
      overallQuality: calculatedQuality,
      status: 'review',
      doctorName,
      deviceModel: deviceNameMap[device],
      deviceOS: (device === 'android' ? 'Android' : 'iOS'),
      isLidarScan: isLidar,
      lidarMeshExported: isLidar,
      castType: 'Standard Cast',
      castThickness: 3.5,
      castColor: 'Medical White',
      ventPattern: 'Circular mesh'
    }

    await saveNewCase(finalCase)
    
    // Write audit log entry
    writeAuditLog(
      userEmail,
      userRole,
      'Scan Captured',
      `Captured ${finalImages.length}-view scan for patient ${patientData.patientName} (${id}) using ${deviceNameMap[device]}. Precision: ${isLidar ? '0.2mm LiDAR Mesh' : 'Standard 2D ArUco'}.`
    )

    onComplete(finalCase)
  }

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    width: '100%',
    background: '#0B0F19', // Sleek clinical dark background for scanning UI
    color: '#E2E8F0',
    overflow: 'hidden'
  }

  if (processing) {
    return (
      <div style={{ ...containerStyle, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <div style={{ maxWidth: 460, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {/* Futuristic Radar Pulse Spinner */}
          <div style={{ position: 'relative', width: 90, height: 90, marginBottom: 32 }}>
            <div className="lidar-pulse" style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              borderRadius: '50%', border: '2px solid var(--accent)', background: 'rgba(99,102,241,0.05)'
            }} />
            <div className="animate-spin-slow" style={{
              position: 'absolute', top: 10, left: 10, right: 10, bottom: 10,
              borderRadius: '50%', border: '1px dashed var(--lidar-blue)', opacity: 0.8
            }} />
            <div style={{
              position: 'absolute', top: 32, left: 32, width: 26, height: 26,
              borderRadius: '50%', background: 'var(--accent)', display: 'flex',
              alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'white'
            }}>AI</div>
          </div>

          <h3 style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em', marginBottom: 6 }}>Processing Orthopedic Scan Data</h3>
          <div style={{ width: '100%', height: 4, background: '#1F2937', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
            <div style={{ width: `${processProgress}%`, height: '100%', background: isLidar ? 'var(--lidar-blue)' : 'var(--accent)', transition: 'width 0.3s' }} />
          </div>

          {/* Console logs */}
          <div style={{
            width: '100%',
            background: '#020617',
            border: '1px solid #1F2937',
            borderRadius: 6,
            padding: 14,
            height: 160,
            overflowY: 'auto',
            fontFamily: 'var(--mono)',
            fontSize: 11,
            color: '#38BDF8',
            display: 'flex',
            flexDirection: 'column',
            gap: 6
          }}>
            {processLogs.map((log, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                <span style={{ color: '#64748B' }}>&gt;</span>
                <span style={{ color: log.includes('audit') || log.includes('finalized') ? '#34D399' : '#38BDF8' }}>{log}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const angleLabel = isLidar 
    ? (currentStep === 0 ? 'Anterior Sweep (180°)' : 'Posterior Sweep (180°)')
    : ANGLES[currentStep]

  return (
    <div style={containerStyle}>
      {/* Top Header */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '12px 20px',
        borderBottom: '1px solid #1F2937', background: '#111827', flexShrink: 0
      }}>
        <div>
          <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--lidar-blue)', letterSpacing: '0.05em' }}>
            Technician Scan Interface
          </span>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: 'white', marginTop: 1 }}>
            {patientData.patientName} · {patientData.bodyPart} ({patientData.side})
          </h2>
        </div>

        <div style={{ flex: 1 }} />

        {/* Device Select */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: '#9CA3AF' }}>Active Device:</span>
          <select
            value={device}
            onChange={e => {
              setDevice(e.target.value as any)
              setCurrentStep(0)
              setCapturedImages([])
              setCapturing(false)
            }}
            style={{
              background: '#1F2937', color: 'white', border: '1px solid #374151',
              borderRadius: 4, padding: '4px 8px', fontSize: 12, outline: 'none'
            }}
          >
            <option value="ipad_lidar">iPad Pro M4 (LiDAR Scan)</option>
            <option value="iphone_lidar">iPhone 15 Pro (LiDAR Scan)</option>
            <option value="android">Android Phone (Camera Only)</option>
            <option value="iphone_std">iPhone 15 (Camera Only)</option>
          </select>
        </div>
      </div>

      {/* Main Grid: Left Viewfinder, Right Guidelines & Checklist */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        
        {/* Left Side: Viewfinder */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', padding: 24,
          position: 'relative', background: '#020617'
        }} className={isLidar ? "grid-bg-lidar" : "grid-bg"}>
          
          {/* Simulated Camera Viewfinder */}
          <div 
            style={{
              width: '100%', maxWidth: 440, aspectRatio: '4/3',
              background: '#0B0F19', border: '1px solid #374151',
              borderRadius: 10, overflow: 'hidden', position: 'relative',
              boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
            }}
            className={capturing ? "" : (isLidar ? "scanner-overlay-lidar" : "scanner-overlay")}
          >
            {capturing ? (
              // Captured Static image preview
              <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                <div style={{
                  position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                  background: 'rgba(99,102,241,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <svg width="100%" height="100%" viewBox="0 0 100 100">
                    <rect width="100" height="100" fill="#0B0F19"/>
                    {/* Outline of Limb */}
                    {patientData.bodyPart === 'Forearm' && (
                      <path d="M 36 15 C 34 30, 32 50, 38 85 C 42 88, 58 88, 62 85 C 68 50, 66 30, 64 15 Z" fill="rgba(99,102,241,0.08)" stroke="var(--accent)" strokeWidth="1" strokeDasharray="1,1"/>
                    )}
                    {patientData.bodyPart === 'Wrist' && (
                      <ellipse cx="50" cy="50" rx="20" ry="15" fill="none" stroke="var(--accent)" strokeWidth="1"/>
                    )}
                    {patientData.bodyPart === 'Ankle' && (
                      <path d="M 38 20 C 37 40, 34 60, 32 75 C 32 82, 45 84, 68 80 Z" fill="rgba(99,102,241,0.08)" stroke="var(--accent)" strokeWidth="1"/>
                    )}
                    {/* Landmarks indicator */}
                    <circle cx="50" cy="22" r="2" fill="var(--red)" />
                    <circle cx="50" cy="50" r="2" fill="var(--red)" />
                    <circle cx="50" cy="82" r="2" fill="var(--red)" />
                    
                    {/* ArUco box */}
                    {!isLidar && (
                      <g transform="translate(10, 10)">
                        <rect width="12" height="12" fill="black" stroke="white" strokeWidth="0.5"/>
                        <rect x="2" y="2" width="8" height="8" fill="white"/>
                        <rect x="2" y="2" width="4" height="4" fill="black"/>
                        <rect x="6" y="6" width="4" height="4" fill="black"/>
                      </g>
                    )}
                  </svg>
                </div>
                <div style={{
                  position: 'absolute', top: 12, left: 12,
                  fontSize: 10, fontFamily: 'var(--mono)',
                  background: 'rgba(16,185,129,0.9)', color: 'white',
                  padding: '2px 6px', borderRadius: 4
                }}>
                  FRAME VERIFIED ✓
                </div>
              </div>
            ) : (
              // Live scanner viewfinder simulation
              <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                
                {/* 3D mesh points for LiDAR devices */}
                {isLidar && (
                  <div style={{
                    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                    display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 15,
                    padding: 20, opacity: 0.4
                  }}>
                    {Array.from({length: 40}).map((_, i) => (
                      <div key={i} style={{
                        width: 3, height: 3, borderRadius: '50%',
                        background: '#0ea5e9', boxShadow: '0 0 6px #0ea5e9'
                      }} />
                    ))}
                  </div>
                )}

                {/* Guide overlay */}
                <div style={{
                  position: 'absolute', top: '10%', left: '20%', right: '20%', bottom: '15%',
                  border: '1.5px dashed rgba(255,255,255,0.2)', borderRadius: 12,
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 20 }}>
                    Align patient's {patientData.bodyPart} within this frame
                  </span>
                </div>

                {/* ArUco validation guide for standard camera */}
                {!isLidar && (
                  <div style={{
                    position: 'absolute', top: 16, left: 16,
                    border: '1.5px dashed var(--accent)', padding: '16px 20px', borderRadius: 4,
                    background: 'rgba(99,102,241,0.03)'
                  }}>
                    <span style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--accent)', display: 'block', marginBottom: 2 }}>ARUCO TARGET BOX</span>
                    <div style={{ width: 24, height: 24, background: '#1E2937', border: '1px solid #475569' }} />
                  </div>
                )}

                {/* Real-time scanning feedback banner */}
                <div style={{
                  position: 'absolute', bottom: 12,
                  background: 'rgba(15,23,42,0.85)', padding: '6px 12px',
                  borderRadius: 20, border: '1px solid #374151', fontSize: 11,
                  display: 'flex', alignItems: 'center', gap: 6
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: checking ? 'var(--amber)' : 'var(--green)', animation: 'lidarPulse 1.5s infinite' }} />
                  <span style={{ fontFamily: 'var(--mono)', color: '#9CA3AF' }}>
                    {checking ? 'Analyzing frame metrics...' : `Ready to capture: ${angleLabel}`}
                  </span>
                </div>

                {/* LiDAR specific tag */}
                {isLidar && (
                  <div style={{
                    position: 'absolute', top: 12, right: 12,
                    background: 'var(--lidar-bg)', border: '1px solid var(--lidar-bdr)',
                    padding: '3px 8px', borderRadius: 4, fontSize: 10, color: 'var(--lidar-blue)',
                    fontFamily: 'var(--mono)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5
                  }}>
                    <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: 'var(--lidar-blue)' }} />
                    ARKit LiDAR (0.2mm Precision)
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Diagnostics readout below viewfinder */}
          <div style={{
            width: '100%', maxWidth: 440, marginTop: 12,
            background: '#111827', border: '1px solid #1F2937',
            borderRadius: 6, padding: '10px 14px', display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', fontSize: 11, color: '#9CA3AF'
          }}>
            <div>
              <span style={{ color: '#64748B' }}>ISO:</span> <span style={{ color: 'white', fontFamily: 'var(--mono)' }}>120</span>
              <span style={{ color: '#64748B', marginLeft: 10 }}>EXP:</span> <span style={{ color: 'white', fontFamily: 'var(--mono)' }}>1/120s</span>
            </div>
            <div>
              <span style={{ color: '#64748B' }}>Focal Length:</span> <span style={{ color: 'white', fontFamily: 'var(--mono)' }}>26mm</span>
            </div>
            <div>
              <span style={{ color: '#64748B' }}>F:</span> <span style={{ color: 'white', fontFamily: 'var(--mono)' }}>1.8</span>
            </div>
          </div>
        </div>

        {/* Right Side: Step Progress & Quality validation Checklist */}
        <div style={{
          width: 320, minWidth: 320, borderLeft: '1px solid #1F2937',
          background: '#111827', display: 'flex', flexDirection: 'column', flexShrink: 0
        }}>
          {/* Progress Tracker */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #1F2937' }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.05em', marginBottom: 8 }}>
              Scan Progress ({currentStep + 1}/{stepsCount})
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {Array.from({ length: stepsCount }).map((_, i) => (
                <div 
                  key={i} 
                  style={{
                    flex: 1, height: 4, borderRadius: 2,
                    background: i < currentStep ? 'var(--green)' : i === currentStep ? 'var(--accent)' : '#1F2937'
                  }} 
                />
              ))}
            </div>
            <div style={{ fontSize: 13, color: 'white', fontWeight: 600, marginTop: 10 }}>
              {angleLabel}
            </div>
            <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>
              {isLidar 
                ? 'Sweep slowly around the limb, maintaining a distance of 30-40cm.' 
                : `Ensure standard lighting and that calibration marker is visible at a 90° camera tilt.`
              }
            </p>
          </div>

          {/* Real-time Check results */}
          <div style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.05em' }}>
              Quality Validation Checklist
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { key: 'resolution', label: 'Resolution check (minimum 8MP)', val: checks.resolution },
                { key: 'brightness', label: 'Exposure & Brightness calibration', val: checks.brightness },
                { key: 'motion', label: 'Motion blur stabilization', val: checks.motion },
                { key: 'blur', label: 'Edge sharpness & blur test', val: checks.blur },
                ...(isLidar 
                  ? [{ key: 'aruco', label: 'ARKit 3D mesh density check', val: checks.aruco }]
                  : [{ key: 'aruco', label: 'ArUco calibration marker focus', val: checks.aruco }]
                )
              ].map(chk => (
                <div key={chk.key} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  fontSize: 12, color: chk.val ? 'white' : '#64748B'
                }}>
                  <div style={{
                    width: 16, height: 16, borderRadius: '50%',
                    border: `1.5px solid ${chk.val ? 'var(--green)' : '#374151'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: chk.val ? 'var(--green-bg)' : 'transparent',
                    color: 'var(--green)', fontSize: 9, fontWeight: 700
                  }}>
                    {chk.val ? '✓' : ''}
                  </div>
                  <span>{chk.label}</span>
                </div>
              ))}
            </div>

            {/* Extra instruction info based on phone type */}
            <div style={{
              background: '#0B0F19', border: '1px solid #1F2937',
              borderRadius: 6, padding: 12, marginTop: 10
            }}>
              <span style={{ fontSize: 10, color: 'var(--lidar-blue)', fontWeight: 600, display: 'block', marginBottom: 3 }}>
                {isLidar ? 'Apple LiDAR Mapping Active' : 'Standard 2D Camera Mode'}
              </span>
              <p style={{ fontSize: 11, color: '#9CA3AF', lineHeight: 1.4 }}>
                {isLidar 
                  ? 'Capturing dense point clouds and spatial meshes. Point cloud will be saved directly as OBJ/PLY files for immediate 3D cast fabrication.' 
                  : 'Ensure the printed ArUco scale marker is completely flat against the skin near the fracture point. Do not warp the paper.'
                }
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ padding: '16px 20px', borderTop: '1px solid #1F2937', background: '#0B0F19', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {capturing ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setCapturing(false)}
                  style={{
                    flex: 1, padding: '10px 0', borderRadius: 'var(--r)',
                    border: '1px solid #374151', background: 'transparent',
                    color: '#9CA3AF', cursor: 'pointer', fontSize: 12, fontWeight: 500
                  }}
                >
                  Retake
                </button>
                <button
                  onClick={handleConfirmFrame}
                  style={{
                    flex: 2, padding: '10px 0', borderRadius: 'var(--r)',
                    border: 'none', background: 'var(--green)',
                    color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600
                  }}
                >
                  Confirm View ✓
                </button>
              </div>
            ) : (
              <button
                onClick={handleCapture}
                disabled={checking}
                style={{
                  width: '100%', padding: '12px 0', borderRadius: 'var(--r)',
                  border: 'none', background: checking ? '#374151' : 'var(--accent)',
                  color: 'white', cursor: checking ? 'not-allowed' : 'pointer',
                  fontSize: 13, fontWeight: 600, textAlign: 'center',
                  boxShadow: checking ? 'none' : '0 2px 8px rgba(99,102,241,0.25)'
                }}
              >
                {checking ? 'Analyzing Exposure...' : 'Capture Image Frame'}
              </button>
            )}

            <button
              onClick={onCancel}
              style={{
                width: '100%', padding: '8px 0', borderRadius: 'var(--r)',
                border: 'none', background: 'transparent',
                color: '#64748B', cursor: 'pointer', fontSize: 11, textAlign: 'center'
              }}
            >
              Abort Scan Session
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
