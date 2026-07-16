import { useEffect, useRef, useState } from 'react'

interface Props {
  castColor: string
  ventPattern: string
  thickness: number
  isLidar?: boolean
  measurements?: { key: string; value: number; manualValue?: number }[]
  bodyPart?: string
}

interface Point3D {
  x: number
  y: number
  z: number
}

export default function Cast3DVisualizer({ castColor, ventPattern, thickness, isLidar, measurements = [], bodyPart = 'Forearm' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  
  // Rotation angles in radians
  const [rx, setRx] = useState(-0.3)
  const [ry, setRy] = useState(0.5)
  const isDragging = useRef(false)
  const lastMousePos = useRef({ x: 0, y: 0 })
  const animationRef = useRef<number | null>(null)

  // Map user-friendly colors to HEX colors
  const getHexColor = (col: string) => {
    switch (col) {
      case 'Deep Violet':
        return '#818CF8'
      case 'Neon Teal':
        return '#2DD4BF'
      case 'Carbon Black':
        return '#475569'
      case 'Medical White':
      default:
        return '#E2E8F0'
    }
  }

  const hexColor = getHexColor(castColor)

  // Handle drag-to-rotate events
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDragging.current = true
    lastMousePos.current = { x: e.clientX, y: e.clientY }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging.current) return
    const dx = e.clientX - lastMousePos.current.x
    const dy = e.clientY - lastMousePos.current.y
    
    setRy(prev => prev + dx * 0.007)
    setRx(prev => Math.max(-Math.PI / 3, Math.min(Math.PI / 3, prev + dy * 0.007)))
    
    lastMousePos.current = { x: e.clientX, y: e.clientY }
  }

  const handleMouseUpOrLeave = () => {
    isDragging.current = false
  }

  // ─── Derive geometry from real patient measurements ──────────────────────
  // Measurements are stored in cm; convert to canvas units (pixels) using a
  // consistent scale: 1 cm = 2.8 px at 160 ring-height baseline.
  const getM = (keyword: string, fallback: number) => {
    const m = measurements.find(x => x.key.toLowerCase().includes(keyword))
    if (!m) return fallback
    return (m.manualValue !== undefined && m.manualValue > 0) ? m.manualValue : m.value
  }

  const part = (bodyPart || 'Forearm').toLowerCase()

  // Anatomical fallbacks (cm) → canvas px (1 cm ≈ 2.0 px for ring radius)
  // These match the STL exporter fallbacks
  let fallbackProxCircCm = 23, fallbackDistCircCm = 16.5, fallbackLenCm = 25
  if (part.includes('wrist'))    { fallbackProxCircCm = 16.5; fallbackDistCircCm = 16;   fallbackLenCm = 12  }
  if (part.includes('ankle'))    { fallbackProxCircCm = 26;   fallbackDistCircCm = 22;   fallbackLenCm = 20  }
  if (part.includes('elbow'))    { fallbackProxCircCm = 29;   fallbackDistCircCm = 23;   fallbackLenCm = 14  }
  if (part.includes('hand'))     { fallbackProxCircCm = 16.5; fallbackDistCircCm = 19.5; fallbackLenCm = 18  }
  if (part.includes('foot'))     { fallbackProxCircCm = 22;   fallbackDistCircCm = 24;   fallbackLenCm = 22  }
  if (part.includes('knee'))     { fallbackProxCircCm = 38;   fallbackDistCircCm = 31;   fallbackLenCm = 25  }
  if (part.includes('shoulder')) { fallbackProxCircCm = 35;   fallbackDistCircCm = 29;   fallbackLenCm = 20  }

  const proxCircCm = getM('proximal', fallbackProxCircCm)
  const distCircCm = getM('wrist circumference', fallbackDistCircCm)
  const lenCm      = getM('total length', fallbackLenCm)

  // Convert circumference → radius in canvas units (scale: 1 cm = 1.6 canvas px)
  const SCALE = 1.6
  const radiusProximal = Math.max(10, (proxCircCm / (2 * Math.PI)) * SCALE)
  const radiusDistal   = Math.max(8,  (distCircCm / (2 * Math.PI)) * SCALE)
  const ringHeight     = Math.max(60, lenCm * SCALE * 4.5)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let localRy = ry

    const render = () => {
      // Auto-rotate if not dragging
      if (!isDragging.current) {
        localRy += 0.006
      } else {
        localRy = ry // Sync with react state when dragging
      }

      const w = canvas.width
      const h = canvas.height
      ctx.clearRect(0, 0, w, h)

      // Perspective Projection parameters
      const project = (p: Point3D) => {
        // Rotate around Y-axis
        const cosY = Math.cos(localRy)
        const sinY = Math.sin(localRy)
        let x1 = p.x * cosY - p.z * sinY
        let z1 = p.x * sinY + p.z * cosY

        // Rotate around X-axis
        const cosX = Math.cos(rx)
        const sinX = Math.sin(rx)
        let y2 = p.y * cosX - z1 * sinX
        let z2 = p.y * sinX + z1 * cosX

        // Perspective division
        const dist = 300
        const scale = dist / (z2 + dist)
        const px = x1 * scale + w / 2
        const py = y2 * scale + h / 2

        return { x: px, y: py, z: z2 }
      }

      // ─── 1. Draw inner forearm limb bone / core ────────────────────────────
      const rings = 12
      const segments = 16

      // Point generation lists
      const outerVerts: Point3D[][] = []
      const innerVerts: Point3D[][] = []
      const armVerts: Point3D[][] = []

      const shellThick = thickness * 2.2

      // Math matches stlExporter.ts exactly, scaled for the canvas
      const getSliceParams = (t: number) => {
        let cx = 0
        let cy = -ringHeight / 2 + t * ringHeight
        let cz = 0
        let rxScale = 1.0
        let rzScale = 1.0

        let baseRad = radiusDistal * (1 - t) + radiusProximal * t

        if (part.includes('ankle') || part.includes('foot')) {
          const bendT = 0.4
          if (t < bendT) {
            const factor = (bendT - t) / bendT
            cz = factor * ringHeight * 0.45
            cy = -ringHeight / 2 + (bendT * ringHeight) * 0.15 * (1 - factor)
            rxScale = 1.0 - factor * 0.12
            rzScale = 1.0 + factor * 0.25
            baseRad = radiusDistal * 1.15
          } else {
            const factor = (t - bendT) / (1 - bendT)
            baseRad = radiusDistal * (1 - factor) + radiusProximal * factor
          }
        } else if (part.includes('elbow') || part.includes('knee')) {
          const bendT = 0.5
          const angle = 0.7
          if (t > bendT) {
            const factor = (t - bendT) / (1 - bendT)
            const bendDist = factor * (ringHeight * 0.5)
            cz = -bendDist * Math.sin(angle)
            cy = -ringHeight / 2 + bendT * ringHeight + bendDist * Math.cos(angle)
          }
          const jointBulge = Math.exp(-Math.pow(t - bendT, 2) * 50) * 0.15
          baseRad = baseRad * (1 + jointBulge)
        } else if (part.includes('wrist') || part.includes('hand')) {
          const wristT = 0.3
          if (t < wristT) {
            const factor = (wristT - t) / wristT
            baseRad = radiusDistal * (1.0 + factor * 0.22)
            rxScale = 1.1 + factor * 0.2
            rzScale = 0.95 - factor * 0.1
          } else {
            const factor = (t - wristT) / (1 - wristT)
            baseRad = radiusDistal * (1.0 - factor * 0.05) + radiusProximal * factor
            rxScale = 1.0 + (1 - factor) * 0.1
            rzScale = 1.0 - (1 - factor) * 0.1
          }
        } else {
          const bulge = Math.sin(t * Math.PI) * 0.15
          baseRad = baseRad * (1.0 + bulge)
          rxScale = 1.05
          rzScale = 0.95
        }

        return { cx, cy, cz, rx: baseRad * rxScale, rz: baseRad * rzScale }
      }

      for (let r = 0; r <= rings; r++) {
        const t = r / rings // 0 to 1
        const { cx, cy, cz, rx: sliceRx, rz: sliceRz } = getSliceParams(t)
        
        const outerRing: Point3D[] = []
        const innerRing: Point3D[] = []
        const armRing: Point3D[] = []

        const inRx = Math.max(4, sliceRx - shellThick)
        const inRz = Math.max(4, sliceRz - shellThick)
        const armRx = Math.max(2, sliceRx - shellThick - 4)
        const armRz = Math.max(2, sliceRz - shellThick - 4)

        for (let s = 0; s < segments; s++) {
          const theta = (s / segments) * Math.PI * 2
          const cos = Math.cos(theta)
          const sin = Math.sin(theta)

          outerRing.push({ x: cx + sliceRx * cos, y: cy, z: cz + sliceRz * sin })
          innerRing.push({ x: cx + inRx * cos,    y: cy, z: cz + inRz * sin })
          armRing.push({   x: cx + armRx * cos,   y: cy, z: cz + armRz * sin })
        }

        outerVerts.push(outerRing)
        innerVerts.push(innerRing)
        armVerts.push(armRing)
      }

      // Draw Arm Core (Faint grey outline)
      ctx.strokeStyle = 'rgba(71, 85, 105, 0.25)'
      ctx.lineWidth = 0.8
      for (let r = 0; r <= rings; r++) {
        ctx.beginPath()
        for (let s = 0; s <= segments; s++) {
          const pt = project(armVerts[r][s % segments])
          if (s === 0) ctx.moveTo(pt.x, pt.y)
          else ctx.lineTo(pt.x, pt.y)
        }
        ctx.stroke()
      }

      // ─── 2. Draw Cast Shell depending on ventPattern ───────────────────────
      ctx.strokeStyle = hexColor
      ctx.lineWidth = Math.max(1, thickness * 0.4)

      // Draw connection bridges at top & bottom rims
      ctx.strokeStyle = hexColor
      ctx.beginPath()
      for (let s = 0; s < segments; s++) {
        const pTopOut = project(outerVerts[0][s])
        const pTopIn = project(innerVerts[0][s])
        ctx.moveTo(pTopOut.x, pTopOut.y)
        ctx.lineTo(pTopIn.x, pTopIn.y)

        const pBotOut = project(outerVerts[rings][s])
        const pBotIn = project(innerVerts[rings][s])
        ctx.moveTo(pBotOut.x, pBotOut.y)
        ctx.lineTo(pBotIn.x, pBotIn.y)
      }
      ctx.stroke()

      if (ventPattern === 'Honeycomb') {
        // Draw Honeycomb hexagon wireframe
        ctx.beginPath()
        for (let r = 0; r < rings; r++) {
          for (let s = 0; s < segments; s++) {
            const p1 = project(outerVerts[r][s])
            const p2 = project(outerVerts[r + 1][(s + (r % 2 === 0 ? 1 : 0)) % segments])
            const p3 = project(outerVerts[r][(s + 1) % segments])

            ctx.moveTo(p1.x, p1.y)
            ctx.lineTo(p2.x, p2.y)
            ctx.lineTo(p3.x, p3.y)
          }
        }
        ctx.stroke()

        // Draw inner shell support honeycomb
        ctx.strokeStyle = `${hexColor}33` // faint opacity
        ctx.beginPath()
        for (let r = 0; r < rings; r++) {
          for (let s = 0; s < segments; s++) {
            const p1 = project(innerVerts[r][s])
            const p2 = project(innerVerts[r + 1][(s + (r % 2 === 0 ? 1 : 0)) % segments])
            const p3 = project(innerVerts[r][(s + 1) % segments])

            ctx.moveTo(p1.x, p1.y)
            ctx.lineTo(p2.x, p2.y)
            ctx.lineTo(p3.x, p3.y)
          }
        }
        ctx.stroke()

      } else if (ventPattern === 'Circular mesh') {
        // Draw circular mesh structure (horizontal rings + vertical ribs + circular dots)
        // Draw circles at grid junctions
        for (let r = 1; r < rings; r++) {
          for (let s = 0; s < segments; s++) {
            const pt = project(outerVerts[r][s])
            if (pt.z < 30) { // Only draw front-facing dots
              ctx.fillStyle = hexColor
              ctx.beginPath()
              ctx.arc(pt.x, pt.y, Math.max(1.5, thickness * 0.7), 0, Math.PI * 2)
              ctx.fill()
            }
          }
        }

        // Horizontal rings outer
        ctx.strokeStyle = hexColor
        for (let r = 0; r <= rings; r += 2) {
          ctx.beginPath()
          for (let s = 0; s <= segments; s++) {
            const pt = project(outerVerts[r][s % segments])
            if (s === 0) ctx.moveTo(pt.x, pt.y)
            else ctx.lineTo(pt.x, pt.y)
          }
          ctx.stroke()
        }

        // Longitudinal vertical lines
        ctx.beginPath()
        for (let s = 0; s < segments; s += 2) {
          const start = project(outerVerts[0][s])
          ctx.moveTo(start.x, start.y)
          for (let r = 1; r <= rings; r++) {
            const pt = project(outerVerts[r][s])
            ctx.lineTo(pt.x, pt.y)
          }
        }
        ctx.stroke()

      } else {
        // Organic Voronoi Webbing (random looking triangulation struts)
        ctx.beginPath()
        for (let r = 0; r < rings; r++) {
          for (let s = 0; s < segments; s++) {
            const p1 = project(outerVerts[r][s])
            const p2 = project(outerVerts[r + 1][s])
            const p3 = project(outerVerts[r][(s + 1) % segments])
            const p4 = project(outerVerts[r + 1][(s + 2) % segments]) // Voronoi shift

            ctx.moveTo(p1.x, p1.y)
            ctx.lineTo(p2.x, p2.y)
            ctx.moveTo(p1.x, p1.y)
            ctx.lineTo(p3.x, p3.y)

            // Random webbing struts
            if ((s + r) % 3 === 0) {
              ctx.moveTo(p1.x, p1.y)
              ctx.lineTo(p4.x, p4.y)
            }
          }
        }
        ctx.stroke()
      }

      // ─── 3. Draw LiDAR Scan Ring (Hologram laser sweep) ────────────────────
      if (isLidar) {
        const sweepY = Math.sin(Date.now() * 0.002) * (ringHeight / 2)
        const sweepRingIdx = Math.floor(((sweepY + ringHeight / 2) / ringHeight) * rings)
        
        ctx.strokeStyle = 'rgba(14, 165, 233, 0.85)'
        ctx.lineWidth = 1.5
        ctx.shadowColor = '#0EA5E9'
        ctx.shadowBlur = 10

        ctx.beginPath()
        for (let s = 0; s <= segments; s++) {
          const pt = project(outerVerts[sweepRingIdx][s % segments])
          if (s === 0) ctx.moveTo(pt.x, pt.y)
          else ctx.lineTo(pt.x, pt.y)
        }
        ctx.stroke()
        
        // Reset shadow
        ctx.shadowBlur = 0
      }

      animationRef.current = requestAnimationFrame(render)
    }

    render()

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [rx, ry, hexColor, ventPattern, thickness, isLidar, radiusProximal, radiusDistal, ringHeight])

  return (
    <canvas
      ref={canvasRef}
      width={360}
      height={220}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUpOrLeave}
      onMouseLeave={handleMouseUpOrLeave}
      style={{
        cursor: 'grab',
        width: '100%',
        height: '100%',
        maxHeight: 200,
        background: '#070A13',
        borderRadius: 8,
        touchAction: 'none'
      }}
    />
  )
}
