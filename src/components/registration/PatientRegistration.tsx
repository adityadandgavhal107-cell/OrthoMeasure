import { useState } from 'react'
import type { OrthoCase } from '../../types'

interface Props {
  onRegister: (data: Omit<OrthoCase, 'id' | 'submittedAt' | 'images' | 'measurements' | 'overallQuality' | 'status' | 'doctorName'>) => void
  onCancel: () => void
}

export default function PatientRegistration({ onRegister, onCancel }: Props) {
  const [name, setName] = useState('')
  const [age, setAge] = useState('')
  const [gender, setGender] = useState<'M' | 'F' | 'Other'>('M')
  const [bodyPart, setBodyPart] = useState('Forearm')
  const [side, setSide] = useState<'Left' | 'Right'>('Right')
  const [scanPurpose, setScanPurpose] = useState('Custom 3D Cast Preparation')
  const [diagnosis, setDiagnosis] = useState('')
  const [mobilityStatus, setMobilityStatus] = useState('Limited')
  const [swellingStatus, setSwellingStatus] = useState('Moderate')
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name || !age || !diagnosis) {
      setError('Please fill in all mandatory fields (Name, Age, Diagnosis).')
      return
    }
    if (!consent) {
      setError('Patient consent is mandatory before starting any medical scan.')
      return
    }
    setError('')
    onRegister({
      patientName: name,
      patientAge: parseInt(age) || 30,
      patientGender: gender,
      bodyPart,
      side,
      scanPurpose,
      diagnosis,
      mobilityStatus,
      swellingStatus,
      doctorNotes: ''
    })
  }

  const groupStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 5
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--ink-2)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em'
  }

  const inputStyle: React.CSSProperties = {
    padding: '8px 12px',
    fontSize: 13,
    color: 'var(--ink)',
    background: 'var(--bg)',
    border: '1px solid var(--bdr)',
    borderRadius: 'var(--r)',
    outline: 'none',
    width: '100%'
  }

  return (
    <div style={{ padding: '20px 24px', flex: 1, overflowY: 'auto', maxWidth: 640, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--ink)' }}>New Patient Scan Registration</h2>
        <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>
          Enter patient details to initialize the multi-angle capture protocol.
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Main Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Patient Info */}
          <div style={groupStyle}>
            <label style={labelStyle}>Patient Name *</label>
            <input 
              style={inputStyle} 
              type="text" 
              placeholder="e.g. John Doe" 
              value={name} 
              onChange={e => setName(e.target.value)} 
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={groupStyle}>
              <label style={labelStyle}>Age *</label>
              <input 
                style={inputStyle} 
                type="number" 
                placeholder="Age" 
                value={age} 
                onChange={e => setAge(e.target.value)} 
              />
            </div>
            <div style={groupStyle}>
              <label style={labelStyle}>Gender *</label>
              <select 
                style={inputStyle} 
                value={gender} 
                onChange={e => setGender(e.target.value as any)}
              >
                <option value="M">Male</option>
                <option value="F">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          <div style={groupStyle}>
            <label style={labelStyle}>Anatomical Location</label>
            <select 
              style={inputStyle} 
              value={bodyPart} 
              onChange={e => setBodyPart(e.target.value)}
            >
              <option value="Forearm">Forearm</option>
              <option value="Wrist">Wrist</option>
              <option value="Ankle">Ankle</option>
              <option value="Elbow">Elbow</option>
            </select>
          </div>

          <div style={groupStyle}>
            <label style={labelStyle}>Laterality</label>
            <div style={{ display: 'flex', gap: 8, height: '100%', alignItems: 'center' }}>
              {(['Left', 'Right'] as const).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSide(s)}
                  style={{
                    flex: 1,
                    padding: '8px 10px',
                    borderRadius: 'var(--r)',
                    border: `1px solid ${side === s ? 'var(--accent)' : 'var(--bdr)'}`,
                    background: side === s ? 'var(--accent-bg)' : 'var(--surface)',
                    color: side === s ? 'var(--accent)' : 'var(--ink-2)',
                    fontWeight: side === s ? 600 : 400,
                    cursor: 'pointer',
                    fontSize: 12,
                    textAlign: 'center'
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div style={groupStyle}>
            <label style={labelStyle}>Mobility Status</label>
            <select 
              style={inputStyle} 
              value={mobilityStatus} 
              onChange={e => setMobilityStatus(e.target.value)}
            >
              <option value="Normal">Normal Mobility</option>
              <option value="Partial">Partial / Assisted</option>
              <option value="Limited">Limited Range of Motion</option>
              <option value="None">None (Immobilized)</option>
            </select>
          </div>

          <div style={groupStyle}>
            <label style={labelStyle}>Swelling Status</label>
            <select 
              style={inputStyle} 
              value={swellingStatus} 
              onChange={e => setSwellingStatus(e.target.value)}
            >
              <option value="None">None</option>
              <option value="Mild">Mild Swelling</option>
              <option value="Moderate">Moderate Swelling</option>
              <option value="Severe">Severe / Inflamed</option>
            </select>
          </div>
        </div>

        <div style={groupStyle}>
          <label style={labelStyle}>Diagnosis Notes *</label>
          <input 
            style={inputStyle} 
            type="text" 
            placeholder="e.g. Distal radius fracture, non-displaced" 
            value={diagnosis} 
            onChange={e => setDiagnosis(e.target.value)} 
          />
        </div>

        <div style={groupStyle}>
          <label style={labelStyle}>Scan Purpose / Notes</label>
          <textarea 
            style={{ ...inputStyle, minHeight: 60, fontFamily: 'inherit', resize: 'vertical' }} 
            placeholder="Custom orthopedic cast modeling requirements..." 
            value={scanPurpose} 
            onChange={e => setScanPurpose(e.target.value)} 
          />
        </div>

        {/* Consent box */}
        <div style={{
          background: 'var(--accent-bg)',
          border: '1px solid var(--accent-bdr)',
          borderRadius: 'var(--r)',
          padding: '12px 16px',
          display: 'flex',
          gap: 12,
          alignItems: 'flex-start',
          marginTop: 8
        }}>
          <input 
            type="checkbox" 
            id="consent-check" 
            checked={consent}
            onChange={e => setConsent(e.target.checked)}
            style={{ marginTop: 3, cursor: 'pointer' }}
          />
          <label htmlFor="consent-check" style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5, cursor: 'pointer' }}>
            <strong style={{ color: 'var(--ink)' }}>Patient Consent Confirmed:</strong> I certify that the patient has provided verbal and written consent for orthopedic photography, LiDAR point cloud scanning, and digital measurement modeling.
          </label>
        </div>

        {error && (
          <div style={{
            fontSize: 12,
            color: 'var(--red)',
            background: 'var(--red-bg)',
            border: '1px solid var(--red-bdr)',
            borderRadius: 'var(--r)',
            padding: '10px 12px'
          }}>
            {error}
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--r)',
              border: '1px solid var(--bdr)',
              background: 'var(--surface)',
              color: 'var(--ink-2)',
              cursor: 'pointer',
              fontWeight: 500
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            style={{
              padding: '8px 20px',
              borderRadius: 'var(--r)',
              border: 'none',
              background: 'var(--accent)',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 600,
              boxShadow: '0 2px 4px rgba(99,102,241,0.2)'
            }}
          >
            Proceed to Guided Scan
          </button>
        </div>
      </form>
    </div>
  )
}
