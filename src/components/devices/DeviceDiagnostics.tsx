import { useState } from 'react'

interface Props {
  onLogAction: (action: string, details: string) => void
}

interface Device {
  id: string
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

const INITIAL_DEVICES: Device[] = [
  {
    id: 'DEV-IPD-09',
    name: 'Clinic iPad Pro M4 (11")',
    os: 'iOS',
    type: 'Tablet',
    lidar: true,
    battery: 88,
    storage: '184 GB free',
    status: 'online',
    version: 'OrthoMeasure iOS v2.4.1',
    calibrationDate: '2026-06-20'
  },
  {
    id: 'DEV-IPH-15',
    name: 'Dr. Priya\'s iPhone 15 Pro Max',
    os: 'iOS',
    type: 'Phone',
    lidar: true,
    battery: 94,
    storage: '68 GB free',
    status: 'online',
    version: 'OrthoMeasure iOS v2.4.0',
    calibrationDate: '2026-06-22'
  },
  {
    id: 'DEV-AND-42',
    name: 'Tech Samsung Galaxy S24 Ultra',
    os: 'Android',
    type: 'Phone',
    lidar: false,
    battery: 76,
    storage: '112 GB free',
    status: 'online',
    version: 'OrthoMeasure Android v2.3.8',
    calibrationDate: '2026-06-18'
  },
  {
    id: 'DEV-IPH-12',
    name: 'Clinic iPhone 12 (Standard)',
    os: 'iOS',
    type: 'Phone',
    lidar: false,
    battery: 45,
    storage: '12 GB free',
    status: 'needs_calibration',
    version: 'OrthoMeasure iOS v2.3.5',
    calibrationDate: '2026-05-10'
  },
  {
    id: 'DEV-TAB-02',
    name: 'Tech Google Pixel Tablet',
    os: 'Android',
    type: 'Tablet',
    lidar: false,
    battery: 0,
    storage: 'Unknown',
    status: 'offline',
    version: 'OrthoMeasure Android v2.3.8',
    calibrationDate: '2026-06-01'
  }
]

export default function DeviceDiagnostics({ onLogAction }: Props) {
  const [devices, setDevices] = useState<Device[]>(INITIAL_DEVICES)
  const [busyId, setBusyId] = useState<string | null>(null)

  function runSelfTest(id: string) {
    setBusyId(id)
    setTimeout(() => {
      setDevices(prev => 
        prev.map(d => {
          if (d.id === id) {
            const batteryChange = Math.max(0, d.battery - 1)
            const updatedStatus = d.status === 'needs_calibration' ? 'online' : d.status
            const date = new Date().toISOString().split('T')[0]
            
            // Log the audit event
            onLogAction(
              'Device Diagnostic Self-Test',
              `Completed self-test and hardware certification for device ${d.name} (${d.id}). Battery: ${batteryChange}%, Status: ${updatedStatus}. LiDAR sensor: ${d.lidar ? 'Calibrated (0.2mm)' : 'N/A'}.`
            )
            
            return {
              ...d,
              battery: batteryChange,
              status: updatedStatus,
              calibrationDate: date
            }
          }
          return d
        })
      )
      setBusyId(null)
    }, 1500)
  }

  const borderCol = 'var(--bdr)'
  const statusColor = (status: Device['status']) => {
    switch (status) {
      case 'online': return 'var(--green)'
      case 'needs_calibration': return 'var(--amber)'
      default: return 'var(--red)'
    }
  }

  return (
    <div style={{ padding: '20px 24px', flex: 1, overflowY: 'auto' }}>
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--ink)' }}>Clinic Scanning Devices & Hardware Certification</h2>
          <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>
            Monitor, calibrate, and verify scanning hardware connected to the OrthoMeasure network.
          </p>
        </div>
        <div style={{
          background: 'var(--green-bg)', border: '1px solid var(--green-bdr)',
          borderRadius: 20, padding: '4px 12px', fontSize: 11, color: 'var(--green)',
          display: 'flex', alignItems: 'center', gap: 5, fontWeight: 500
        }}>
          <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--green)' }} />
          Network Core Online
        </div>
      </div>

      {/* Devices Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
        {devices.map(d => {
          const isBusy = busyId === d.id
          return (
            <div key={d.id} style={{
              background: 'var(--surface)', border: `1px solid ${borderCol}`,
              borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column',
              boxShadow: '0 2px 5px rgba(0,0,0,0.02)'
            }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                      background: d.os === 'iOS' ? '#EFF6FF' : '#F0FDF4',
                      color: d.os === 'iOS' ? '#1D4ED8' : '#15803D'
                    }}>{d.os}</span>
                    <span style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>{d.id}</span>
                  </div>
                  <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginTop: 4 }}>{d.name}</h3>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{
                    display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                    background: statusColor(d.status)
                  }} />
                  <span style={{ fontSize: 11, color: 'var(--ink-2)', textTransform: 'capitalize' }}>
                    {d.status.replace('_', ' ')}
                  </span>
                </div>
              </div>

              {/* Specs */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
                fontSize: 11, color: 'var(--ink-2)', marginBottom: 14,
                background: 'var(--bg)', padding: '10px 12px', borderRadius: 'var(--r)'
              }}>
                <div>
                  <span style={{ color: 'var(--ink-3)' }}>LiDAR Module:</span>
                  <div style={{ fontWeight: 600, color: d.lidar ? 'var(--lidar-blue)' : 'var(--ink-2)', marginTop: 1 }}>
                    {d.lidar ? 'Active (Certified 3D)' : 'None (2D Target)'}
                  </div>
                </div>
                <div>
                  <span style={{ color: 'var(--ink-3)' }}>Battery Level:</span>
                  <div style={{ fontWeight: 600, marginTop: 1, color: d.battery <= 20 ? 'var(--red)' : 'var(--ink)' }}>
                    {d.status === 'offline' ? 'N/A' : `${d.battery}%`}
                  </div>
                </div>
                <div>
                  <span style={{ color: 'var(--ink-3)' }}>Storage Available:</span>
                  <div style={{ fontWeight: 600, marginTop: 1 }}>{d.storage}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--ink-3)' }}>Last Certified:</span>
                  <div style={{ fontWeight: 600, marginTop: 1 }}>{d.calibrationDate}</div>
                </div>
              </div>

              {/* Action */}
              <div style={{ marginTop: 'auto', display: 'flex', justifySelf: 'flex-end', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6 }}>
                <span style={{ fontSize: 10, color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>{d.version}</span>
                {d.status !== 'offline' && (
                  <button
                    disabled={isBusy}
                    onClick={() => runSelfTest(d.id)}
                    style={{
                      fontSize: 11, fontWeight: 500, padding: '4px 10px',
                      borderRadius: 'var(--r)', border: '1px solid var(--bdr-2)',
                      background: 'var(--surface)', color: 'var(--ink-2)',
                      cursor: isBusy ? 'not-allowed' : 'pointer',
                      transition: 'all 0.1s'
                    }}
                  >
                    {isBusy ? 'Testing Sensor...' : 'Verify Hardware'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
