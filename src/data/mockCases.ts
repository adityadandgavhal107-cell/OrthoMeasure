import type { OrthoCase } from '../types'

const makeImages = (part: string, angles: string[], scores: number[]): any[] =>
  angles.map((angle, i) => {
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

    return {
      id: `${part}-${angle.replace(/\s/g, '-')}-${i}`,
      angle,
      url: makeSVG(part, angle, scores[i], landmarks, contourPath),
      qualityScore: scores[i],
      blurDetected: scores[i] < 75,
      motionDetected: scores[i] < 70,
      brightnessValidation: scores[i] >= 80,
      resolutionCheck: '3024 x 4032',
      landmarks,
      contourPath,
    }
  })

function makeSVG(part: string, angle: string, _q: number, landmarks: any, contourPath: string): string {
  const shapes: Record<string, string> = {
    Forearm: `<rect x="30" y="15" width="40" height="70" rx="12" fill="none" stroke="%23D4D4D0" stroke-width="1.5"/><line x1="50" y1="18" x2="50" y2="82" stroke="%235746AF" stroke-width="0.5" opacity="0.4"/>`,
    Wrist:   `<ellipse cx="50" cy="50" rx="26" ry="20" fill="none" stroke="%23D4D4D0" stroke-width="1.5"/><ellipse cx="50" cy="50" rx="16" ry="12" fill="none" stroke="%235746AF" stroke-width="0.5" opacity="0.4"/>`,
    Ankle:   `<path d="M32%2C22 Q28%2C55 36%2C78 Q50%2C84 64%2C78 Q72%2C55 68%2C22 Z" fill="none" stroke="%23D4D4D0" stroke-width="1.5"/>`,
    Elbow:   `<path d="M35%2C18 L35%2C48 Q35%2C62 50%2C66 Q65%2C62 65%2C48 L65%2C18" fill="none" stroke="%23D4D4D0" stroke-width="1.5"/><circle cx="50" cy="52" r="9" fill="none" stroke="%235746AF" stroke-width="0.5" opacity="0.4"/>`,
  }
  const s = shapes[part] ?? shapes.Forearm
  const label = angle.replace(/\s/g, '_').toUpperCase().substring(0, 6)

  // Draw ArUco calibration marker (10x10 square with high-contrast blocks in upper-right corner)
  const arucoMarker = `<g transform="translate(10, 10)"><rect width="12" height="12" fill="black"/><rect x="2" y="2" width="8" height="8" fill="white"/><rect x="2" y="2" width="4" height="4" fill="black"/><rect x="6" y="6" width="4" height="4" fill="black"/><text x="6" y="-2" font-size="3" fill="%235746AF" font-family="monospace">ARUCO 4cm</text></g>`

  // Draw simple representation of contour path in SVG (dotted green line)
  const contour = `<path d="${contourPath}" fill="%235746AF" fill-opacity="0.05" stroke="%2318794E" stroke-width="1" stroke-dasharray="2,2"/>`

  // Draw landmark points
  const points = Object.entries(landmarks).map(([_, lm]: [string, any]) => {
    return `<circle cx="${lm.x}" cy="${lm.y}" r="2.5" fill="%23C62A2F"/><text x="${lm.x + 4}" y="${lm.y + 1.5}" font-size="4" fill="%23C62A2F" font-family="sans-serif" font-weight="bold">${lm.label}</text>`
  }).join('')

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="%23F7F7F5"/>${contour}${s}${arucoMarker}${points}<text x="50" y="94" text-anchor="middle" font-family="monospace" font-size="6" fill="%23A8A8A8">${label}</text></svg>`
  return `data:image/svg+xml,${svg}`
}

export const MOCK_CASES: OrthoCase[] = [
  {
    id: 'OM-2024-0091', patientName: 'Arjun Mehta', patientAge: 34, patientGender: 'M',
    bodyPart: 'Forearm', side: 'Right', diagnosis: 'Distal radius fracture',
    doctorName: 'Dr. Priya Kapoor', submittedAt: new Date(Date.now() - 2 * 60000).toISOString(),
    overallQuality: 94, status: 'review', mobilityStatus: 'Limited', swellingStatus: 'Moderate',
    scanPurpose: 'Custom cast prep',
    doctorNotes: 'Post-reduction immobilization required. Swelling is moderate — recommend re-measurement in 72h if cast tightens.',
    images: makeImages('Forearm', ['Front','Back','Left','Right','45° L','45° R'], [96,92,88,94,91,89]),
    measurements: [
      { key: 'Total length',       value: 25.4, unit: 'cm', confidence: 96, landmarkKeys: ['proximal', 'distal'] },
      { key: 'Proximal width',     value: 7.8,  unit: 'cm', confidence: 91, landmarkKeys: ['proximal'] },
      { key: 'Distal width',       value: 5.6,  unit: 'cm', confidence: 94, landmarkKeys: ['distal'] },
      { key: 'Mid circumference',  value: 21.2, unit: 'cm', confidence: 88, landmarkKeys: ['mid'] },
      { key: 'Wrist circumference',value: 15.8, unit: 'cm', confidence: 93, landmarkKeys: ['distal'] },
    ],
    deviceModel: 'iPad Pro M4 (11")', deviceOS: 'iOS', isLidarScan: true, lidarMeshExported: true,
    castType: 'Ventilated sleeve', castThickness: 3.5, castColor: 'Deep Violet', ventPattern: 'Honeycomb'
  },
  {
    id: 'OM-2024-0090', patientName: 'Sneha Iyer', patientAge: 28, patientGender: 'F',
    bodyPart: 'Wrist', side: 'Left', diagnosis: 'Scaphoid fracture',
    doctorName: 'Dr. Rajan Nair', submittedAt: new Date(Date.now() - 18 * 60000).toISOString(),
    overallQuality: 87, status: 'review', mobilityStatus: 'None', swellingStatus: 'Mild',
    scanPurpose: 'Thumb spica cast',
    doctorNotes: 'Scaphoid fracture confirmed. Custom thumb spica cast required. Measurements consistent across angles.',
    images: makeImages('Wrist', ['Dorsal','Volar','Radial','Ulnar','Oblique','Lat 45°'], [90,85,92,88,82,91]),
    measurements: [
      { key: 'Wrist width',      value: 5.1,  unit: 'cm', confidence: 89, landmarkKeys: ['mid'] },
      { key: 'Wrist depth',      value: 3.7,  unit: 'cm', confidence: 86, landmarkKeys: ['mid'] },
      { key: 'Circumference',    value: 15.3, unit: 'cm', confidence: 91, landmarkKeys: ['mid', 'distal'] },
      { key: 'Thumb base girth', value: 7.2,  unit: 'cm', confidence: 84, landmarkKeys: ['distal'] },
    ],
    deviceModel: 'Samsung Galaxy S24 Ultra', deviceOS: 'Android', isLidarScan: false, lidarMeshExported: false,
    castType: 'Standard Cast', castThickness: 4.0, castColor: 'Medical White', ventPattern: 'Circular mesh'
  },
  {
    id: 'OM-2024-0089', patientName: 'Kiran Reddy', patientAge: 52, patientGender: 'M',
    bodyPart: 'Ankle', side: 'Left', diagnosis: 'Bimalleolar fracture',
    doctorName: 'Dr. Priya Kapoor', submittedAt: new Date(Date.now() - 41 * 60000).toISOString(),
    overallQuality: 79, status: 'pending', mobilityStatus: 'None', swellingStatus: 'Significant',
    scanPurpose: 'Ankle cast prep', doctorNotes: '',
    images: makeImages('Ankle', ['Medial','Lateral','Anterior','Posterior','Plantar','Dorsal'], [84,79,88,82,74,80]),
    measurements: [
      { key: 'Ankle height',       value: 9.6,  unit: 'cm', confidence: 82, landmarkKeys: ['proximal', 'mid'] },
      { key: 'Malleolus width',    value: 7.4,  unit: 'cm', confidence: 79, landmarkKeys: ['mid'] },
      { key: 'Heel circumference', value: 32.1, unit: 'cm', confidence: 76, landmarkKeys: ['mid', 'distal'] },
      { key: 'Arch circumference', value: 24.8, unit: 'cm', confidence: 81, landmarkKeys: ['distal'] },
    ],
    deviceModel: 'iPhone 15 Pro Max', deviceOS: 'iOS', isLidarScan: true, lidarMeshExported: true,
    castType: 'Exoskeleton splint', castThickness: 3.0, castColor: 'Carbon Black', ventPattern: 'Voronoi structure'
  },
  {
    id: 'OM-2024-0088', patientName: 'Deepa Sharma', patientAge: 19, patientGender: 'F',
    bodyPart: 'Elbow', side: 'Right', diagnosis: 'Lateral condyle fracture',
    doctorName: 'Dr. Amit Singh', submittedAt: new Date(Date.now() - 72 * 60000).toISOString(),
    overallQuality: 91, status: 'approved', mobilityStatus: 'Partial', swellingStatus: 'None',
    scanPurpose: 'Custom elbow splint',
    doctorNotes: 'Measurements approved. Forwarded to manufacturing. Cast specs locked.',
    images: makeImages('Elbow', ['Anterior','Posterior','Medial','Lateral','Ext 45°','Flex 45°'], [94,91,89,93,90,88]),
    measurements: [
      { key: 'Joint width',      value: 8.3,  unit: 'cm', confidence: 93, landmarkKeys: ['mid'] },
      { key: 'Upper arm circ.', value: 28.6, unit: 'cm', confidence: 91, landmarkKeys: ['proximal'] },
      { key: 'Forearm circ.',   value: 22.4, unit: 'cm', confidence: 89, landmarkKeys: ['distal'] },
      { key: 'Olecranon depth', value: 4.1,  unit: 'cm', confidence: 87, landmarkKeys: ['mid'] },
    ],
    deviceModel: 'Google Pixel 8 Pro', deviceOS: 'Android', isLidarScan: false, lidarMeshExported: false,
    castType: 'Ventilated sleeve', castThickness: 3.2, castColor: 'Neon Teal', ventPattern: 'Honeycomb'
  },
  {
    id: 'OM-2024-0087', patientName: 'Rohit Verma', patientAge: 45, patientGender: 'M',
    bodyPart: 'Forearm', side: 'Left', diagnosis: 'Both-bone forearm fracture',
    doctorName: 'Dr. Rajan Nair', submittedAt: new Date(Date.now() - 125 * 60000).toISOString(),
    overallQuality: 62, status: 'rescan', mobilityStatus: 'None', swellingStatus: 'Severe',
    scanPurpose: 'Custom cast prep',
    doctorNotes: 'Blur detected in 45° captures. Motion artifact on 3 of 6 images. Re-scan requested.',
    images: makeImages('Forearm', ['Front','Back','Left','Right','45° L','45° R'], [80,75,72,78,61,65]),
    measurements: [
      { key: 'Total length',        value: 26.1, unit: 'cm', confidence: 71, landmarkKeys: ['proximal', 'distal'] },
      { key: 'Proximal width',      value: 8.2,  unit: 'cm', confidence: 65, landmarkKeys: ['proximal'] },
      { key: 'Distal width',        value: 6.1,  unit: 'cm', confidence: 63, landmarkKeys: ['distal'] },
      { key: 'Mid circumference',   value: 22.8, unit: 'cm', confidence: 68, landmarkKeys: ['mid'] },
      { key: 'Wrist circumference', value: 16.4, unit: 'cm', confidence: 70, landmarkKeys: ['distal'] },
    ],
    deviceModel: 'iPad Air (Standard Camera)', deviceOS: 'iOS', isLidarScan: false, lidarMeshExported: false,
    castType: 'Standard Cast', castThickness: 4.0, castColor: 'Medical White', ventPattern: 'Circular mesh'
  },
  {
    id: 'OM-2024-0086', patientName: 'Anita Joshi', patientAge: 67, patientGender: 'F',
    bodyPart: 'Wrist', side: 'Right', diagnosis: "Colles' fracture",
    doctorName: 'Dr. Priya Kapoor', submittedAt: new Date(Date.now() - 210 * 60000).toISOString(),
    overallQuality: 88, status: 'approved', mobilityStatus: 'Limited', swellingStatus: 'Mild',
    scanPurpose: 'Cast preparation', doctorNotes: 'Approved. Casting prep underway.',
    images: makeImages('Wrist', ['Dorsal','Volar','Radial','Ulnar','Oblique','Lat 45°'], [91,88,86,90,85,89]),
    measurements: [
      { key: 'Wrist width',   value: 5.4,  unit: 'cm', confidence: 90, landmarkKeys: ['mid'] },
      { key: 'Wrist depth',   value: 4.0,  unit: 'cm', confidence: 88, landmarkKeys: ['mid'] },
      { key: 'Circumference', value: 16.1, unit: 'cm', confidence: 92, landmarkKeys: ['mid', 'distal'] },
    ],
    deviceModel: 'iPhone 14 Pro', deviceOS: 'iOS', isLidarScan: true, lidarMeshExported: true,
    castType: 'Exoskeleton splint', castThickness: 2.8, castColor: 'Deep Violet', ventPattern: 'Voronoi structure'
  },
  {
    id: 'OM-2024-0085', patientName: 'Vikas Patel', patientAge: 31, patientGender: 'M',
    bodyPart: 'Ankle', side: 'Right', diagnosis: 'Lateral ligament rupture',
    doctorName: 'Dr. Amit Singh', submittedAt: new Date(Date.now() - 301 * 60000).toISOString(),
    overallQuality: 95, status: 'pending', mobilityStatus: 'Partial', swellingStatus: 'Moderate',
    scanPurpose: 'Ankle brace measurement', doctorNotes: '',
    images: makeImages('Ankle', ['Medial','Lateral','Anterior','Posterior','Plantar','Dorsal'], [96,94,97,95,93,96]),
    measurements: [
      { key: 'Ankle height',       value: 8.9,  unit: 'cm', confidence: 96, landmarkKeys: ['proximal', 'mid'] },
      { key: 'Malleolus width',    value: 6.8,  unit: 'cm', confidence: 95, landmarkKeys: ['mid'] },
      { key: 'Heel circumference', value: 30.4, unit: 'cm', confidence: 94, landmarkKeys: ['mid', 'distal'] },
      { key: 'Arch circumference', value: 23.2, unit: 'cm', confidence: 97, landmarkKeys: ['distal'] },
    ],
    deviceModel: 'iPad Pro M2 (12.9")', deviceOS: 'iOS', isLidarScan: true, lidarMeshExported: true,
    castType: 'Ventilated sleeve', castThickness: 3.5, castColor: 'Carbon Black', ventPattern: 'Honeycomb'
  },
  {
    id: 'OM-2024-0084', patientName: 'Meera Nambiar', patientAge: 23, patientGender: 'F',
    bodyPart: 'Forearm', side: 'Right', diagnosis: 'Greenstick fracture',
    doctorName: 'Dr. Rajan Nair', submittedAt: new Date(Date.now() - 415 * 60000).toISOString(),
    overallQuality: 90, status: 'approved', mobilityStatus: 'Partial', swellingStatus: 'None',
    scanPurpose: 'Pediatric forearm cast',
    doctorNotes: 'Pediatric-adjacent case. Small-form measurements validated manually. Approved.',
    images: makeImages('Forearm', ['Front','Back','Left','Right','45° L','45° R'], [92,90,88,91,89,90]),
    measurements: [
      { key: 'Total length',        value: 20.8, unit: 'cm', confidence: 92, landmarkKeys: ['proximal', 'distal'] },
      { key: 'Proximal width',      value: 6.2,  unit: 'cm', confidence: 90, landmarkKeys: ['proximal'] },
      { key: 'Distal width',        value: 4.4,  unit: 'cm', confidence: 91, landmarkKeys: ['distal'] },
      { key: 'Mid circumference',   value: 17.6, unit: 'cm', confidence: 89, landmarkKeys: ['mid'] },
      { key: 'Wrist circumference', value: 13.1, unit: 'cm', confidence: 88, landmarkKeys: ['distal'] },
    ],
    deviceModel: 'Google Pixel 7a', deviceOS: 'Android', isLidarScan: false, lidarMeshExported: false,
    castType: 'Standard Cast', castThickness: 3.0, castColor: 'Medical White', ventPattern: 'Circular mesh'
  },
]

