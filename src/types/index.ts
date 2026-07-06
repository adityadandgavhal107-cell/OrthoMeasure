export type CaseStatus = 'pending' | 'review' | 'approved' | 'rescan'

export interface Landmark {
  label: string
  x: number // percentage 0-100 on image
  y: number // percentage 0-100 on image
}

export interface Measurement {
  key: string
  value: number
  unit: string
  confidence: number
  landmarkKeys?: string[] // which landmarks affect this measurement
}

export interface ScanImage {
  id: string
  angle: string
  url: string
  qualityScore: number
  blurDetected: boolean
  motionDetected: boolean
  brightnessValidation?: boolean
  resolutionCheck?: string
  landmarks?: Record<string, Landmark>
  contourPath?: string // SVG path for limb segmentation overlay
}

export interface OrthoCase {
  id: string
  patientName: string
  patientAge: number
  patientGender: 'M' | 'F' | 'Other'
  bodyPart: string
  side: 'Left' | 'Right'
  diagnosis: string
  doctorName: string
  submittedAt: string
  overallQuality: number
  status: CaseStatus
  mobilityStatus: string
  swellingStatus: string
  doctorNotes: string
  scanPurpose: string
  images: ScanImage[]
  measurements: Measurement[]
  // LiDAR and Device features
  deviceModel?: string
  deviceOS?: 'iOS' | 'Android'
  isLidarScan?: boolean
  lidarMeshExported?: boolean
  // Casting customization specs
  castType?: string
  castThickness?: number
  castColor?: string
  ventPattern?: string
}

export interface AuditLog {
  id: string
  timestamp: string
  userEmail: string
  userRole: 'Doctor' | 'Technician'
  action: string
  details: string
}

export interface Device {
  id: string
  password?: string
  name: string
  os: 'iOS' | 'Android'
  type: 'Tablet' | 'Phone'
  lidar: boolean
  battery: number
  storage: string
  status: 'online' | 'offline' | 'needs_calibration'
  version: string
  calibrationDate: string
}

