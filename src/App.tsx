import { useState, useCallback, useEffect } from 'react'
import type { OrthoCase, CaseStatus } from './types'
import TopBar from './components/shared/TopBar'
import SideRail from './components/shared/SideRail'
import CaseQueue from './components/queue/CaseQueue'
import CaseDetail from './components/detail/CaseDetail'
import Login from './pages/Login'
import PatientRegistration from './components/registration/PatientRegistration'
import GuidedCapture from './components/guided/GuidedCapture'
import DeviceDiagnostics from './components/devices/DeviceDiagnostics'
import AuditTrail from './components/audit/AuditTrail'
import { fetchCases, writeAuditLog } from './data/api'

const SESSION_MAX = 180 // 3 minutes timeout

export default function App() {
  const [authed, setAuthed] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const [userRole, setUserRole] = useState<'Doctor' | 'Technician'>('Doctor')
  
  // Navigation views
  const [activeView, setActiveView] = useState<'queue' | 'register' | 'capture' | 'devices' | 'analytics' | 'audit'>('queue')
  const [activeFilter, setActiveFilter] = useState<CaseStatus | 'all'>('all')
  const [selected, setSelected] = useState<OrthoCase | null>(null)
  
  // Patient flow state
  const [registeredPatient, setRegisteredPatient] = useState<any | null>(null)
  
  // Theme state
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  // Case database state for sidebar badge numbers
  const [casesList, setCasesList] = useState<OrthoCase[]>([])
  const [refreshKey, setRefreshKey] = useState(0)

  // Session timeout states
  const [timeLeft, setTimeLeft] = useState(SESSION_MAX)
  const [showTimeoutWarn, setShowTimeoutWarn] = useState(false)

  // Load and refresh case counts
  useEffect(() => {
    fetchCases('all').then(setCasesList)
  }, [refreshKey, activeView])

  // Track session timer countdown
  useEffect(() => {
    if (!authed) return
    
    const interval = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(interval)
          handleLogout(true) // timeout logout
          return 0
        }
        if (t <= 60) {
          setShowTimeoutWarn(true)
        } else {
          setShowTimeoutWarn(false)
        }
        return t - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [authed])

  // Reset timer on user interactions
  useEffect(() => {
    if (!authed) return
    
    function resetTimer() {
      setTimeLeft(SESSION_MAX)
      setShowTimeoutWarn(false)
    }

    window.addEventListener('mousemove', resetTimer)
    window.addEventListener('keydown', resetTimer)
    window.addEventListener('mousedown', resetTimer)
    
    return () => {
      window.removeEventListener('mousemove', resetTimer)
      window.removeEventListener('keydown', resetTimer)
      window.removeEventListener('mousedown', resetTimer)
    }
  }, [authed])

  // Theme Syncing
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  }, [theme])

  const handleLogin = (email: string, role: 'Doctor' | 'Technician') => {
    setUserEmail(email)
    setUserRole(role)
    setAuthed(true)
    setTimeLeft(SESSION_MAX)
    writeAuditLog(email, role, 'User Login', `Successfully authenticated clinical workspace. Session timeout initialized.`)
  }

  const handleLogout = useCallback((timedOut = false) => {
    if (userEmail) {
      writeAuditLog(
        userEmail,
        userRole,
        timedOut ? 'Session Timeout' : 'User Logout',
        timedOut ? 'Workspace locked automatically due to inactivity watchdog.' : 'Closed clinical workstation session.'
      )
    }
    setAuthed(false)
    setUserEmail('')
    setSelected(null)
    setActiveView('queue')
    setActiveFilter('all')
    setRegisteredPatient(null)
    setShowTimeoutWarn(false)
  }, [userEmail, userRole])

  const handleUpdated = useCallback((c: OrthoCase) => {
    setSelected(c)
    setRefreshKey(k => k + 1)
  }, [])

  const handleLogEvent = useCallback((action: string, details: string) => {
    writeAuditLog(userEmail, userRole, action, details)
    setRefreshKey(k => k + 1)
  }, [userEmail, userRole])

  // Calculate status counts for side badges
  const counts = {
    review: casesList.filter(c => c.status === 'review').length,
    pending: casesList.filter(c => c.status === 'pending').length,
    approved: casesList.filter(c => c.status === 'approved').length,
    rescan: casesList.filter(c => c.status === 'rescan').length,
  }

  if (!authed) return <Login onLogin={handleLogin} />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: 'var(--bg)', color: 'var(--ink)' }}>
      
      {/* Top Header */}
      <TopBar 
        userEmail={userEmail} 
        userRole={userRole} 
        onLogout={() => handleLogout(false)} 
        theme={theme}
        onToggleTheme={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
      />
      
      {/* Main Container */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        
        {/* Navigation Sidebar */}
        <SideRail 
          activeView={activeView} 
          activeFilter={activeFilter} 
          counts={counts}
          onChangeView={setActiveView}
          onChangeFilter={setActiveFilter}
        />

        {/* Content Workspace Area */}
        <main style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
          
          {activeView === 'queue' && (
            <>
              {/* Central Queue Table */}
              <CaseQueue 
                key={refreshKey} 
                selectedId={selected?.id ?? null} 
                onSelect={setSelected} 
                activeFilter={activeFilter}
                onChangeFilter={setActiveFilter}
              />
              
              {/* Right Side Detail Drawer */}
              <aside style={{
                width: 360, minWidth: 360, flexShrink: 0,
                borderLeft: '1px solid var(--bdr)',
                background: 'var(--surface)',
                display: 'flex', flexDirection: 'column',
              }}>
                <div style={{
                  padding: '12px 16px', borderBottom: '1px solid var(--bdr)',
                  fontSize: 11, fontWeight: 700, color: 'var(--ink-3)',
                  textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0,
                  background: 'var(--surface)'
                }}>Workspace Detail</div>
                
                <CaseDetail 
                  orthoCase={selected} 
                  onUpdated={handleUpdated} 
                  userEmail={userEmail}
                  userRole={userRole}
                />
              </aside>
            </>
          )}

          {activeView === 'register' && (
            <PatientRegistration 
              onRegister={(data) => {
                setRegisteredPatient(data)
                setActiveView('capture')
              }}
              onCancel={() => {
                setActiveView('queue')
              }}
            />
          )}

          {activeView === 'capture' && registeredPatient && (
            <GuidedCapture 
              patientData={registeredPatient}
              doctorName={userRole === 'Doctor' ? 'Dr. Priya Kapoor' : 'Dr. Rajan Nair'}
              userEmail={userEmail}
              userRole={userRole}
              onComplete={(newCase) => {
                setRegisteredPatient(null)
                setSelected(newCase)
                setActiveView('queue')
                setActiveFilter('review')
                setRefreshKey(k => k + 1)
              }}
              onCancel={() => {
                setRegisteredPatient(null)
                setActiveView('queue')
              }}
            />
          )}

          {activeView === 'devices' && (
            <DeviceDiagnostics 
              onLogAction={handleLogEvent}
            />
          )}

          {activeView === 'audit' && (
            <AuditTrail />
          )}

          {/* Session Expiry Warning Card */}
          {showTimeoutWarn && (
            <div style={{
              position: 'absolute', bottom: 16, right: 16,
              background: 'var(--amber-bg)', border: '1px solid var(--amber-bdr)',
              borderRadius: 8, padding: '12px 16px', width: 280,
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 100,
              display: 'flex', flexDirection: 'column', gap: 8
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--amber)' }}>
                ⚠️ Session Timeout Impending
              </div>
              <p style={{ fontSize: 11, color: 'var(--ink-2)', lineHeight: 1.4 }}>
                Your clinical workspace will auto-lock in <strong>{timeLeft} seconds</strong> due to inactivity rules.
              </p>
              <button
                onClick={() => {
                  setTimeLeft(SESSION_MAX)
                  setShowTimeoutWarn(false)
                }}
                style={{
                  background: 'var(--amber)', color: 'white', border: 'none',
                  fontSize: 11, fontWeight: 600, padding: '6px 12px',
                  borderRadius: 4, cursor: 'pointer', textAlign: 'center'
                }}
              >
                Extend Session Work
              </button>
            </div>
          )}

        </main>
      </div>
    </div>
  )
}

