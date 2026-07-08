import { useState, useEffect } from 'react'
import { supabase } from '../../data/supabase'

interface Weights {
  W1: number[][];
  b1: number[][];
  W2: number[][];
  b2: number[][];
  W3: number[][];
  b3: number[][];
}

interface LogEntry {
  timestamp: string;
  case_id: string;
  reward: number;
  loss: number;
  avg_error_pct: number;
}

interface ModelData {
  weights: Weights;
  trained_cases: string[];
  training_history: LogEntry[];
  stats: {
    total_trained: number;
    current_avg_reward: number;
    current_avg_error: number;
  };
}

export default function AIRLManager() {
  const [modelData, setModelData] = useState<ModelData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  
  // Sandbox states
  const [age, setAge] = useState(25)
  const [gender, setGender] = useState<'M' | 'F' | 'Other'>('M')
  const [side, setSide] = useState<'Left' | 'Right'>('Right')
  const [bodyPart, setBodyPart] = useState<'Forearm' | 'Wrist' | 'Ankle' | 'Elbow'>('Forearm')
  const [mobility, setMobility] = useState<'Normal' | 'Limited' | 'None'>('Limited')
  const [swelling, setSwelling] = useState<'Normal' | 'Mild' | 'Moderate' | 'Severe'>('Moderate')
  const [angle, setAngle] = useState<'Front' | 'Back' | 'Left' | 'Right' | '45° Left' | '45° Right'>('Front')

  // Load from Supabase scans public URL
  useEffect(() => {
    async function loadWeights() {
      try {
        setLoading(true)
        setError('')
        const publicUrl = supabase.storage.from('scans').getPublicUrl('rl_model_data.json').data.publicUrl
        
        // Cache bust
        const res = await fetch(`${publicUrl}?t=${Date.now()}`)
        if (!res.ok) {
          throw new Error('Model file not found in storage. Ensure you run "python rl_agent.py --train-all" to initialize it.')
        }
        
        const data = await res.json() as ModelData
        setModelData(data)
      } catch (err: any) {
        console.error(err)
        setError(err.message || 'Failed to download model weights.')
      } finally {
        setLoading(false)
      }
    }
    
    loadWeights()
  }, [refreshKey])

  // TypeScript Feedforward inference logic
  function runInference(): { name: string; defX: number; defY: number; predX: number; predY: number }[] {
    if (!modelData || !modelData.weights) return []
    
    const w = modelData.weights
    
    // Build state vector (23 dimensions)
    const state = new Array(23).fill(0)
    
    // 0: Age (normalized)
    state[0] = age / 100.0
    
    // 1-3: Gender
    if (gender === 'M') state[1] = 1.0
    else if (gender === 'F') state[2] = 1.0
    else state[3] = 1.0
    
    // 4-5: Side
    if (side === 'Left') state[4] = 1.0
    else state[5] = 1.0
    
    // 6-9: Body Part
    if (bodyPart === 'Forearm') state[6] = 1.0
    else if (bodyPart === 'Wrist') state[7] = 1.0
    else if (bodyPart === 'Ankle') state[8] = 1.0
    else state[9] = 1.0
    
    // 10-12: Mobility
    if (mobility === 'Normal') state[10] = 1.0
    else if (mobility === 'Limited') state[11] = 1.0
    else state[12] = 1.0
    
    // 13-16: Swelling
    if (swelling === 'Normal') state[13] = 1.0
    else if (swelling === 'Mild') state[14] = 1.0
    else if (swelling === 'Moderate') state[15] = 1.0
    else state[16] = 1.0
    
    // 17-22: Angle
    const angles = ['Front', 'Back', 'Left', 'Right', '45° Left', '45° Right']
    const angleIdx = angles.indexOf(angle)
    if (angleIdx !== -1) {
      state[17 + angleIdx] = 1.0
    }
    
    // Matrix calculations
    // Hidden 1: ReLU(X * W1 + b1)
    const h1: number[] = []
    const w1Cols = w.W1[0].length
    for (let j = 0; j < w1Cols; j++) {
      let sum = w.b1[0][j]
      for (let i = 0; i < 23; i++) {
        sum += state[i] * w.W1[i][j]
      }
      h1.push(Math.max(0, sum))
    }
    
    // Hidden 2: ReLU(h1 * W2 + b2)
    const h2: number[] = []
    const w2Cols = w.W2[0].length
    for (let j = 0; j < w2Cols; j++) {
      let sum = w.b2[0][j]
      for (let i = 0; i < h1.length; i++) {
        sum += h1[i] * w.W2[i][j]
      }
      h2.push(Math.max(0, sum))
    }
    
    // Output layer: h2 * W3 + b3
    const offsets: number[] = []
    const w3Cols = w.W3[0].length
    for (let j = 0; j < w3Cols; j++) {
      let sum = w.b3[0][j]
      for (let i = 0; i < h2.length; i++) {
        sum += h2[i] * w.W3[i][j]
      }
      offsets.push(sum)
    }
    
    // Default landmarks based on body part
    let defaults = [50.0, 18.0, 50.0, 50.0, 50.0, 82.0]
    let labels = ['Proximal', 'Mid-point', 'Distal']
    
    if (bodyPart === 'Forearm') {
      defaults = [50.0, 18.0, 50.0, 50.0, 50.0, 82.0]
      labels = ['Elbow Crease', 'Mid Forearm', 'Wrist Joint']
    } else if (bodyPart === 'Wrist') {
      defaults = [50.0, 25.0, 50.0, 50.0, 50.0, 75.0]
      labels = ['Distal Forearm', 'Wrist Crease', 'MCP Joint']
    } else if (bodyPart === 'Ankle') {
      defaults = [50.0, 22.0, 50.0, 62.0, 50.0, 82.0]
      labels = ['Calf Base', 'Lateral Malleolus', 'Heel Base']
    } else {
      defaults = [50.0, 25.0, 50.0, 52.0, 50.0, 75.0]
      labels = ['Upper Arm', 'Olecranon', 'Prox. Forearm']
    }
    
    return [
      {
        name: labels[0],
        defX: defaults[0], defY: defaults[1],
        predX: Math.max(5, Math.min(95, defaults[0] + offsets[0])),
        predY: Math.max(5, Math.min(95, defaults[1] + offsets[1]))
      },
      {
        name: labels[1],
        defX: defaults[2], defY: defaults[3],
        predX: Math.max(5, Math.min(95, defaults[2] + offsets[2])),
        predY: Math.max(5, Math.min(95, defaults[3] + offsets[3]))
      },
      {
        name: labels[2],
        defX: defaults[4], defY: defaults[5],
        predX: Math.max(5, Math.min(95, defaults[4] + offsets[4])),
        predY: Math.max(5, Math.min(95, defaults[5] + offsets[5]))
      }
    ]
  }

  const predictions = runInference()

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', flex: 1, height: '100%',
      padding: '24px', overflowY: 'auto', background: 'var(--bg)', color: 'var(--ink)'
    }}>
      
      {/* Title */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--accent)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Anatomical Modeling Engine
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', margin: '4px 0 6px 0', color: 'var(--ink)' }}>
          🧠 AI Reinforcement Learning Center
        </h1>
        <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5, margin: 0, maxWidth: 800 }}>
          Manage the closed-loop, human-in-the-loop landmark reinforcement agent. When clinical team members adjust forearm, wrist, or ankle landmarks, the deviations act as training signals. The model refines itself online to minimize error rates.
        </p>
      </div>

      {loading && !modelData ? (
        <div style={{ padding: '40px', textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--bdr)', borderRadius: 8 }}>
          <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>Fetching latest weights from clinical node...</div>
        </div>
      ) : error ? (
        <div style={{
          padding: '24px', background: 'var(--red-bg)', border: '1px solid var(--red-bdr)',
          borderRadius: 8, color: 'var(--red)', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 10
        }}>
          <div>⚠️ {error}</div>
          <div style={{ fontSize: 11, color: 'var(--ink-2)' }}>
            To resolve this: run <code>python rl_agent.py --train-all</code> inside the workspace folder in your terminal to initialize weights and upload them to Supabase scans storage.
          </div>
          <button 
            onClick={() => setRefreshKey(k => k + 1)}
            style={{
              padding: '6px 12px', background: 'var(--red)', color: 'white',
              border: 'none', borderRadius: 4, cursor: 'pointer', alignSelf: 'flex-start',
              fontSize: 11, fontWeight: 600
            }}
          >
            Retry Fetching Model
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '20px', alignItems: 'start' }}>
          
          {/* Main Panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            
            {/* Stats row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--bdr)', padding: 16, borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600, textTransform: 'uppercase' }}>Trained Patient Cases</div>
                <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4, color: 'var(--ink)' }}>{modelData?.stats?.total_trained || 0}</div>
                <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 4 }}>● Online & Monitoring</div>
              </div>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--bdr)', padding: 16, borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600, textTransform: 'uppercase' }}>Policy Reward Rating</div>
                <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4, color: 'var(--ink)' }}>{modelData?.stats?.current_avg_reward || 0}%</div>
                <div style={{ fontSize: 11, color: 'var(--ink-2)', marginTop: 4 }}>Max possible: 100%</div>
              </div>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--bdr)', padding: 16, borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600, textTransform: 'uppercase' }}>Avg Displacement Error</div>
                <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4, color: 'var(--ink)' }}>{modelData?.stats?.current_avg_error || 0}%</div>
                <div style={{ fontSize: 11, color: 'var(--ink-2)', marginTop: 4 }}>Standard scale deviation</div>
              </div>
            </div>

            {/* Neural Net visualizer card */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--bdr)', borderRadius: 8, padding: 18 }}>
              <h2 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 14px 0' }}>Neural Architecture Topology (Continuous Policy Network)</h2>
              
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                height: 180, border: '1px solid var(--bdr)', borderRadius: 6,
                background: 'rgba(0,0,0,0.02)', padding: '0 40px', position: 'relative'
              }}>
                {/* Layer 1: Inputs */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 9, color: 'var(--ink-3)', textAlign: 'center', marginBottom: 2 }}>INPUT (23)</span>
                  {[0,1,2,3,4].map(idx => (
                    <div key={idx} style={{
                      width: 10, height: 10, borderRadius: '50%', background: 'var(--accent)',
                      boxShadow: '0 0 6px var(--accent)'
                    }} />
                  ))}
                </div>

                {/* Weights links simulation */}
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: 100, right: 100, pointerEvents: 'none', opacity: 0.15 }}>
                  <svg width="100%" height="100%">
                    <line x1="5%" y1="20%" x2="50%" y2="30%" stroke="var(--ink)" strokeWidth="1" />
                    <line x1="5%" y1="50%" x2="50%" y2="30%" stroke="var(--ink)" strokeWidth="1" />
                    <line x1="5%" y1="80%" x2="50%" y2="70%" stroke="var(--ink)" strokeWidth="1" />
                    <line x1="50%" y1="30%" x2="95%" y2="40%" stroke="var(--ink)" strokeWidth="1" />
                    <line x1="50%" y1="70%" x2="95%" y2="60%" stroke="var(--ink)" strokeWidth="1" />
                  </svg>
                </div>

                {/* Layer 2: Hidden 1 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <span style={{ fontSize: 9, color: 'var(--ink-3)', textAlign: 'center', marginBottom: 2 }}>FC1 (32)</span>
                  {[0,1,2,3].map(idx => (
                    <div key={idx} style={{
                      width: 8, height: 8, borderRadius: '50%', background: 'var(--green)',
                      boxShadow: '0 0 4px var(--green)'
                    }} />
                  ))}
                </div>

                {/* Layer 3: Hidden 2 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <span style={{ fontSize: 9, color: 'var(--ink-3)', textAlign: 'center', marginBottom: 2 }}>FC2 (16)</span>
                  {[0,1,2].map(idx => (
                    <div key={idx} style={{
                      width: 8, height: 8, borderRadius: '50%', background: 'var(--amber)',
                      boxShadow: '0 0 4px var(--amber)'
                    }} />
                  ))}
                </div>

                {/* Layer 4: Outputs */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <span style={{ fontSize: 9, color: 'var(--ink-3)', textAlign: 'center', marginBottom: 2 }}>OUTPUT (6)</span>
                  {[0,1].map(idx => (
                    <div key={idx} style={{
                      width: 10, height: 10, borderRadius: '50%', background: 'var(--red)',
                      boxShadow: '0 0 6px var(--red)'
                    }} />
                  ))}
                </div>
              </div>

              <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--ink-2)', fontFamily: 'var(--mono)' }}>
                <span>Learning Rate: α = 0.02 / 0.005 (dynamic)</span>
                <span>Optimiser: Online SGD + Gradient Clip (10.0)</span>
                <span>Loss: Mean Square Error</span>
              </div>
            </div>

            {/* Model Logs */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--bdr)', borderRadius: 8, padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Model Training History Stream</h2>
                <button 
                  onClick={() => setRefreshKey(k => k + 1)}
                  style={{
                    fontSize: 10, background: 'transparent', border: '1px solid var(--bdr)',
                    padding: '4px 8px', borderRadius: 4, color: 'var(--ink-2)', cursor: 'pointer'
                  }}
                >
                  ↻ Refresh History
                </button>
              </div>

              <div style={{
                height: 160, overflowY: 'auto', background: 'rgba(0,0,0,0.03)',
                border: '1px solid var(--bdr)', borderRadius: 6, padding: '8px 12px',
                fontFamily: 'var(--mono)', fontSize: 11, display: 'flex', flexDirection: 'column', gap: 6
              }}>
                {modelData?.training_history && modelData.training_history.length > 0 ? (
                  modelData.training_history.slice().reverse().map((log, idx) => (
                    <div key={idx} style={{ borderBottom: '1px solid rgba(0,0,0,0.03)', paddingBottom: 4, color: 'var(--ink-2)' }}>
                      <span style={{ color: 'var(--ink-3)' }}>[{log.timestamp}]</span> Case:{' '}
                      <strong style={{ color: 'var(--ink)' }}>{log.case_id}</strong> | Reward:{' '}
                      <span style={{ color: log.reward >= 70 ? 'var(--green)' : 'var(--amber)' }}>{log.reward}%</span> | Avg Error:{' '}
                      <span style={{ color: log.avg_error_pct < 5 ? 'var(--green)' : 'var(--red)' }}>{log.avg_error_pct}%</span>
                    </div>
                  ))
                ) : (
                  <div style={{ color: 'var(--ink-3)', textAlign: 'center', padding: '40px 0' }}>No logs streamed yet. Run model training first.</div>
                )}
              </div>
            </div>

          </div>

          {/* Sandbox Panel */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--bdr)', borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Model Policy Sandbox</h2>
            <p style={{ fontSize: 11, color: 'var(--ink-2)', margin: 0, lineHeight: 1.4 }}>
              Shift profile sliders below to see the AI neural network run feedforward prediction and adjust the blue pins relative to the standard static defaults (red pins).
            </p>

            <div style={{ border: '1px solid var(--bdr)', borderRadius: 6, padding: 10, background: 'rgba(0,0,0,0.02)' }}>
              {/* Profile Config */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11 }}>
                
                <div>
                  <label style={{ fontWeight: 600, display: 'block', marginBottom: 2 }}>Body Part</label>
                  <select 
                    value={bodyPart} 
                    onChange={e => setBodyPart(e.target.value as any)}
                    style={{ width: '100%', padding: 4, background: 'var(--surface)', border: '1px solid var(--bdr)', borderRadius: 4 }}
                  >
                    <option value="Forearm">Forearm</option>
                    <option value="Wrist">Wrist</option>
                    <option value="Ankle">Ankle</option>
                    <option value="Elbow">Elbow</option>
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={{ fontWeight: 600, display: 'block', marginBottom: 2 }}>Gender</label>
                    <select 
                      value={gender} 
                      onChange={e => setGender(e.target.value as any)}
                      style={{ width: '100%', padding: 4, background: 'var(--surface)', border: '1px solid var(--bdr)', borderRadius: 4 }}
                    >
                      <option value="M">Male</option>
                      <option value="F">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontWeight: 600, display: 'block', marginBottom: 2 }}>Mobility</label>
                    <select 
                      value={mobility} 
                      onChange={e => setMobility(e.target.value as any)}
                      style={{ width: '100%', padding: 4, background: 'var(--surface)', border: '1px solid var(--bdr)', borderRadius: 4 }}
                    >
                      <option value="Normal">Normal</option>
                      <option value="Limited">Limited</option>
                      <option value="None">None</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={{ fontWeight: 600, display: 'block', marginBottom: 2 }}>Side</label>
                    <select 
                      value={side} 
                      onChange={e => setSide(e.target.value as any)}
                      style={{ width: '100%', padding: 4, background: 'var(--surface)', border: '1px solid var(--bdr)', borderRadius: 4 }}
                    >
                      <option value="Left">Left</option>
                      <option value="Right">Right</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontWeight: 600, display: 'block', marginBottom: 2 }}>Angle</label>
                    <select 
                      value={angle} 
                      onChange={e => setAngle(e.target.value as any)}
                      style={{ width: '100%', padding: 4, background: 'var(--surface)', border: '1px solid var(--bdr)', borderRadius: 4 }}
                    >
                      <option value="Front">Front</option>
                      <option value="Back">Back</option>
                      <option value="Left">Left</option>
                      <option value="Right">Right</option>
                      <option value="45° Left">45° Left</option>
                      <option value="45° Right">45° Right</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ fontWeight: 600, display: 'block', marginBottom: 2 }}>Swelling Severity</label>
                  <select 
                    value={swelling} 
                    onChange={e => setSwelling(e.target.value as any)}
                    style={{ width: '100%', padding: 4, background: 'var(--surface)', border: '1px solid var(--bdr)', borderRadius: 4 }}
                  >
                    <option value="Normal">Normal (No swelling)</option>
                    <option value="Mild">Mild swelling</option>
                    <option value="Moderate">Moderate swelling</option>
                    <option value="Severe">Severe swelling</option>
                  </select>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                    <span>Patient Age</span>
                    <span>{age} years</span>
                  </div>
                  <input 
                    type="range" min="5" max="95" value={age} 
                    onChange={e => setAge(parseInt(e.target.value))}
                    style={{ width: '100%', margin: '4px 0 0 0' }}
                  />
                </div>
              </div>
            </div>

            {/* Simulated Scan Canvas */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 4 }}>Simulated Landmark Placement Map</div>
              <div style={{
                position: 'relative', width: 180, height: 180,
                border: '1px solid var(--bdr)', borderRadius: 6,
                background: '#F9F9F7', overflow: 'hidden'
              }}>
                {/* Bone schematic */}
                <div style={{
                  position: 'absolute', top: 20, bottom: 20, left: '50%',
                  transform: 'translateX(-50%)', width: 24, background: '#EAEAEA',
                  borderRadius: 12, border: '1px solid #D1D1D1', opacity: 0.8,
                  display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '8px 0'
                }}>
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#D6D6D6', alignSelf: 'center' }} />
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#D6D6D6', alignSelf: 'center' }} />
                </div>

                {/* Default static dots (RED) */}
                {predictions.map((p, idx) => (
                  <div key={`def-${idx}`} style={{
                    position: 'absolute', left: `${p.defX}%`, top: `${p.defY}%`,
                    transform: 'translate(-50%, -50%)', width: 8, height: 8,
                    borderRadius: '50%', background: 'var(--red)', border: '1.5px solid white',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.15)', zIndex: 1
                  }} title={`Default ${p.name}`} />
                ))}

                {/* Model Predictions (BLUE) */}
                {predictions.map((p, idx) => (
                  <div key={`pred-${idx}`} style={{
                    position: 'absolute', left: `${p.predX}%`, top: `${p.predY}%`,
                    transform: 'translate(-50%, -50%)', width: 10, height: 10,
                    borderRadius: '50%', background: 'var(--accent)', border: '1.5px solid white',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.25)', zIndex: 2
                  }} title={`AI predicted ${p.name}`} />
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 8, fontSize: 9 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--red)' }} /> Default Landmarks
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} /> AI Predictions
                </span>
              </div>
            </div>

            {/* Readout coordinates */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontFamily: 'var(--mono)', fontSize: 10, border: '1px solid var(--bdr)', borderRadius: 4, padding: 8, background: 'rgba(0,0,0,0.01)' }}>
              <div style={{ fontWeight: 600, color: 'var(--ink-2)', borderBottom: '1px solid var(--bdr)', paddingBottom: 2, marginBottom: 2 }}>Prediction Matrix:</div>
              {predictions.map((p, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--ink-2)' }}>
                  <span>{p.name}:</span>
                  <span>({p.predX.toFixed(1)}%, {p.predY.toFixed(1)}%)</span>
                </div>
              ))}
            </div>

            {/* Script commands reference */}
            <div style={{ border: '1px dashed var(--bdr)', borderRadius: 4, padding: 8, background: 'rgba(0,0,0,0.02)' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', marginBottom: 2 }}>Training Service commands</div>
              <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--ink-2)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div>Epoch Train: <code>python rl_agent.py --train-all</code></div>
                <div>Daemon: <code>python rl_agent.py --daemon</code></div>
              </div>
            </div>

          </div>

        </div>
      )}
    </div>
  )
}
