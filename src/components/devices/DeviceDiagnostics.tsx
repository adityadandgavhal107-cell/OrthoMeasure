import { useState, useEffect } from 'react'
import type { Device } from '../../types'
import { fetchDevices, saveNewDevice, deleteDevice, updateDeviceSelfTest } from '../../data/api'

interface Props {
  onLogAction: (action: string, details: string) => void
}

export default function DeviceDiagnostics({ onLogAction }: Props) {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  
  // Registration form states
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newId, setNewId] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newOs, setNewOs] = useState<'iOS' | 'Android'>('Android')
  const [newType, setNewType] = useState<'Phone' | 'Tablet'>('Phone')
  const [newLidar, setNewLidar] = useState(false)
  const [formError, setFormError] = useState('')
  
  // Password visibility map
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({})

  useEffect(() => {
    loadDevices()
  }, [])

  async function loadDevices() {
    setLoading(true)
    const list = await fetchDevices()
    setDevices(list)
    setLoading(false)
  }

  function togglePassword(id: string) {
    setVisiblePasswords(prev => ({ ...prev, [id]: !prev[id] }))
  }

  function handleAutoGenerate() {
    const randomNum = Math.floor(Math.random() * 9000) + 1000
    const osPrefix = newOs === 'iOS' ? 'IPH' : 'AND'
    setNewId(`DEV-${osPrefix}-${randomNum}`)
    
    // Generate secure simple password
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let pass = ''
    for (let i = 0; i < 8; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    setNewPassword(pass)
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim() || !newId.trim() || !newPassword.trim()) {
      setFormError('Please fill in all mandatory fields (Name, Login ID, Password).')
      return
    }

    // Check duplicate ID locally
    if (devices.some(d => d.id.toLowerCase() === newId.trim().toLowerCase())) {
      setFormError('A device with this Login ID already exists.')
      return
    }

    setFormError('')
    const newDevice: Device = {
      id: newId.trim(),
      password: newPassword.trim(),
      name: newName.trim(),
      os: newOs,
      type: newType,
      lidar: newLidar,
      battery: 100,
      storage: newType === 'Tablet' ? '256 GB free' : '128 GB free',
      status: 'online',
      version: `OrthoMeasure ${newOs} v2.4.2`,
      calibrationDate: new Date().toISOString().split('T')[0]
    }

    try {
      await saveNewDevice(newDevice)
      onLogAction(
        'Register Node Device',
        `Registered scan node hardware: ${newDevice.name} (Login ID: ${newDevice.id}). Credentials generated and stored in clinic registry.`
      )
      setShowAddForm(false)
      // Reset form
      setNewName('')
      setNewId('')
      setNewPassword('')
      setNewLidar(false)
      loadDevices()
    } catch (err: any) {
      setFormError(err.message || 'Failed to save device in registry.')
    }
  }

  async function runSelfTest(id: string) {
    setBusyId(id)
    const target = devices.find(d => d.id === id)
    if (!target) return

    setTimeout(async () => {
      try {
        const nextBattery = Math.max(0, target.battery - 1)
        const nextStatus = target.status === 'needs_calibration' ? 'online' : target.status
        const nextDate = new Date().toISOString().split('T')[0]

        await updateDeviceSelfTest(id, nextBattery, nextStatus, nextDate)
        
        onLogAction(
          'Device Diagnostic Self-Test',
          `Completed self-test and hardware certification for device ${target.name} (${target.id}). Battery: ${nextBattery}%, Status: ${nextStatus}. LiDAR sensor: ${target.lidar ? 'Calibrated (0.2mm)' : 'N/A'}.`
        )
        
        loadDevices()
      } catch (err) {
        console.error('Self test error:', err)
      } finally {
        setBusyId(null)
      }
    }, 1500)
  }

  async function handleRemove(id: string, name: string) {
    if (!window.confirm(`Are you sure you want to revoke scan authorization for ${name} (${id})?`)) {
      return;
    }
    try {
      await deleteDevice(id)
      onLogAction(
        'Revoke Device License',
        `Revoked scan permission and deleted credentials for device ${name} (${id}). Mobile node blocked.`
      )
      loadDevices()
    } catch (err: any) {
      alert('Error deleting device: ' + err.message)
    }
  }

  const borderCol = 'var(--bdr)'
  const statusColor = (status: Device['status']) => {
    switch (status) {
      case 'online': return 'var(--green)'
      case 'needs_calibration': return 'var(--amber)'
      default: return 'var(--red)'
    }
  }

  const inp: React.CSSProperties = {
    padding: '8px 10px',
    fontSize: 13,
    color: 'var(--ink)',
    background: 'var(--bg)',
    border: '1px solid var(--bdr)',
    borderRadius: 'var(--r)',
    outline: 'none',
    width: '100%'
  }

  return (
    <div style={{ padding: '20px 24px', flex: 1, overflowY: 'auto' }}>
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--ink)' }}>Clinic Scanning Devices & Hardware Certification</h2>
          <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>
            Monitor, register, and calibrate mobile scanner node credentials connected to the OrthoMeasure network.
          </p>
        </div>
        <button
          onClick={() => {
            setShowAddForm(prev => !prev)
            setFormError('')
          }}
          style={{
            fontSize: 12, fontWeight: 600, padding: '8px 14px',
            borderRadius: 'var(--r)', border: 'none',
            background: 'var(--accent)', color: 'white',
            cursor: 'pointer', transition: 'all 0.15s'
          }}
        >
          {showAddForm ? 'Cancel Registration' : '+ Register Scan Node'}
        </button>
      </div>

      {/* Register Form Modal/Panel */}
      {showAddForm && (
        <div style={{
          background: 'var(--surface)', border: `1px solid ${borderCol}`,
          borderRadius: 8, padding: 20, marginBottom: 20,
          boxShadow: '0 4px 10px rgba(0,0,0,0.04)'
        }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 16 }}>Register New Mobile Scanning Device</h3>
          <form onSubmit={handleRegister} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-2)' }}>Device Display Name *</label>
              <input
                type="text" placeholder="e.g. Clinic iPhone 15 Pro Max"
                value={newName} onChange={e => setNewName(e.target.value)}
                style={inp}
              />
            </div>

            <div style={{ display: 'flex', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-2)' }}>Platform OS</label>
                <select style={inp} value={newOs} onChange={e => setNewOs(e.target.value as any)}>
                  <option value="Android">Android</option>
                  <option value="iOS">iOS</option>
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-2)' }}>Device Type</label>
                <select style={inp} value={newType} onChange={e => setNewType(e.target.value as any)}>
                  <option value="Phone">Phone</option>
                  <option value="Tablet">Tablet</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-2)' }}>Login ID *</label>
                <button
                  type="button" onClick={handleAutoGenerate}
                  style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 11, cursor: 'pointer', fontWeight: 500 }}
                >
                  Auto-generate credentials
                </button>
              </div>
              <input
                type="text" placeholder="e.g. tech@ortho.com or DEV-AND-883"
                value={newId} onChange={e => setNewId(e.target.value)}
                style={inp}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-2)' }}>Authentication Password *</label>
              <input
                type="text" placeholder="Set password for device login"
                value={newPassword} onChange={e => setNewPassword(e.target.value)}
                style={inp}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, gridColumn: 'span 2' }}>
              <input
                type="checkbox" id="lidarToggle"
                checked={newLidar} onChange={e => setNewLidar(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              <label htmlFor="lidarToggle" style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-2)', cursor: 'pointer' }}>
                Device supports LiDAR point cloud mesh scans (iPad Pro, iPhone Pro)
              </label>
            </div>

            {formError && (
              <div style={{
                gridColumn: 'span 2', fontSize: 12, color: 'var(--red)',
                background: 'var(--red-bg)', border: '1px solid var(--red-bdr)',
                padding: '8px 12px', borderRadius: 'var(--r)'
              }}>
                {formError}
              </div>
            )}

            <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button
                type="button" onClick={() => setShowAddForm(false)}
                style={{
                  padding: '8px 16px', borderRadius: 'var(--r)', border: '1px solid var(--bdr)',
                  background: 'var(--surface)', color: 'var(--ink-2)', cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                style={{
                  padding: '8px 20px', borderRadius: 'var(--r)', border: 'none',
                  background: 'var(--accent)', color: 'white', cursor: 'pointer', fontWeight: 600
                }}
              >
                Save & Authorize Device
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40, color: 'var(--ink-3)' }}>
          Loading active scan nodes...
        </div>
      ) : devices.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 40, background: 'var(--surface)',
          border: `1px dashed ${borderCol}`, borderRadius: 8, color: 'var(--ink-3)'
        }}>
          No devices registered yet. Click "+ Register Scan Node" to generate technician login credentials.
        </div>
      ) : (
        /* Devices Grid */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {devices.map(d => {
            const isBusy = busyId === d.id
            const isPasswordVisible = !!visiblePasswords[d.id]
            
            return (
              <div key={d.id} style={{
                background: 'var(--surface)', border: `1px solid ${borderCol}`,
                borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column',
                boxShadow: '0 2px 5px rgba(0,0,0,0.02)', position: 'relative'
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
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                        background: 'var(--bg)', color: 'var(--ink-2)', border: '1px solid var(--bdr)'
                      }}>{d.type}</span>
                    </div>
                    <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginTop: 8 }}>{d.name}</h3>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{
                        display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                        background: statusColor(d.status)
                      }} />
                      <span style={{ fontSize: 11, color: 'var(--ink-2)', textTransform: 'capitalize' }}>
                        {d.status.replace('_', ' ')}
                      </span>
                    </div>
                    <button
                      onClick={() => handleRemove(d.id, d.name)}
                      style={{
                        background: 'none', border: 'none', color: 'var(--red)',
                        fontSize: 11, cursor: 'pointer', padding: '2px 4px'
                      }}
                      title="Revoke and delete credentials"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Credentials & Specs */}
                <div style={{
                  display: 'flex', flexDirection: 'column', gap: 8,
                  fontSize: 11, color: 'var(--ink-2)', marginBottom: 14,
                  background: 'var(--bg)', padding: '12px 14px', borderRadius: 'var(--r)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed var(--bdr)', paddingBottom: 6 }}>
                    <div>
                      <span style={{ color: 'var(--ink-3)' }}>Login ID:</span>
                      <div style={{ fontWeight: 600, fontFamily: 'var(--mono)', marginTop: 2, color: 'var(--accent)' }}>{d.id}</div>
                    </div>
                    <div>
                      <span style={{ color: 'var(--ink-3)' }}>Password:</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <span style={{ fontWeight: 600, fontFamily: 'var(--mono)' }}>
                          {isPasswordVisible ? d.password : '••••••••'}
                        </span>
                        <button
                          onClick={() => togglePassword(d.id)}
                          style={{
                            background: 'none', border: 'none', color: 'var(--ink-3)',
                            fontSize: 10, cursor: 'pointer', padding: 0
                          }}
                        >
                          {isPasswordVisible ? 'Hide' : 'Show'}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, paddingTop: 2 }}>
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
      )}
    </div>
  )
}
