import type { OrthoCase, CaseStatus, AuditLog, Device } from '../types'
import { supabase } from './supabase'

// Snake_case to camelCase mapper
function rowToCase(row: Record<string, unknown>): OrthoCase {
  return {
    id: row.id as string,
    patientName: row.patient_name as string,
    patientAge: row.patient_age as number,
    patientGender: row.patient_gender as 'M' | 'F' | 'Other',
    bodyPart: row.body_part as string,
    side: row.side as 'Left' | 'Right',
    diagnosis: row.diagnosis as string,
    doctorName: row.doctor_name as string,
    submittedAt: row.submitted_at as string,
    overallQuality: row.overall_quality as number,
    status: row.status as CaseStatus,
    mobilityStatus: row.mobility_status as string,
    swellingStatus: row.swelling_status as string,
    doctorNotes: row.doctor_notes as string,
    scanPurpose: row.scan_purpose as string,
    images: (row.images as OrthoCase['images']) || [],
    measurements: (row.measurements as OrthoCase['measurements']) || [],
    deviceModel: row.device_model as string | undefined,
    deviceOS: row.device_os as 'iOS' | 'Android' | undefined,
    isLidarScan: row.is_lidar_scan as boolean | undefined,
    lidarMeshExported: row.lidar_mesh_exported as boolean | undefined,
    castType: row.cast_type as string | undefined,
    castThickness: row.cast_thickness as number | undefined,
    castColor: row.cast_color as string | undefined,
    ventPattern: row.vent_pattern as string | undefined,
  }
}

// camelCase to snake_case mapper
function caseToRow(c: OrthoCase): Record<string, unknown> {
  return {
    id: c.id,
    patient_name: c.patientName,
    patient_age: c.patientAge,
    patient_gender: c.patientGender,
    body_part: c.bodyPart,
    side: c.side,
    diagnosis: c.diagnosis,
    doctor_name: c.doctorName,
    submitted_at: c.submittedAt,
    overall_quality: c.overallQuality,
    status: c.status,
    mobility_status: c.mobilityStatus,
    swelling_status: c.swellingStatus,
    doctor_notes: c.doctorNotes,
    scan_purpose: c.scanPurpose,
    images: c.images,
    measurements: c.measurements,
    device_model: c.deviceModel,
    device_os: c.deviceOS,
    is_lidar_scan: c.isLidarScan,
    lidar_mesh_exported: c.lidarMeshExported,
    cast_type: c.castType,
    cast_thickness: c.castThickness,
    cast_color: c.castColor,
    vent_pattern: c.ventPattern,
  }
}

export async function fetchCases(filter: CaseStatus | 'all' = 'all'): Promise<OrthoCase[]> {
  let query = supabase.from('ortho_cases').select('*').order('submitted_at', { ascending: false })
  if (filter !== 'all') query = query.eq('status', filter)
  const { data, error } = await query
  if (error) { console.error('fetchCases error:', error.message); return [] }
  return (data || []).map(rowToCase)
}

export async function updateCaseStatus(id: string, status: CaseStatus): Promise<OrthoCase> {
  const { data, error } = await supabase.from('ortho_cases').update({ status }).eq('id', id).select().single()
  if (error) throw new Error(error.message)
  return rowToCase(data)
}

export async function updateCaseMeasurements(id: string, measurements: OrthoCase['measurements'], images: OrthoCase['images']): Promise<OrthoCase> {
  const { data, error } = await supabase.from('ortho_cases').update({ measurements, images }).eq('id', id).select().single()
  if (error) throw new Error(error.message)
  return rowToCase(data)
}

export async function updateCaseCastSettings(id: string, settings: { castType: string; castThickness: number; castColor: string; ventPattern: string }): Promise<OrthoCase> {
  const { data, error } = await supabase.from('ortho_cases').update({ cast_type: settings.castType, cast_thickness: settings.castThickness, cast_color: settings.castColor, vent_pattern: settings.ventPattern }).eq('id', id).select().single()
  if (error) throw new Error(error.message)
  return rowToCase(data)
}

export async function saveNewCase(newCase: OrthoCase): Promise<OrthoCase> {
  const { data, error } = await supabase.from('ortho_cases').insert(caseToRow(newCase)).select().single()
  if (error) throw new Error(error.message)
  return rowToCase(data)
}

export async function getStoredAuditLogs(): Promise<AuditLog[]> {
  const { data, error } = await supabase.from('audit_logs').select('*').order('timestamp', { ascending: false }).limit(200)
  if (error) { console.error('getStoredAuditLogs error:', error.message); return [] }
  return (data || []).map(row => ({ id: row.id as string, timestamp: row.timestamp as string, userEmail: row.user_email as string, userRole: row.user_role as 'Doctor' | 'Technician', action: row.action as string, details: row.details as string }))
}

export async function writeAuditLog(userEmail: string, role: 'Doctor' | 'Technician', action: string, details: string): Promise<AuditLog> {
  const { data, error } = await supabase.from('audit_logs').insert({ user_email: userEmail, user_role: role, action, details }).select().single()
  if (error) {
    console.error('writeAuditLog error:', error.message)
    return { id: crypto.randomUUID(), timestamp: new Date().toISOString(), userEmail, userRole: role, action, details }
  }
  return { id: data.id as string, timestamp: data.timestamp as string, userEmail: data.user_email as string, userRole: data.user_role as 'Doctor' | 'Technician', action: data.action as string, details: data.details as string }
}

// ─── Devices ──────────────────────────────────────────────────────────────────

function rowToDevice(row: Record<string, any>): Device {
  return {
    id: row.id as string,
    password: row.password as string | undefined,
    name: row.name as string,
    os: row.os as 'iOS' | 'Android',
    type: row.type as 'Tablet' | 'Phone',
    lidar: row.lidar as boolean,
    battery: row.battery as number,
    storage: row.storage as string,
    status: row.status as 'online' | 'offline' | 'needs_calibration',
    version: row.version as string,
    calibrationDate: row.calibration_date as string,
  }
}

function deviceToRow(d: Device): Record<string, any> {
  return {
    id: d.id,
    password: d.password,
    name: d.name,
    os: d.os,
    type: d.type,
    lidar: d.lidar,
    battery: d.battery,
    storage: d.storage,
    status: d.status,
    version: d.version,
    calibration_date: d.calibrationDate,
  }
}

export async function fetchDevices(): Promise<Device[]> {
  const { data, error } = await supabase
    .from('clinic_devices')
    .select('*')
    .order('name', { ascending: true })

  if (error) {
    console.error('fetchDevices error:', error.message)
    return []
  }
  return (data || []).map(rowToDevice)
}

export async function saveNewDevice(device: Device): Promise<Device> {
  const { data, error } = await supabase
    .from('clinic_devices')
    .insert(deviceToRow(device))
    .select()
    .single()

  if (error) throw new Error(error.message)
  return rowToDevice(data)
}

export async function deleteDevice(id: string): Promise<void> {
  const { error } = await supabase
    .from('clinic_devices')
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message)
}

export async function updateDeviceSelfTest(
  id: string,
  battery: number,
  status: Device['status'],
  calibrationDate: string
): Promise<Device> {
  const { data, error } = await supabase
    .from('clinic_devices')
    .update({
      battery,
      status,
      calibration_date: calibrationDate,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return rowToDevice(data)
}
