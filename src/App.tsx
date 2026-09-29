import { useEffect, useRef, useState } from 'react'

const API_BASE = 'http://127.0.0.1:8000'
const STORAGE_KEY = 'navantix_studies_v1'
const MAX_STUDIES = 20

type Prediction = {
  label: string
  score: number
  std: number
  severity: 'high' | 'moderate' | 'low'
  confidence: 'high' | 'medium' | 'low'
}

type ModalityInfo = {
  is_cxr: boolean
  cxr_score: number
  non_cxr_score: number
  best_non_cxr: string
  best_non_score: number
  top_match: string
  top_score: number
}

type PredictResponse = {
  filename: string
  rejected: boolean
  rejection_reason?: string
  elapsed_ms?: number
  threshold?: number
  top_finding?: string
  top_score?: number
  top_std?: number
  flagged?: boolean
  findings: Prediction[]
  heatmap_base64: string | null
  heatmaps?: Record<string, string>
  modality?: ModalityInfo
  mc_passes?: number
}

type SavedStudy = {
  id: string
  timestamp: number
  filename: string
  thumbnail: string | null
  threshold: number
  top_finding: string
  top_score: number
  flagged: boolean
  findings: Prediction[]
}

function App() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<PredictResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [selectedFinding, setSelectedFinding] = useState<string | null>(null)
  const [studies, setStudies] = useState<SavedStudy[]>([])
  const [savedFlash, setSavedFlash] = useState(false)
  const [patientId, setPatientId] = useState('')
  const [patientAge, setPatientAge] = useState('')
  const [patientSex, setPatientSex] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setStudies(JSON.parse(raw) as SavedStudy[])
    } catch {}
  }, [])

  const persistStudies = (list: SavedStudy[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
    } catch {}
  }

  const handleFile = (f: File) => {
    setFile(f)
    setResult(null)
    setError(null)
    setShowHeatmap(false)
    setSelectedFinding(null)
    const reader = new FileReader()
    reader.onload = (e) => setPreview(e.target?.result as string)
    reader.readAsDataURL(f)
  }

  const onUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) handleFile(f)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files?.[0]
    if (f) handleFile(f)
  }

  const runAnalysis = async () => {
    if (!file) return
    setLoading(true)
    setError(null)
    setResult(null)
    setShowHeatmap(false)
    setSelectedFinding(null)

    try {
      const form = new FormData()
      form.append('file', file)

      const res = await fetch(`${API_BASE}/predict`, { method: 'POST', body: form })
      if (!res.ok) throw new Error(`Server error (HTTP ${res.status}). Please try again.`)

      const raw = await res.text()
      if (!raw || raw.trim() === '' || raw.trim() === 'null') {
        throw new Error('Empty response from server. Please try again.')
      }

      let data: PredictResponse
      try {
        data = JSON.parse(raw)
      } catch {
        throw new Error('Invalid response from server. Please try again.')
      }

      if (!data || typeof data.rejected !== 'boolean') {
        throw new Error('Unexpected response format. Please try again.')
      }

      setResult(data)
      if (!data.rejected && data.heatmap_base64) {
        setShowHeatmap(true)
        setSelectedFinding(data.top_finding ?? null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const makeThumbnail = async (dataUrl: string): Promise<string | null> => {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const size = 160
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        if (!ctx) return resolve(null)
        const scale = Math.max(size / img.width, size / img.height)
        const w = img.width * scale
        const h = img.height * scale
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.7))
      }
      img.onerror = () => resolve(null)
      img.src = dataUrl
    })
  }

  const saveCurrentStudy = async () => {
    if (!result || result.rejected || !result.top_finding) return
    const thumbnail = preview ? await makeThumbnail(preview) : null
    const study: SavedStudy = {
      id: `s_${Date.now()}`,
      timestamp: Date.now(),
      filename: result.filename,
      thumbnail,
      threshold: result.threshold ?? 0.5,
      top_finding: result.top_finding,
      top_score: result.top_score ?? 0,
      flagged: result.flagged ?? false,
      findings: result.findings,
    }
    const next = [study, ...studies].slice(0, MAX_STUDIES)
    setStudies(next)
    persistStudies(next)
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 1500)
  }

  const loadStudy = (s: SavedStudy) => {
    setResult({
      filename: s.filename,
      rejected: false,
      threshold: s.threshold,
      top_finding: s.top_finding,
      top_score: s.top_score,
      flagged: s.flagged,
      findings: s.findings,
      heatmap_base64: null,
      heatmaps: {},
      mc_passes: 10,
    })
    setPreview(s.thumbnail)
    setFile(null)
    setShowHeatmap(false)
    setSelectedFinding(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const deleteStudy = (id: string) => {
    const next = studies.filter((s) => s.id !== id)
    setStudies(next)
    persistStudies(next)
  }

  const clearAllStudies = () => {
    if (!confirm('Delete all saved studies? This cannot be undone.')) return
    setStudies([])
    persistStudies([])
  }

  const clear = () => {
    setFile(null)
    setPreview(null)
    setResult(null)
    setError(null)
    setShowHeatmap(false)
    setSelectedFinding(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  // ------------------------------------------------
  // Generate printable report in a new window
  // ------------------------------------------------
  const generateReport = () => {
    if (!result || result.rejected) return

    const topHeatmap = result.heatmap_base64 ?? null
    const now = new Date()
    const studyId = `NX-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`

    const findingsRows = result.findings
      .map((f) => {
        const flag = f.severity === 'high' ? 'HIGH' : f.severity === 'moderate' ? 'MOD' : 'LOW'
        return `<tr>
          <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;">${f.label}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:monospace;">${(f.score * 100).toFixed(1)}%</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:monospace;color:#64748b;">±${((f.std ?? 0) * 100).toFixed(1)}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right;">
            <span style="display:inline-block;padding:2px 8px;border-radius:3px;font-size:10px;font-weight:700;letter-spacing:0.05em;${
              f.severity === 'high'
                ? 'background:#fee2e2;color:#991b1b;'
                : f.severity === 'moderate'
                ? 'background:#fef3c7;color:#92400e;'
                : 'background:#e2e8f0;color:#475569;'
            }">${flag}</span>
          </td>
        </tr>`
      })
      .join('')

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Navantix Pulmo Report ${studyId}</title>
  <style>
    @page { size: A4; margin: 15mm; }
    body { font-family: 'Helvetica', 'Arial', sans-serif; color: #1a1f2e; font-size: 11pt; line-height: 1.5; margin: 0; padding: 0; }
    h1 { font-size: 16pt; margin: 0 0 2px 0; letter-spacing: 0.05em; }
    .sub { font-size: 9pt; color: #64748b; letter-spacing: 0.12em; text-transform: uppercase; font-family: monospace; }
    .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #0a1628; padding-bottom: 10px; margin-bottom: 20px; }
    .logo { font-size: 22pt; font-weight: 700; }
    .logo span { color: #2563eb; }
    .section { margin-bottom: 20px; }
    .section-title { font-size: 9pt; font-weight: 700; color: #64748b; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 8px; font-family: monospace; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; font-size: 10pt; }
    .meta-row { display: flex; justify-content: space-between; border-bottom: 1px solid #eef2f7; padding: 4px 0; }
    .meta-row .k { color: #64748b; }
    .meta-row .v { font-family: monospace; font-weight: 500; }
    .banner { padding: 10px 14px; border-radius: 4px; font-weight: 600; font-size: 10pt; }
    .banner-flag { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
    .banner-clear { background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .image-box { border: 1px solid #e2e8f0; border-radius: 4px; padding: 6px; background: white; }
    .image-box img { width: 100%; display: block; border-radius: 3px; }
    table { width: 100%; border-collapse: collapse; font-size: 10pt; }
    th { text-align: left; padding: 6px 10px; font-size: 8.5pt; color: #64748b; letter-spacing: 0.1em; text-transform: uppercase; border-bottom: 2px solid #0a1628; font-family: monospace; }
    .disclaimer { margin-top: 25px; padding: 12px 16px; background: #f8fafc; border-left: 3px solid #64748b; font-size: 9pt; color: #475569; line-height: 1.6; }
    .footer { margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 10px; font-size: 8pt; color: #94a3b8; font-family: monospace; letter-spacing: 0.05em; display: flex; justify-content: space-between; }
    .no-print { display: block; margin-top: 20px; text-align: center; }
    .no-print button { background: #0a1628; color: white; border: none; padding: 12px 24px; font-size: 11pt; border-radius: 4px; cursor: pointer; font-weight: 500; }
    @media print { .no-print { display: none; } body { font-size: 10pt; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo">N<span>+</span></div>
      <h1>NAVANTIX PULMO</h1>
      <div class="sub">AI-Assisted Chest Radiograph Analysis</div>
    </div>
    <div style="text-align:right;">
      <div class="sub">Study ID</div>
      <div style="font-family:monospace;font-weight:600;font-size:11pt;">${studyId}</div>
      <div class="sub" style="margin-top:6px;">Generated</div>
      <div style="font-family:monospace;font-size:10pt;">${now.toLocaleString('en-GB')}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Study Information</div>
    <div class="meta-grid">
      <div class="meta-row"><span class="k">Patient ID</span><span class="v">${patientId || '—'}</span></div>
      <div class="meta-row"><span class="k">Age</span><span class="v">${patientAge || '—'}</span></div>
      <div class="meta-row"><span class="k">Sex</span><span class="v">${patientSex || '—'}</span></div>
      <div class="meta-row"><span class="k">File</span><span class="v">${result.filename.slice(0, 28)}</span></div>
      <div class="meta-row"><span class="k">Model</span><span class="v">DenseNet-121</span></div>
      <div class="meta-row"><span class="k">MC Passes</span><span class="v">${result.mc_passes ?? 10}</span></div>
      <div class="meta-row"><span class="k">Inference</span><span class="v">${(result.elapsed_ms ?? 0).toFixed(0)} ms</span></div>
      <div class="meta-row"><span class="k">Threshold</span><span class="v">${((result.threshold ?? 0.5) * 100).toFixed(0)}%</span></div>
    </div>
  </div>

  <div class="section">
    <div class="banner ${
      result.flagged ? 'banner-flag' : 'banner-clear'
    }">${result.flagged ? '! ' : '✓ '}${result.flagged
      ? 'Pathologies flagged above clinical threshold'
      : 'No pathologies flagged above clinical threshold'}</div>
  </div>

  <div class="section">
    <div class="section-title">Radiograph & AI Attention</div>
    <div class="two-col">
      <div>
        <div class="image-box">
          <img src="${preview}" alt="Radiograph">
        </div>
        <div style="font-size:9pt;color:#64748b;text-align:center;margin-top:6px;font-style:italic;">Original radiograph</div>
      </div>
      <div>
        ${
          topHeatmap
            ? `<div class="image-box">
                <img src="data:image/png;base64,${topHeatmap}" alt="Attention overlay">
              </div>
              <div style="font-size:9pt;color:#64748b;text-align:center;margin-top:6px;font-style:italic;">Grad-CAM++ overlay for top finding: ${result.top_finding}</div>`
            : `<div class="image-box" style="height:200px;display:flex;align-items:center;justify-content:center;color:#cbd5e1;font-size:10pt;">No heatmap available</div>`
        }
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Diagnostic Probabilities (18 labels)</div>
    <table>
      <thead>
        <tr>
          <th>Finding</th>
          <th style="text-align:right;">Probability</th>
          <th style="text-align:right;">Uncertainty (±)</th>
          <th style="text-align:right;">Severity</th>
        </tr>
      </thead>
      <tbody>${findingsRows}</tbody>
    </table>
  </div>

  <div class="disclaimer">
    <strong>Clinical Disclaimer.</strong> This output is generated by a research prototype and is
    <strong>not a medical diagnosis</strong>. It is intended for investigational and educational use only.
    All findings must be reviewed by a qualified radiologist or clinician before any clinical decision.
    The ± value is the standard deviation across ${result.mc_passes ?? 10} Monte Carlo Dropout passes and
    represents a proxy for predictive uncertainty, not a statistical guarantee of correctness.
    Heatmaps are anatomically constrained to lung fields and cardiac silhouette using PSPNet segmentation.
  </div>

  <div class="footer">
    <div>NAVANTIX PULMO v1.0 · RESEARCH PROTOTYPE · NOT FOR CLINICAL USE</div>
    <div>BUILT IN GHANA · STUDY ${studyId}</div>
  </div>

  <div class="no-print">
    <button onclick="window.print()">Print / Save as PDF</button>
  </div>
</body>
</html>`

    const w = window.open('', '_blank')
    if (!w) {
      alert('Please allow pop-ups for this site to generate a report.')
      return
    }
    w.document.write(html)
    w.document.close()
  }

  const currentHeatmap = (() => {
    if (!result?.heatmaps) return result?.heatmap_base64 ?? null
    if (selectedFinding && result.heatmaps[selectedFinding]) {
      return result.heatmaps[selectedFinding]
    }
    return result.heatmap_base64
  })()

  const hasAnyHeatmap = !!currentHeatmap
  const displayedImage =
    showHeatmap && hasAnyHeatmap
      ? `data:image/png;base64,${currentHeatmap}`
      : preview

  const lowConfidenceCount = result?.findings
    ? result.findings.filter(
        (f) => f.confidence === 'low' && f.score >= (result.threshold ?? 0.5)
      ).length
    : 0

  const formatTime = (ts: number) =>
    new Date(ts).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-8 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-2xl font-bold text-slate-900 tracking-tight">
              N<span className="text-blue-600">+</span>
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900 tracking-wide uppercase">
                Navantix Pulmo
              </div>
              <div className="text-[10px] text-slate-500 tracking-[0.18em] font-mono uppercase">
                Clinical v1.0
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span className="text-xs text-emerald-700 font-medium">Connected</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-8 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-slate-900 mb-1">New Study</h1>
          <p className="text-sm text-slate-500">
            Upload a chest radiograph for AI-assisted analysis. Research prototype — not for clinical use.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-8">
          <section>
            <div className="text-[10px] font-semibold text-slate-500 tracking-[0.14em] uppercase mb-3">
              Radiograph
            </div>

            {!preview ? (
              <div
                onDrop={onDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => inputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 rounded-lg bg-white p-12 text-center cursor-pointer hover:border-blue-500 transition-colors"
              >
                <div className="text-slate-500 text-sm">
                  <div className="text-base font-medium text-slate-700 mb-1">
                    Drop chest X-ray here
                  </div>
                  <div className="text-slate-400">or click to browse</div>
                </div>
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg"
                  onChange={onUpload}
                  className="hidden"
                />
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-lg p-4">
                {hasAnyHeatmap && !result?.rejected && (
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-[10px] font-semibold text-slate-500 tracking-[0.14em] uppercase">
                      {showHeatmap ? 'AI Attention Overlay' : 'Original Radiograph'}
                    </div>
                    <button
                      onClick={() => setShowHeatmap((v) => !v)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                        showHeatmap
                          ? 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          showHeatmap ? 'bg-blue-500' : 'bg-slate-400'
                        }`}
                      ></span>
                      {showHeatmap ? 'Hide heatmap' : 'Show heatmap'}
                    </button>
                  </div>
                )}

                <div className="relative">
                  <img
                    src={displayedImage ?? ''}
                    alt={showHeatmap ? 'Attention overlay' : 'Uploaded radiograph'}
                    className="w-full rounded"
                  />
                  {showHeatmap && hasAnyHeatmap && selectedFinding && (
                    <div className="absolute top-3 left-3 px-2 py-1 bg-blue-600 text-white text-[10px] font-mono font-bold tracking-wider rounded uppercase">
                      {selectedFinding}
                    </div>
                  )}
                </div>

                <div className="flex gap-2 mt-4 text-[10px] font-mono text-slate-500">
                  <span className="px-2 py-1 bg-slate-100 rounded">
                    {file?.name.slice(0, 24) ?? result?.filename.slice(0, 24) ?? 'saved'}
                  </span>
                  {file && (
                    <span className="px-2 py-1 bg-slate-100 rounded">
                      {(file.size / 1024).toFixed(0)} KB
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-3 mt-5">
              <button
                onClick={runAnalysis}
                disabled={!file || loading}
                className="flex-1 bg-blue-600 text-white px-5 py-3 rounded-md font-medium text-sm hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Analyzing (10 MC passes)...' : 'Run AI Analysis'}
              </button>
              {preview && (
                <button
                  onClick={clear}
                  disabled={loading}
                  className="px-5 py-3 rounded-md border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
                >
                  Clear
                </button>
              )}
            </div>

            {result && !result.rejected && (
              <div className="mt-5 p-4 bg-white border border-slate-200 rounded-lg">
                <div className="text-[10px] font-semibold text-slate-500 tracking-[0.14em] uppercase mb-3">
                  Patient Information (optional)
                </div>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <input
                    type="text"
                    placeholder="Patient ID"
                    value={patientId}
                    onChange={(e) => setPatientId(e.target.value)}
                    className="px-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-blue-400"
                  />
                  <input
                    type="text"
                    placeholder="Age"
                    value={patientAge}
                    onChange={(e) => setPatientAge(e.target.value)}
                    className="px-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-blue-400"
                  />
                  <select
                    value={patientSex}
                    onChange={(e) => setPatientSex(e.target.value)}
                    className="px-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-blue-400 bg-white"
                  >
                    <option value="">Sex</option>
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                    <option value="O">Other</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={saveCurrentStudy}
                    className={`px-4 py-2.5 rounded-md font-medium text-sm transition-colors ${
                      savedFlash
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-900 text-white hover:bg-slate-800'
                    }`}
                  >
                    {savedFlash ? '✓ Saved' : 'Save Study'}
                  </button>
                  <button
                    onClick={generateReport}
                    className="px-4 py-2.5 rounded-md font-medium text-sm bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                  >
                    Generate Report (PDF)
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="text-red-900 font-semibold text-sm mb-1">Error</div>
                <div className="text-red-700 text-xs font-mono">{error}</div>
              </div>
            )}
          </section>

          <section>
            <div className="text-[10px] font-semibold text-slate-500 tracking-[0.14em] uppercase mb-3">
              Diagnostic Probabilities
            </div>

            {!result && !loading && (
              <div className="bg-white border border-slate-200 rounded-lg p-12 text-center text-slate-400 text-sm">
                Awaiting analysis. Upload a radiograph and click Run AI Analysis.
              </div>
            )}

            {loading && (
              <div className="bg-white border border-slate-200 rounded-lg p-12 text-center text-slate-500 text-sm">
                Running 10 MC Dropout passes and generating heatmaps...
              </div>
            )}

            {result?.rejected && (
              <div className="space-y-4">
                <div className="bg-white border-l-4 border-amber-500 border-y border-r border-slate-200 rounded-lg p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-bold text-xl flex-shrink-0">
                      !
                    </div>
                    <div className="flex-1">
                      <div className="text-lg font-semibold text-slate-900 mb-1">
                        Image rejected — not a chest X-ray
                      </div>
                      <div className="text-sm text-slate-600">
                        {result.rejection_reason}
                      </div>
                    </div>
                  </div>
                </div>
                <button
                  onClick={clear}
                  className="w-full bg-slate-900 text-white px-5 py-3 rounded-md font-medium text-sm hover:bg-slate-800 transition-colors"
                >
                  Upload a different image
                </button>
              </div>
            )}

            {result && !result.rejected && (
              <div>
                {lowConfidenceCount > 0 && (
                  <div className="mb-5 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
                    <span className="text-amber-700 font-bold text-base leading-none mt-0.5">
                      !
                    </span>
                    <div className="text-xs text-amber-800">
                      <div className="font-semibold mb-0.5">
                        Low confidence on {lowConfidenceCount} flagged finding
                        {lowConfidenceCount > 1 ? 's' : ''}
                      </div>
                      <div className="text-amber-700">
                        High variance detected across MC passes. Radiologist review recommended.
                      </div>
                    </div>
                  </div>
                )}

                <div
                  className={`mb-5 p-4 rounded-lg flex items-center gap-3 text-sm font-medium ${
                    result.flagged
                      ? 'bg-red-50 border border-red-200 text-red-800'
                      : 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                  }`}
                >
                  <span className="text-lg font-bold font-mono">
                    {result.flagged ? '!' : '✓'}
                  </span>
                  <span>
                    {result.flagged
                      ? `Pathologies flagged above ${((result.threshold ?? 0.5) * 100).toFixed(0)}% threshold`
                      : `No pathologies flagged above ${((result.threshold ?? 0.5) * 100).toFixed(0)}% threshold`}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2 mb-3 text-[10px] font-mono">
                  <span className="px-2 py-1 bg-slate-900 text-white rounded">
                    DENSENET-121
                  </span>
                  {result.elapsed_ms !== undefined && (
                    <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded">
                      {result.elapsed_ms.toFixed(0)} ms
                    </span>
                  )}
                  <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded">
                    18 LABELS
                  </span>
                  <span className="px-2 py-1 bg-violet-50 text-violet-700 rounded">
                    MC×{result.mc_passes ?? 10}
                  </span>
                  {result.modality && (
                    <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded">
                      CXR {(result.modality.cxr_score * 100).toFixed(0)}%
                    </span>
                  )}
                </div>

                <div className="text-xs text-slate-500 mb-3 italic">
                  Click any finding with a blue dot to see its attention map.
                  <span className="font-mono"> ± </span>
                  values show model uncertainty.
                </div>

                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  {result.findings.map((f) => {
                    const hasHeatmap = result.heatmaps && result.heatmaps[f.label]
                    const isSelected = selectedFinding === f.label
                    const barColor =
                      f.severity === 'high'
                        ? 'bg-red-500'
                        : f.severity === 'moderate'
                        ? 'bg-amber-500'
                        : 'bg-slate-400'
                    const sevClass =
                      f.severity === 'high'
                        ? 'bg-red-50 text-red-700'
                        : f.severity === 'moderate'
                        ? 'bg-amber-50 text-amber-800'
                        : 'bg-slate-100 text-slate-600'
                    const confClass =
                      f.confidence === 'high'
                        ? 'text-emerald-700'
                        : f.confidence === 'medium'
                        ? 'text-amber-700'
                        : 'text-red-600'

                    const meanPct = f.score * 100
                    const stdPct = (f.std ?? 0) * 100
                    const low = Math.max(0, meanPct - stdPct)
                    const high = Math.min(100, meanPct + stdPct)
                    const bandWidth = high - low

                    return (
                      <div
                        key={f.label}
                        onClick={() => {
                          if (hasHeatmap) {
                            setSelectedFinding(f.label)
                            setShowHeatmap(true)
                          }
                        }}
                        className={`grid grid-cols-[1fr_auto_60px_65px_80px] items-center gap-3 py-2 border-b border-slate-100 last:border-0 px-2 rounded transition-colors ${
                          hasHeatmap
                            ? 'cursor-pointer hover:bg-blue-50'
                            : 'cursor-default'
                        } ${isSelected ? 'bg-blue-50 ring-1 ring-blue-200' : ''}`}
                      >
                        <div className="text-sm text-slate-800 flex items-center gap-2">
                          {hasHeatmap && (
                            <span
                              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                isSelected ? 'bg-blue-500' : 'bg-slate-300'
                              }`}
                            ></span>
                          )}
                          {f.label}
                        </div>

                        <div className="relative w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="absolute top-0 h-full bg-blue-100"
                            style={{
                              left: `${low}%`,
                              width: `${bandWidth}%`,
                            }}
                          ></div>
                          <div
                            className={`absolute top-0 left-0 h-full ${barColor}`}
                            style={{ width: `${meanPct}%` }}
                          />
                        </div>

                        <div className="text-xs font-mono text-slate-900 text-right">
                          {meanPct.toFixed(1)}%
                        </div>
                        <div className={`text-[10px] font-mono text-right ${confClass}`}>
                          ±{stdPct.toFixed(1)}
                        </div>
                        <div className="text-right">
                          <span
                            className={`text-[9px] font-mono font-bold tracking-wider px-2 py-1 rounded uppercase ${sevClass}`}
                          >
                            {f.severity}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="mt-4 text-[10px] text-slate-500 leading-relaxed">
                  <div className="font-mono uppercase tracking-wider mb-1">
                    About the uncertainty metric
                  </div>
                  <div>
                    ± value is the standard deviation across {result.mc_passes ?? 10} Monte Carlo
                    Dropout passes. <span className="text-emerald-700 font-medium">Low</span> std
                    means the model is confident. <span className="text-red-600 font-medium">High</span>{' '}
                    std means it is uncertain.
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>

        {studies.length > 0 && (
          <section className="mt-12">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-[10px] font-semibold text-slate-500 tracking-[0.14em] uppercase">
                  Recent Studies
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {studies.length} saved on this device
                </div>
              </div>
              <button
                onClick={clearAllStudies}
                className="text-xs text-slate-500 hover:text-red-600 font-medium"
              >
                Clear all
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {studies.map((s) => (
                <div
                  key={s.id}
                  className="bg-white border border-slate-200 rounded-lg overflow-hidden hover:border-blue-400 transition-colors group"
                >
                  <button
                    onClick={() => loadStudy(s)}
                    className="w-full text-left"
                  >
                    <div className="aspect-square bg-slate-100 overflow-hidden">
                      {s.thumbnail ? (
                        <img
                          src={s.thumbnail}
                          alt={s.filename}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">
                          no image
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span
                          className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            s.flagged ? 'bg-red-500' : 'bg-emerald-500'
                          }`}
                        ></span>
                        <div className="text-xs font-medium text-slate-800 truncate">
                          {s.top_finding}
                        </div>
                      </div>
                      <div className="text-[10px] font-mono text-slate-500">
                        {(s.top_score * 100).toFixed(1)}% · {formatTime(s.timestamp)}
                      </div>
                    </div>
                  </button>
                  <div className="border-t border-slate-100 px-3 py-1.5 flex justify-end">
                    <button
                      onClick={() => deleteStudy(s.id)}
                      className="text-[10px] text-slate-400 hover:text-red-600 font-medium"
                    >
                      delete
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 text-[10px] text-slate-400 font-mono">
              Studies stored locally in your browser · {MAX_STUDIES} max
            </div>
          </section>
        )}

        <div className="mt-12 text-[10px] text-slate-400 font-mono tracking-wider flex justify-between">
          <span>NAVANTIX PULMO v1.0 · RESEARCH PROTOTYPE · NOT FOR CLINICAL USE</span>
          <span>BUILT IN GHANA</span>
        </div>
      </main>
    </div>
  )
}

export default App