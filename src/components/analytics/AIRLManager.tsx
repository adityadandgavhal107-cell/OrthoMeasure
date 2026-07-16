import { useState, useEffect, useCallback } from 'react'
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

interface TrainingNote {
  session_id: string;
  source: string;
  images_processed: number;
  epochs_run: number;
  avg_reward_before: number | string;
  avg_error_before: number | string;
  avg_reward_after: number;
  avg_error_after: number;
  reward_delta: number;
  error_delta: number;
  notes: string;
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

// Live approved case record from Supabase
interface ApprovedCase {
  id: string
  patient_name: string
  body_part: string
  status: string
  submitted_at: string
  measurements: unknown[]
  images: unknown[]
}

export default function AIRLManager() {
  const [modelData, setModelData] = useState<ModelData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  // Live DB state
  const [approvedCases, setApprovedCases] = useState<ApprovedCase[]>([])
  const [dbLoading, setDbLoading] = useState(true)
  const [showUntrainedOnly, setShowUntrainedOnly] = useState(false)

  // Dataset training notes
  const [trainingNotes, setTrainingNotes] = useState<TrainingNote[]>([])
  const [notesLoading, setNotesLoading] = useState(true)

  // ZIP upload state
  const [zipDragOver, setZipDragOver] = useState(false)
  const [zipStatus, setZipStatus] = useState<'idle' | 'processing' | 'done' | 'error'>('idle')
  const [zipMessage, setZipMessage] = useState('')

  // Sandbox states
  const [age, setAge] = useState(25)
  const [gender, setGender] = useState<'M' | 'F' | 'Other'>('M')
  const [side, setSide] = useState<'Left' | 'Right'>('Right')
  const [bodyPart, setBodyPart] = useState<string>('Forearm')
  const [mobility, setMobility] = useState<'Normal' | 'Limited' | 'None'>('Limited')
  const [swelling, setSwelling] = useState<'Normal' | 'Mild' | 'Moderate' | 'Severe'>('Moderate')
  const [angle, setAngle] = useState<'Front' | 'Back' | 'Left' | 'Right' | '45° Left' | '45° Right'>('Front')

  // Load model weights from Supabase Storage
  const loadWeights = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const publicUrl = supabase.storage.from('scans').getPublicUrl('rl_model_data.json').data.publicUrl
      const res = await fetch(`${publicUrl}?t=${Date.now()}`)
      if (!res.ok) throw new Error('Model file not found in storage. Run "python rl_agent.py --train-all" to initialize it.')
      const data = await res.json() as ModelData
      setModelData(data)
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Failed to download model weights.')
    } finally {
      setLoading(false)
    }
  }, [])

  // Load live approved cases from Supabase DB
  const loadApprovedCases = useCallback(async () => {
    setDbLoading(true)
    try {
      const { data, error } = await supabase
        .from('ortho_cases')
        .select('id, patient_name, body_part, status, submitted_at, measurements, images')
        .eq('status', 'approved')
        .order('submitted_at', { ascending: false })
      if (!error && data) setApprovedCases(data as ApprovedCase[])
    } catch (e) {
      console.error('Failed to load approved cases:', e)
    } finally {
      setDbLoading(false)
    }
  }, [])

  // Load training notes from Supabase storage
  const loadTrainingNotes = useCallback(async () => {
    setNotesLoading(true)
    try {
      const publicUrl = supabase.storage.from('scans').getPublicUrl('rl_training_notes.json').data.publicUrl
      const res = await fetch(`${publicUrl}?t=${Date.now()}`)
      if (res.ok) {
        const data = await res.json() as TrainingNote[]
        setTrainingNotes(Array.isArray(data) ? data.slice().reverse() : [])
      } else {
        setTrainingNotes([])
      }
    } catch {
      setTrainingNotes([])
    } finally {
      setNotesLoading(false)
    }
  }, [])

  useEffect(() => { loadWeights() }, [refreshKey, loadWeights])
  useEffect(() => { loadApprovedCases() }, [refreshKey, loadApprovedCases])
  useEffect(() => { loadTrainingNotes() }, [refreshKey, loadTrainingNotes])

  // Handle ZIP file selection (drag-and-drop or picker)
  const handleZipFile = (file: File) => {
    if (!file.name.endsWith('.zip')) {
      setZipStatus('error')
      setZipMessage('Please select a valid .zip file.')
      return
    }
    setZipStatus('processing')
    setZipMessage(`📦 Received "${file.name}" (${(file.size / 1024 / 1024).toFixed(1)} MB). To train the model, run:\n\npython train_from_dataset.py --dataset forearm.coco-segmentation\n\nfrom the project root directory. The training notes will appear below once complete.`)
    setZipStatus('done')
  }

  // ── Body-part landmark defaults (matches body_part_config.dart) ─────────────
  const BODY_PART_DEFAULTS: Record<string, { labels: string[]; defaults: number[] }> = {
    Forearm:  { labels: ['Elbow Crease', 'Mid Forearm', 'Wrist Joint'],         defaults: [50,18, 50,50, 50,82] },
    Wrist:    { labels: ['Distal Forearm', 'Wrist Crease', 'MCP Joint'],        defaults: [50,25, 50,50, 50,75] },
    Elbow:    { labels: ['Upper Arm', 'Olecranon', 'Prox. Forearm'],            defaults: [50,25, 50,52, 50,75] },
    Hand:     { labels: ['Wrist', 'Mid Palm', 'Finger Tips'],                   defaults: [50,20, 50,50, 50,80] },
    Ankle:    { labels: ['Knee', 'Mid Leg', 'Ankle'],                           defaults: [50,22, 50,62, 50,82] },
    Foot:     { labels: ['Ankle', 'Mid Foot', 'Toes'],                          defaults: [50,18, 50,50, 50,82] },
    Knee:     { labels: ['Mid Thigh', 'Patella', 'Tibial Crest'],               defaults: [50,18, 50,50, 50,82] },
    Shoulder: { labels: ['Acromion', 'GH Joint', 'Upper Arm'],                  defaults: [50,20, 50,50, 50,80] },
  }

  // ── Feedforward inference (supports 23-dim old weights + 26-dim new) ─────────
  function runInference(): { name: string; defX: number; defY: number; predX: number; predY: number }[] {
    if (!modelData?.weights) return []
    const w = modelData.weights
    const inputDim = w.W1.length // auto-detect: 23 (old) or 27 (new)

    // Build state vector
    const state = new Array(inputDim).fill(0)
    state[0] = age / 100.0
    if (gender === 'M') state[1] = 1.0
    else if (gender === 'F') state[2] = 1.0
    else state[3] = 1.0
    if (side === 'Left') state[4] = 1.0
    else state[5] = 1.0

    // Body part encoding — 8 parts if inputDim >= 27, else 4
    const ALL_PARTS = ['Forearm','Wrist','Ankle','Elbow','Hand','Foot','Knee','Shoulder']
    const LEGACY_PARTS = ['Forearm','Wrist','Ankle','Elbow']
    const parts = inputDim >= 27 ? ALL_PARTS : LEGACY_PARTS
    const bpIdx = parts.indexOf(bodyPart)
    if (bpIdx !== -1 && 6 + bpIdx < inputDim) state[6 + bpIdx] = 1.0
    else if (bpIdx === -1 && inputDim < 27) state[9] = 1.0 // Elbow bucket for unknown

    // Offset base for mobility depends on how many body-part slots there are
    const mobilityBase = inputDim >= 27 ? 14 : 10
    if (mobility === 'Normal') state[mobilityBase] = 1.0
    else if (mobility === 'Limited') state[mobilityBase + 1] = 1.0
    else state[mobilityBase + 2] = 1.0

    const swellingBase = mobilityBase + 3
    if (swelling === 'Normal') state[swellingBase] = 1.0
    else if (swelling === 'Mild') state[swellingBase + 1] = 1.0
    else if (swelling === 'Moderate') state[swellingBase + 2] = 1.0
    else state[swellingBase + 3] = 1.0

    const angleBase = swellingBase + 4
    const angles = ['Front','Back','Left','Right','45° Left','45° Right']
    const aIdx = angles.indexOf(angle)
    if (aIdx !== -1 && angleBase + aIdx < inputDim) state[angleBase + aIdx] = 1.0

    // Forward pass
    const relu = (x: number) => Math.max(0, x)
    const h1 = w.W1[0].map((_: number, j: number) => {
      let s = w.b1[0][j]
      for (let i = 0; i < inputDim && i < w.W1.length; i++) s += state[i] * w.W1[i][j]
      return relu(s)
    })
    const h2 = w.W2[0].map((_: number, j: number) => {
      let s = w.b2[0][j]
      for (let i = 0; i < h1.length; i++) s += h1[i] * w.W2[i][j]
      return relu(s)
    })
    const offsets = w.W3[0].map((_: number, j: number) => {
      let s = w.b3[0][j]
      for (let i = 0; i < h2.length; i++) s += h2[i] * w.W3[i][j]
      return s
    })

    const cfg = BODY_PART_DEFAULTS[bodyPart] ?? BODY_PART_DEFAULTS['Forearm']
    const { labels, defaults: def } = cfg

    return [
      { name: labels[0], defX: def[0], defY: def[1],
        predX: Math.max(5, Math.min(95, def[0] + (offsets[0] ?? 0))),
        predY: Math.max(5, Math.min(95, def[1] + (offsets[1] ?? 0))) },
      { name: labels[1], defX: def[2], defY: def[3],
        predX: Math.max(5, Math.min(95, def[2] + (offsets[2] ?? 0))),
        predY: Math.max(5, Math.min(95, def[3] + (offsets[3] ?? 0))) },
      { name: labels[2], defX: def[4], defY: def[5],
        predX: Math.max(5, Math.min(95, def[4] + (offsets[4] ?? 0))),
        predY: Math.max(5, Math.min(95, def[5] + (offsets[5] ?? 0))) },
    ]
  }

  const predictions = runInference()

  // Derived: which approved cases have NOT been trained on yet
  const trainedIds = new Set(modelData?.trained_cases ?? [])
  const untrainedCases = approvedCases.filter(c => !trainedIds.has(c.id))
  const casesToShow = showUntrainedOnly ? untrainedCases : approvedCases

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
          Closed-loop, human-in-the-loop landmark reinforcement agent. Doctor landmark adjustments and manual measurements act as training signals. The policy network refines itself to minimize anatomical displacement error across all approved patient cases.
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
            To resolve this: run <code>python rl_agent.py --train-all</code> inside the workspace folder to initialize weights and upload them to Supabase scans storage.
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
            
            {/* Stats row — 4 cards now */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {/* Card 1: Live DB count */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--bdr)', padding: 14, borderRadius: 8 }}>
                <div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 600, textTransform: 'uppercase' }}>Approved in DB</div>
                <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4, color: 'var(--ink)' }}>
                  {dbLoading ? '…' : approvedCases.length}
                </div>
                <div style={{ fontSize: 10, color: 'var(--green)', marginTop: 4 }}>● Live from Supabase</div>
              </div>
              {/* Card 2: Model-trained */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--bdr)', padding: 14, borderRadius: 8 }}>
                <div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 600, textTransform: 'uppercase' }}>Model Trained</div>
                <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4, color: 'var(--ink)' }}>
                  {modelData?.stats?.total_trained ?? 0}
                </div>
                <div style={{ fontSize: 10, color: untrainedCases.length > 0 ? 'var(--amber)' : 'var(--green)', marginTop: 4 }}>
                  {untrainedCases.length > 0 ? `⚠ ${untrainedCases.length} untrained` : '✓ All trained'}
                </div>
              </div>
              {/* Card 3: Reward */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--bdr)', padding: 14, borderRadius: 8 }}>
                <div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 600, textTransform: 'uppercase' }}>Policy Reward</div>
                <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4, color: 'var(--ink)' }}>{modelData?.stats?.current_avg_reward ?? 0}%</div>
                <div style={{ fontSize: 10, color: 'var(--ink-2)', marginTop: 4 }}>Max possible: 100%</div>
              </div>
              {/* Card 4: Error */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--bdr)', padding: 14, borderRadius: 8 }}>
                <div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 600, textTransform: 'uppercase' }}>Avg Error</div>
                <div style={{
                  fontSize: 26, fontWeight: 700, marginTop: 4,
                  color: (modelData?.stats?.current_avg_error ?? 99) < 5 ? 'var(--green)' : 'var(--amber)'
                }}>{modelData?.stats?.current_avg_error ?? 0}%</div>
                <div style={{ fontSize: 10, color: 'var(--ink-2)', marginTop: 4 }}>Scale deviation</div>
              </div>
            </div>

            {/* Live Approved Patient Cases Table */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--bdr)', borderRadius: 8, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <h2 style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>Approved Patient Cases — Live Feed</h2>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <label style={{ fontSize: 10, color: 'var(--ink-2)', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={showUntrainedOnly}
                      onChange={e => setShowUntrainedOnly(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                    Untrained only
                  </label>
                  <button
                    onClick={() => setRefreshKey(k => k + 1)}
                    style={{
                      fontSize: 10, background: 'transparent', border: '1px solid var(--bdr)',
                      padding: '3px 7px', borderRadius: 4, color: 'var(--ink-2)', cursor: 'pointer'
                    }}
                  >
                    ↻ Refresh
                  </button>
                </div>
              </div>

              {dbLoading ? (
                <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12, color: 'var(--ink-3)' }}>Loading patient records…</div>
              ) : casesToShow.length === 0 ? (
                <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12, color: 'var(--ink-3)', fontStyle: 'italic' }}>
                  {showUntrainedOnly ? 'All approved cases have been trained ✓' : 'No approved cases yet.'}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0, maxHeight: 220, overflowY: 'auto' }}>
                  {/* Header */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: '1fr 100px 90px 80px',
                    fontSize: 9, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase',
                    padding: '4px 8px', borderBottom: '1px solid var(--bdr)', letterSpacing: '0.05em'
                  }}>
                    <span>Patient</span><span>Body Part</span><span>Model Status</span><span>Images</span>
                  </div>
                  {casesToShow.map(c => {
                    const trained = trainedIds.has(c.id)
                    const imgCount = Array.isArray(c.images) ? c.images.length : 0
                    return (
                      <div key={c.id} style={{
                        display: 'grid', gridTemplateColumns: '1fr 100px 90px 80px',
                        fontSize: 11, padding: '7px 8px',
                        borderBottom: '1px solid var(--bdr)',
                        background: trained ? 'transparent' : 'rgba(245,158,11,0.04)',
                        alignItems: 'center'
                      }}>
                        <div>
                          <div style={{ fontWeight: 500, color: 'var(--ink)' }}>{c.patient_name}</div>
                          <div style={{ fontSize: 9, color: 'var(--ink-3)', fontFamily: 'var(--mono)', marginTop: 1 }}>{c.id.slice(0, 12)}…</div>
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--ink-2)' }}>{c.body_part}</div>
                        <div style={{
                          fontSize: 9, fontWeight: 600,
                          color: trained ? 'var(--green)' : 'var(--amber)'
                        }}>
                          {trained ? '✓ Trained' : '⚠ Needs train'}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--ink-3)' }}>{imgCount} angle{imgCount !== 1 ? 's' : ''}</div>
                      </div>
                    )
                  })}
                </div>
              )}

              {untrainedCases.length > 0 && (
                <div style={{
                  marginTop: 10, padding: '8px 10px', background: 'rgba(245,158,11,0.08)',
                  border: '1px solid rgba(245,158,11,0.25)', borderRadius: 6, fontSize: 11, color: 'var(--amber)'
                }}>
                  ⚠ <strong>{untrainedCases.length}</strong> approved case{untrainedCases.length > 1 ? 's' : ''} not yet in model weights.
                  Run <code style={{ fontSize: 10, background: 'rgba(0,0,0,0.1)', padding: '1px 4px', borderRadius: 3 }}>python rl_agent.py --train-all</code> to retrain.
                </div>
              )}
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

            {/* ── Dataset Training Notes ── */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--bdr)', borderRadius: 8, padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>📋 Dataset Training Session Notes</h2>
                <button
                  onClick={() => setRefreshKey(k => k + 1)}
                  style={{ fontSize: 10, background: 'transparent', border: '1px solid var(--bdr)', padding: '4px 8px', borderRadius: 4, color: 'var(--ink-2)', cursor: 'pointer' }}
                >
                  ↻ Refresh Notes
                </button>
              </div>
              <p style={{ fontSize: 11, color: 'var(--ink-2)', margin: '0 0 12px 0', lineHeight: 1.5 }}>
                Each time you run <code style={{ fontSize: 10, background: 'rgba(0,0,0,0.07)', padding: '1px 5px', borderRadius: 3 }}>python train_from_dataset.py</code> a session summary is recorded here showing model improvement.
              </p>

              {notesLoading ? (
                <div style={{ padding: '16px 0', textAlign: 'center', fontSize: 12, color: 'var(--ink-3)' }}>Loading session notes…</div>
              ) : trainingNotes.length === 0 ? (
                <div style={{
                  padding: '20px', background: 'rgba(0,0,0,0.02)', border: '1px dashed var(--bdr)',
                  borderRadius: 6, textAlign: 'center', fontSize: 12, color: 'var(--ink-3)'
                }}>
                  No training sessions recorded yet.<br />
                  <span style={{ fontSize: 11 }}>Run <code>python train_from_dataset.py</code> to generate the first note.</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {trainingNotes.map((note, idx) => (
                    <div key={idx} style={{
                      border: '1px solid var(--bdr)', borderRadius: 6, padding: 12,
                      background: idx === 0 ? 'rgba(16,185,129,0.04)' : 'rgba(0,0,0,0.01)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink)' }}>📁 {note.source}</span>
                          {idx === 0 && <span style={{ marginLeft: 8, fontSize: 9, background: 'var(--green)', color: 'white', padding: '1px 6px', borderRadius: 10, fontWeight: 600 }}>LATEST</span>}
                        </div>
                        <span style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--ink-3)' }}>{note.session_id}</span>
                      </div>

                      {/* Metric cards */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 8 }}>
                        <div style={{ textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--bdr)', borderRadius: 4, padding: '6px 4px' }}>
                          <div style={{ fontSize: 9, color: 'var(--ink-3)', fontWeight: 600 }}>IMAGES</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>{note.images_processed}</div>
                        </div>
                        <div style={{ textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--bdr)', borderRadius: 4, padding: '6px 4px' }}>
                          <div style={{ fontSize: 9, color: 'var(--ink-3)', fontWeight: 600 }}>EPOCHS</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>{note.epochs_run ?? '—'}</div>
                        </div>
                        <div style={{ textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--bdr)', borderRadius: 4, padding: '6px 4px' }}>
                          <div style={{ fontSize: 9, color: 'var(--ink-3)', fontWeight: 600 }}>REWARD Δ</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: note.reward_delta >= 0 ? 'var(--green)' : 'var(--red)' }}>
                            {note.reward_delta >= 0 ? '+' : ''}{note.reward_delta}%
                          </div>
                        </div>
                        <div style={{ textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--bdr)', borderRadius: 4, padding: '6px 4px' }}>
                          <div style={{ fontSize: 9, color: 'var(--ink-3)', fontWeight: 600 }}>ERROR Δ</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: note.error_delta <= 0 ? 'var(--green)' : 'var(--red)' }}>
                            {note.error_delta >= 0 ? '+' : ''}{note.error_delta}%
                          </div>
                        </div>
                      </div>

                      {/* Progress bars */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                        <div>
                          <div style={{ fontSize: 9, color: 'var(--ink-3)', marginBottom: 2 }}>Reward: {note.avg_reward_before}% → {note.avg_reward_after}%</div>
                          <div style={{ height: 6, borderRadius: 3, background: 'var(--bdr)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${note.avg_reward_after}%`, background: 'var(--green)', borderRadius: 3, transition: 'width 0.5s' }} />
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 9, color: 'var(--ink-3)', marginBottom: 2 }}>Error: {note.avg_error_before}% → {note.avg_error_after}%</div>
                          <div style={{ height: 6, borderRadius: 3, background: 'var(--bdr)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.min(100, note.avg_error_after * 5)}%`, background: note.avg_error_after < 5 ? 'var(--green)' : 'var(--amber)', borderRadius: 3, transition: 'width 0.5s' }} />
                          </div>
                        </div>
                      </div>

                      <p style={{ margin: 0, fontSize: 10, color: 'var(--ink-2)', lineHeight: 1.5, fontStyle: 'italic' }}>{note.notes}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── ZIP Dataset Upload Panel ── */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--bdr)', borderRadius: 8, padding: 18 }}>
              <h2 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 6px 0' }}>📂 Upload Forearm Dataset (ZIP)</h2>
              <p style={{ fontSize: 11, color: 'var(--ink-2)', margin: '0 0 14px 0', lineHeight: 1.5 }}>
                Upload a COCO-format forearm ZIP dataset. The system will guide you to run the Python trainer which processes the annotations and updates the model.
              </p>

              <label
                htmlFor="zip-upload-input"
                onDragOver={e => { e.preventDefault(); setZipDragOver(true) }}
                onDragLeave={() => setZipDragOver(false)}
                onDrop={e => {
                  e.preventDefault(); setZipDragOver(false)
                  const file = e.dataTransfer.files[0]
                  if (file) handleZipFile(file)
                }}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  padding: '28px 20px', borderRadius: 8, cursor: 'pointer',
                  border: `2px dashed ${zipDragOver ? 'var(--accent)' : 'var(--bdr)'}`,
                  background: zipDragOver ? 'rgba(99,102,241,0.06)' : 'rgba(0,0,0,0.01)',
                  transition: 'all 0.2s', textAlign: 'center'
                }}
              >
                <div style={{ fontSize: 28, marginBottom: 8 }}>🗜️</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>Drag & drop your forearm dataset ZIP</div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>or <span style={{ color: 'var(--accent)', textDecoration: 'underline' }}>click to browse</span></div>
                <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 6 }}>Supports: <code>.zip</code> with COCO <code>_annotations.coco.json</code></div>
                <input
                  id="zip-upload-input"
                  type="file"
                  accept=".zip"
                  style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleZipFile(f) }}
                />
              </label>

              {zipStatus !== 'idle' && (
                <div style={{
                  marginTop: 12, padding: '10px 12px', borderRadius: 6, fontSize: 11,
                  background: zipStatus === 'error' ? 'var(--red-bg)' : 'rgba(16,185,129,0.07)',
                  border: `1px solid ${zipStatus === 'error' ? 'var(--red-bdr)' : 'rgba(16,185,129,0.3)'}`,
                  color: zipStatus === 'error' ? 'var(--red)' : 'var(--ink-2)',
                  whiteSpace: 'pre-wrap', fontFamily: 'var(--mono)', lineHeight: 1.7
                }}>
                  {zipStatus === 'done' && '✅ '}{zipStatus === 'error' && '❌ '}
                  {zipMessage}
                </div>
              )}

              <div style={{ marginTop: 14, padding: '10px 12px', background: 'rgba(0,0,0,0.02)', borderRadius: 6, border: '1px solid var(--bdr)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>How to train from your ZIP dataset</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11, color: 'var(--ink-2)' }}>
                  <div>1. Extract your ZIP into the project folder <code style={{ fontSize: 10, background: 'rgba(0,0,0,0.07)', padding: '1px 4px', borderRadius: 3 }}>OrthoMeasure-main/</code></div>
                  <div>2. Run: <code style={{ fontSize: 10, background: 'rgba(0,0,0,0.07)', padding: '1px 4px', borderRadius: 3 }}>python train_from_dataset.py --dataset forearm.coco-segmentation</code></div>
                  <div>3. The model updates automatically and uploads to Supabase</div>
                  <div>4. Click <strong>↻ Refresh Notes</strong> above to see your session results</div>
                </div>
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
                    <option value="Elbow">Elbow</option>
                    <option value="Hand">Hand</option>
                    <option value="Ankle">Ankle</option>
                    <option value="Foot">Foot</option>
                    <option value="Knee">Knee</option>
                    <option value="Shoulder">Shoulder</option>
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
