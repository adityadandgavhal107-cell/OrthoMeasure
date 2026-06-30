import type { OrthoCase, CaseStatus, AuditLog } from '../types'
import { MOCK_CASES } from './mockCases'

const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

function getStoredCases(): OrthoCase[] {
  const data = localStorage.getItem('ortho_cases')
  if (!data) {
    localStorage.setItem('ortho_cases', JSON.stringify(MOCK_CASES))
    return MOCK_CASES
  }
  return JSON.parse(data)
}

function setStoredCases(cases: OrthoCase[]) {
  localStorage.setItem('ortho_cases', JSON.stringify(cases))
}

export async function fetchCases(filter: CaseStatus | 'all' = 'all'): Promise<OrthoCase[]> {
  await delay(80)
  const cases = getStoredCases()
  return filter === 'all' ? cases : cases.filter(c => c.status === filter)
}

export async function updateCaseStatus(id: string, status: CaseStatus): Promise<OrthoCase> {
  await delay(100)
  const cases = getStoredCases()
  const idx = cases.findIndex(c => c.id === id)
  if (idx !== -1) {
    cases[idx].status = status
    setStoredCases(cases)
    return cases[idx]
  }
  throw new Error('Case not found')
}

export async function updateCaseMeasurements(id: string, measurements: OrthoCase['measurements'], images: OrthoCase['images']): Promise<OrthoCase> {
  await delay(100)
  const cases = getStoredCases()
  const idx = cases.findIndex(c => c.id === id)
  if (idx !== -1) {
    cases[idx].measurements = measurements
    cases[idx].images = images
    setStoredCases(cases)
    return cases[idx]
  }
  throw new Error('Case not found')
}

export async function updateCaseCastSettings(
  id: string, 
  settings: { castType: string; castThickness: number; castColor: string; ventPattern: string }
): Promise<OrthoCase> {
  await delay(100)
  const cases = getStoredCases()
  const idx = cases.findIndex(c => c.id === id)
  if (idx !== -1) {
    cases[idx] = { ...cases[idx], ...settings }
    setStoredCases(cases)
    return cases[idx]
  }
  throw new Error('Case not found')
}

export async function saveNewCase(newCase: OrthoCase): Promise<OrthoCase> {
  await delay(150)
  const cases = getStoredCases()
  // Add at the beginning of the list
  cases.unshift(newCase)
  setStoredCases(cases)
  return newCase
}

// Audit Logs Service
export function getStoredAuditLogs(): AuditLog[] {
  const data = localStorage.getItem('ortho_audit_logs')
  if (!data) {
    const initialLogs: AuditLog[] = [
      {
        id: 'AUD-001',
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        userEmail: 'admin@ortho.com',
        userRole: 'Doctor',
        action: 'System Initialization',
        details: 'Loaded initial orthopedic mock records.'
      }
    ]
    localStorage.setItem('ortho_audit_logs', JSON.stringify(initialLogs))
    return initialLogs
  }
  return JSON.parse(data)
}

export function writeAuditLog(userEmail: string, role: 'Doctor' | 'Technician', action: string, details: string): AuditLog {
  const logs = getStoredAuditLogs()
  const newLog: AuditLog = {
    id: `AUD-${String(logs.length + 1).padStart(3, '0')}`,
    timestamp: new Date().toISOString(),
    userEmail,
    userRole: role,
    action,
    details
  }
  logs.unshift(newLog)
  localStorage.setItem('ortho_audit_logs', JSON.stringify(logs))
  return newLog
}

