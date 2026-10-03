import { useEffect, useRef, useState } from 'react'

const API_BASE = 'http://127.0.0.1:8000'
const STORAGE_KEY = 'navantix_studies_v4'

type Prediction = {
  label: string
  score: number
  std: number
  threshold: number
  severity: 'high' | 'moderate' | 'low'
  confidence: 'high' | 'medium' | 'low'
  flagged: boolean
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
  study_id?: string
  filename: string
  rejected: boolean
  rejection_reason?: string
  elapsed_ms?: number
  threshold_default?: number
  top_finding?: string
  top_score?: number
  top_std?: number
  top_threshold?: number
  flagged?: boolean
  flagged_count?: number
  findings: Prediction[]
  heatmap_base64: string | null
  heatmaps?: Record<string, string>
  modality?: ModalityInfo
  backend?: string
  thresholds_source?: string
  lung_mask_applied?: boolean
  priority_labels_count?: number
}

type PatientInfo = {
  patientId: string
  age: string
  sex: 'Male' | 'Female' | 'Other' | ''
}

type SavedStudy = {
  id: string
  timestamp: string
  patient: PatientInfo
  filename: string
  topFinding: string
  topScore: number
  flaggedCount: number
  findings: Prediction[]
  elapsed_ms: number
}

type Page = 'new' | 'worklist' | 'reports'

function loadStudies(): SavedStudy[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}
function saveStudies(studies: SavedStudy[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(studies))
  } catch {}
}

function App() {
  const [page, setPage] = useState<Page>('new')
  const [studies, setStudies] = useState<SavedStudy[]>(() => loadStudies())

  const addStudy = (s: SavedStudy) => {
    const next = [s, ...studies]
    setStudies(next)
    saveStudies(next)
  }
  const deleteStudy = (id: string) => {
    const next = studies.filter((s) => s.id !== id)
    setStudies(next)
    saveStudies(next)
  }
  const clearAll = () => {
    if (confirm('Delete all saved studies? This cannot be undone.')) {
      setStudies([])
      saveStudies([])
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar page={page} setPage={setPage} count={studies.length} />
      <div className="flex-1 min-w-0">
        {page === 'new' && <NewStudyPage onSave={addStudy} />}
        {page === 'worklist' && (
          <WorklistPage studies={studies} onDelete={deleteStudy} onClearAll={clearAll} />
        )}
        {page === 'reports' && <ReportsPage studies={studies} />}
      </div>
    </div>
  )
}

function Sidebar({
  page,
  setPage,
  count,
}: {
  page: Page
  setPage: (p: Page) => void
  count: number
}) {
  const items: { key: Page; label: string; badge?: number }[] = [
    { key: 'new', label: 'New Study' },
    { key: 'worklist', label: 'Worklist', badge: count },
    { key: 'reports', label: 'Reports' },
  ]
  return (
    <aside className="w-64 bg-slate-900 flex-shrink-0 min-h-screen flex flex-col">
      <div className="px-5 py-6 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="text-2xl font-bold text-white tracking-tight">
            N<span className="text-blue-500">+</span>
          </div>
          <div>
            <div className="text-xs font-semibold text-white tracking-widest uppercase">
              Navantix Pulmo
            </div>
            <div className="text-[10px] text-slate-500 tracking-widest font-mono uppercase">
              Clinical v2.0
            </div>
          </div>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4">
        {items.map((item) => {
          const active = page === item.key
          return (
            <button
              key={item.key}
              onClick={() => setPage(item.key)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-md mb-1 text-sm text-left transition-colors ${
                active
                  ? 'bg-blue-600 text-white font-medium'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span>{item.label}</span>
              {item.badge !== undefined && item.badge > 0 && (
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                    active ? 'bg-blue-700 text-white' : 'bg-slate-700 text-slate-300'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          )
        })}
      </nav>
      <div className="px-5 py-4 border-t border-slate-800">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          <span className="text-[10px] text-emerald-400 font-mono">CONNECTED</span>
        </div>
        <div className="text-[10px] text-slate-500 font-mono leading-relaxed">
          admin@navantix.local
          <br />
          10 LABELS · RESEARCH
        </div>
      </div>
    </aside>
  )
}

function NewStudyPage({ onSave }: { onSave: (s: SavedStudy) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingHeatmapFor, setLoadingHeatmapFor] = useState<string | null>(null)
  const [result, setResult] = useState<PredictResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [selectedFinding, setSelectedFinding] = useState<string | null>(null)
  const [localHeatmaps, setLocalHeatmaps] = useState<Record<string, string>>({})
  const [patient, setPatient] = useState<PatientInfo>({
    patientId: '',
    age: '',
    sex: '',
  })
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setLocalHeatmaps({})
  }, [result])

  const handleFile = (f: File) => {
    setFile(f)
    setResult(null)
    setError(null)
    setShowHeatmap(false)
    setSelectedFinding(null)
    setSaveMessage(null)
    setLocalHeatmaps({})
    const r = new FileReader()
    r.onload = (e) => setPreview(e.target?.result as string)
    r.readAsDataURL(f)
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
    setSaveMessage(null)
    setLocalHeatmaps({})
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`${API_BASE}/predict`, { method: 'POST', body: form })
      if (!res.ok) throw new Error(`Server error (HTTP ${res.status}).`)
      const data: PredictResponse = await res.json()
      setResult(data)
      if (!data.rejected && data.top_finding && data.study_id) {
        setSelectedFinding(data.top_finding)
        const label = data.top_finding
        const studyId = data.study_id
        fetch(`${API_BASE}/heatmap/${studyId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ label }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((h) => {
            if (h?.heatmap_base64) {
              setLocalHeatmaps((p) => ({ ...p, [label]: h.heatmap_base64 }))
              setShowHeatmap(true)
            }
          })
          .catch(() => {})
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const requestHeatmap = async (label: string) => {
    if (!result?.study_id || localHeatmaps[label]) return
    setLoadingHeatmapFor(label)
    try {
      const res = await fetch(`${API_BASE}/heatmap/${result.study_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setLocalHeatmaps((p) => ({ ...p, [label]: data.heatmap_base64 }))
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingHeatmapFor(null)
    }
  }

  const clear = () => {
    setFile(null)
    setPreview(null)
    setResult(null)
    setError(null)
    setShowHeatmap(false)
    setSelectedFinding(null)
    setSaveMessage(null)
    setLocalHeatmaps({})
    setPatient({ patientId: '', age: '', sex: '' })
    if (inputRef.current) inputRef.current.value = ''
  }

  const saveStudy = () => {
    if (!result || result.rejected) return
    const study: SavedStudy = {
      id: `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      patient,
      filename: result.filename,
      topFinding: result.top_finding || '',
      topScore: result.top_score || 0,
      flaggedCount: result.flagged_count || 0,
      findings: result.findings,
      elapsed_ms: result.elapsed_ms || 0,
    }
    onSave(study)
    setSaveMessage(`Saved · ${new Date().toLocaleTimeString()}`)
  }

  const generateReport = () => {
    if (!result || result.rejected) return

    const flagged = result.findings.filter((f) => f.flagged)
    const topThree = result.findings.slice(0, 3)

    const flaggedRows =
      flagged.length > 0
        ? flagged
            .map(
              (f) => `
        <tr>
          <td class="finding-name">${f.label}</td>
          <td class="finding-score">${(f.score * 100).toFixed(1)}%</td>
          <td class="finding-threshold">${(f.threshold * 100).toFixed(0)}%</td>
          <td><span class="sev-${f.severity}">${f.severity.toUpperCase()}</span></td>
        </tr>`
            )
            .join('')
        : '<tr><td colspan="4" class="no-findings">No findings above clinical thresholds</td></tr>'

    const topThreeRows = topThree
      .map(
        (f, i) => `
      <tr>
        <td class="rank">${i + 1}</td>
        <td>${f.label}</td>
        <td class="finding-score">${(f.score * 100).toFixed(1)}%</td>
      </tr>`
      )
      .join('')

    const patientId = patient.patientId || 'Not provided'
    const patientAge = patient.age ? `${patient.age} years` : 'Not provided'
    const patientSex = patient.sex || 'Not provided'

    const now = new Date()
    const reportId = `NP-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Navantix Pulmo Report ${reportId}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.5;
    color: #0f172a;
    background: #ffffff;
    margin: 0;
    padding: 0;
  }
  .report { max-width: 800px; margin: 0 auto; padding: 24px; }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding-bottom: 16px;
    border-bottom: 2px solid #0f172a;
    margin-bottom: 24px;
  }
  .brand { display: flex; align-items: center; gap: 12px; }
  .logo {
    width: 44px; height: 44px;
    background: #0f172a;
    color: #ffffff;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    font-weight: 700;
    letter-spacing: -0.5px;
  }
  .brand-name {
    font-size: 14pt;
    font-weight: 700;
    letter-spacing: 0.5px;
    margin: 0;
  }
  .brand-sub {
    font-size: 8pt;
    color: #64748b;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    margin: 2px 0 0;
  }
  .report-meta { text-align: right; font-size: 8.5pt; color: #475569; line-height: 1.6; }
  .report-id {
    font-family: "SF Mono", Consolas, monospace;
    font-weight: 600;
    color: #0f172a;
  }

  .doc-title {
    font-size: 15pt;
    font-weight: 700;
    text-align: center;
    text-transform: uppercase;
    letter-spacing: 2px;
    margin: 0 0 6px;
    color: #0f172a;
  }
  .doc-subtitle {
    text-align: center;
    font-size: 9pt;
    color: #64748b;
    letter-spacing: 1px;
    margin: 0 0 28px;
  }

  .section { margin-bottom: 22px; }
  .section-title {
    font-size: 8.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: #475569;
    margin: 0 0 10px;
    padding-bottom: 5px;
    border-bottom: 1px solid #cbd5e1;
  }

  .info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 10px 20px;
  }
  .info-item { font-size: 10pt; }
  .info-label {
    font-size: 8pt;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    margin-bottom: 2px;
  }
  .info-value { font-weight: 500; color: #0f172a; word-break: break-word; }

  .summary {
    padding: 12px 14px;
    background: #f8fafc;
    border-left: 3px solid #0f172a;
    font-size: 10pt;
  }
  .summary .top-finding { font-weight: 700; }
  .summary .count { font-weight: 700; }

  .alert {
    padding: 10px 14px;
    font-size: 10pt;
    border-radius: 4px;
    margin-bottom: 20px;
  }
  .alert-warn { background: #fef2f2; color: #991b1b; border-left: 3px solid #dc2626; }
  .alert-clear { background: #ecfdf5; color: #065f46; border-left: 3px solid #10b981; }

  table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  thead th {
    text-align: left;
    padding: 8px 10px;
    font-size: 8pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #475569;
    border-bottom: 1.5px solid #0f172a;
  }
  tbody td {
    padding: 8px 10px;
    border-bottom: 1px solid #e2e8f0;
    vertical-align: middle;
  }
  tbody tr:last-child td { border-bottom: none; }
  .finding-name { font-weight: 500; }
  .finding-score,
  .finding-threshold {
    font-family: "SF Mono", Consolas, monospace;
  }
  .finding-score { font-weight: 600; }
  .finding-threshold { color: #64748b; }
  .rank { color: #64748b; font-family: "SF Mono", Consolas, monospace; }
  .no-findings {
    text-align: center;
    color: #64748b;
    font-style: italic;
    padding: 16px;
  }

  .sev-high,
  .sev-moderate,
  .sev-low {
    display: inline-block;
    font-size: 8pt;
    font-weight: 700;
    letter-spacing: 0.8px;
    padding: 2px 8px;
    border-radius: 3px;
    text-transform: uppercase;
  }
  .sev-high { background: #fee2e2; color: #991b1b; }
  .sev-moderate { background: #fef3c7; color: #92400e; }
  .sev-low { background: #e2e8f0; color: #475569; }

  .impression {
    padding: 14px 16px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    font-size: 10pt;
    line-height: 1.6;
  }

  .recommendation {
    padding: 12px 14px;
    background: #fffbeb;
    border-left: 3px solid #d97706;
    font-size: 10pt;
    margin-top: 10px;
  }

  .signature-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 40px;
    margin-top: 40px;
    padding-top: 20px;
    border-top: 1px solid #cbd5e1;
  }
  .signature-line {
    border-top: 1px solid #0f172a;
    padding-top: 6px;
    font-size: 8.5pt;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.8px;
  }

  .disclaimer {
    margin-top: 32px;
    padding: 14px 16px;
    background: #f1f5f9;
    border-radius: 4px;
    font-size: 8.5pt;
    line-height: 1.55;
    color: #475569;
  }
  .disclaimer-title {
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #0f172a;
    font-size: 8pt;
    margin-bottom: 4px;
  }
  .disclaimer p { margin: 0 0 6px; }
  .disclaimer p:last-child { margin-bottom: 0; }

  .footer {
    margin-top: 24px;
    padding-top: 12px;
    border-top: 1px solid #e2e8f0;
    display: flex;
    justify-content: space-between;
    font-size: 8pt;
    color: #94a3b8;
    letter-spacing: 0.8px;
    text-transform: uppercase;
  }

  @media print {
    body { font-size: 10pt; }
    .report { padding: 0; }
  }
</style>
</head>
<body>
<div class="report">

  <div class="header">
    <div class="brand">
      <div class="logo">N+</div>
      <div>
        <h1 class="brand-name">NAVANTIX PULMO</h1>
        <p class="brand-sub">AI-Assisted Chest Radiograph Analysis</p>
      </div>
    </div>
    <div class="report-meta">
      <div>Report ID: <span class="report-id">${reportId}</span></div>
      <div>Generated: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}</div>
    </div>
  </div>

  <h2 class="doc-title">Chest Radiograph Analysis Report</h2>
  <p class="doc-subtitle">AI-Assisted Interpretation &middot; Research Prototype</p>

  <div class="section">
    <h3 class="section-title">Patient &amp; Study Information</h3>
    <div class="info-grid">
      <div class="info-item">
        <div class="info-label">Patient ID</div>
        <div class="info-value">${patientId}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Age</div>
        <div class="info-value">${patientAge}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Sex</div>
        <div class="info-value">${patientSex}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Modality</div>
        <div class="info-value">Chest X-ray (PA/AP)</div>
      </div>
      <div class="info-item">
        <div class="info-label">Source File</div>
        <div class="info-value">${result.filename}</div>
      </div>
      <div class="info-item">
        <div class="info-label">AI Processing Time</div>
        <div class="info-value">${result.elapsed_ms?.toFixed(0) ?? '--'} ms</div>
      </div>
    </div>
  </div>

  <div class="section">
    <h3 class="section-title">Summary of Findings</h3>
    <div class="summary">
      <div>Top AI-detected finding: <span class="top-finding">${result.top_finding ?? 'N/A'}</span> (${((result.top_score ?? 0) * 100).toFixed(1)}% AI score)</div>
      <div style="margin-top:4px;">Findings above clinical threshold: <span class="count">${result.flagged_count ?? 0}</span> of ${result.priority_labels_count ?? 10}</div>
    </div>
  </div>

  ${
    flagged.length > 0
      ? `<div class="alert alert-warn"><strong>ATTENTION:</strong> ${flagged.length} finding(s) above clinical thresholds. Radiologist review recommended.</div>`
      : `<div class="alert alert-clear"><strong>No acute findings</strong> above clinical thresholds. Routine review recommended.</div>`
  }

  <div class="section">
    <h3 class="section-title">Findings Above Clinical Threshold</h3>
    <table>
      <thead>
        <tr>
          <th>Finding</th>
          <th>AI Score</th>
          <th>Threshold</th>
          <th>Severity</th>
        </tr>
      </thead>
      <tbody>
        ${flaggedRows}
      </tbody>
    </table>
  </div>

  <div class="section">
    <h3 class="section-title">Top AI-Detected Findings</h3>
    <table>
      <thead>
        <tr>
          <th style="width:60px;">Rank</th>
          <th>Finding</th>
          <th style="width:120px;">AI Score</th>
        </tr>
      </thead>
      <tbody>
        ${topThreeRows}
      </tbody>
    </table>
  </div>

  <div class="section">
    <h3 class="section-title">Impression</h3>
    <div class="impression">
      ${
        flagged.length > 0
          ? `AI analysis detected ${flagged.length} finding(s) above the clinical decision threshold: ${flagged.map((f) => f.label).join(', ')}. The most prominent finding is <strong>${result.top_finding}</strong> with an AI score of ${((result.top_score ?? 0) * 100).toFixed(1)}%. All findings require verification by a qualified radiologist.`
          : `AI analysis identified no acute findings above the clinical decision threshold. The most prominent AI-detected feature is <strong>${result.top_finding ?? 'N/A'}</strong> with a score of ${((result.top_score ?? 0) * 100).toFixed(1)}%, which remains below the threshold for concern. Standard radiological review is recommended.`
      }
    </div>
    <div class="recommendation">
      <strong>Clinical Recommendation:</strong> This AI-assisted analysis is a supplementary tool. All findings must be independently verified by a qualified radiologist before any clinical decision. The AI output does not constitute a diagnosis.
    </div>
  </div>

  <div class="signature-grid">
    <div>
      <div class="signature-line">Radiologist / Reviewing Physician</div>
    </div>
    <div>
      <div class="signature-line">Date of Review</div>
    </div>
  </div>

  <div class="disclaimer">
    <div class="disclaimer-title">Clinical Disclaimer</div>
    <p>This report is generated by the Navantix Pulmo research prototype, an AI-assisted analysis tool. It is <strong>not a medical diagnosis</strong> and must not be used as the sole basis for clinical decisions. AI output is not a substitute for professional radiological interpretation. The tool has not been validated for clinical use in any specific population and has not received regulatory approval.</p>
    <p>All AI scores are model outputs and are not calibrated probabilities. Radiologist correlation and clinical context are required for interpretation.</p>
  </div>

  <div class="footer">
    <div>Navantix Pulmo v2.0 &middot; Research Prototype</div>
    <div>Built in Ghana &middot; Not for clinical use</div>
  </div>

</div>
</body>
</html>`

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank')
    if (win) win.onload = () => setTimeout(() => win.print(), 500)
  }

  const currentHeatmap = selectedFinding ? localHeatmaps[selectedFinding] : null
  const hasAnyHeatmap = !!currentHeatmap
  const displayedImage =
    showHeatmap && hasAnyHeatmap
      ? `data:image/png;base64,${currentHeatmap}`
      : preview

  return (
    <div className="max-w-7xl mx-auto px-8 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900 mb-1">New Study</h1>
        <p className="text-sm text-slate-500">
          Upload a chest radiograph for AI-assisted analysis.{' '}
          {result?.priority_labels_count ?? 10} priority findings · Research prototype.
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
                  {file?.name.slice(0, 24)}
                </span>
                <span className="px-2 py-1 bg-slate-100 rounded">
                  {file ? (file.size / 1024).toFixed(0) : '0'} KB
                </span>
              </div>
            </div>
          )}

          <div className="flex gap-3 mt-5">
            <button
              onClick={runAnalysis}
              disabled={!file || loading}
              className="flex-1 bg-blue-600 text-white px-5 py-3 rounded-md font-medium text-sm hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Analyzing...' : 'Run AI Analysis'}
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

          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="text-red-900 font-semibold text-sm mb-1">Error</div>
              <div className="text-red-700 text-xs font-mono">{error}</div>
            </div>
          )}

          {result && !result.rejected && (
            <div className="mt-5 bg-white border border-slate-200 rounded-lg p-5">
              <div className="text-[10px] font-semibold text-slate-500 tracking-[0.14em] uppercase mb-4">
                Patient Information (Optional)
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <input
                  type="text"
                  placeholder="Patient ID"
                  value={patient.patientId}
                  onChange={(e) =>
                    setPatient({ ...patient, patientId: e.target.value })
                  }
                  className="border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
                <input
                  type="number"
                  placeholder="Age"
                  value={patient.age}
                  onChange={(e) => setPatient({ ...patient, age: e.target.value })}
                  className="border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <select
                value={patient.sex}
                onChange={(e) =>
                  setPatient({
                    ...patient,
                    sex: e.target.value as PatientInfo['sex'],
                  })
                }
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm mb-4 focus:outline-none focus:border-blue-500"
              >
                <option value="">Sex — select</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={saveStudy}
                  className="bg-slate-900 text-white px-4 py-2.5 rounded-md text-sm font-medium hover:bg-slate-800 transition-colors"
                >
                  Save to Worklist
                </button>
                <button
                  onClick={generateReport}
                  className="bg-blue-600 text-white px-4 py-2.5 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  Generate Report
                </button>
              </div>
              {saveMessage && (
                <div className="mt-3 text-xs text-emerald-700 font-mono">
                  {saveMessage}
                </div>
              )}
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
              Analyzing...
            </div>
          )}

          {result?.rejected && (
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
          )}

          {result && !result.rejected && (
            <div>
              <div
                className={`mb-5 p-4 rounded-lg flex items-center gap-3 text-sm font-medium ${
                  result.flagged_count && result.flagged_count > 0
                    ? 'bg-red-50 border border-red-200 text-red-800'
                    : 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                }`}
              >
                <span className="text-lg font-bold font-mono">
                  {result.flagged_count && result.flagged_count > 0 ? '!' : '✓'}
                </span>
                <span>
                  {result.flagged_count && result.flagged_count > 0
                    ? `${result.flagged_count} finding${
                        result.flagged_count > 1 ? 's' : ''
                      } above per-class threshold`
                    : 'No findings above per-class thresholds'}
                </span>
              </div>

              <div className="flex flex-wrap gap-2 mb-3 text-[10px] font-mono">
                <span className="px-2 py-1 bg-slate-900 text-white rounded">
                  DENSENET-121
                </span>
                <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded">
                  {result.elapsed_ms?.toFixed(0)} ms
                </span>
                <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded">
                  {result.priority_labels_count ?? 10} LABELS
                </span>
                {result.thresholds_source === 'per_class' && (
                  <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded">
                    PER-CLASS
                  </span>
                )}
                {result.modality && (
                  <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded">
                    CXR {(result.modality.cxr_score * 100).toFixed(0)}%
                  </span>
                )}
              </div>

              <div className="text-xs text-slate-500 mb-3 italic">
                Click any finding with a blue dot to load its attention map on demand.
              </div>

              <div className="bg-white border border-slate-200 rounded-lg p-4">
                {result.findings.map((f) => {
                  const hasHeatmapAlready = !!localHeatmaps[f.label]
                  const canRequest = !!result.study_id
                  const isSelected = selectedFinding === f.label
                  const isLoadingThis = loadingHeatmapFor === f.label
                  const barCls = f.flagged
                    ? f.severity === 'high'
                      ? 'bg-red-500'
                      : 'bg-amber-500'
                    : 'bg-slate-300'
                  const sevClass =
                    f.severity === 'high'
                      ? 'bg-red-50 text-red-700'
                      : f.severity === 'moderate'
                      ? 'bg-amber-50 text-amber-800'
                      : 'bg-slate-100 text-slate-600'
                  const meanPct = f.score * 100
                  const thresholdPct = f.threshold * 100
                  return (
                    <div
                      key={f.label}
                      onClick={async () => {
                        if (!canRequest) return
                        setSelectedFinding(f.label)
                        setShowHeatmap(true)
                        if (!hasHeatmapAlready) await requestHeatmap(f.label)
                      }}
                      className={`grid grid-cols-[1fr_auto_70px_auto] items-center gap-3 py-2 border-b border-slate-100 last:border-0 px-2 rounded transition-colors ${
                        canRequest
                          ? 'cursor-pointer hover:bg-blue-50'
                          : 'cursor-default'
                      } ${isSelected ? 'bg-blue-50 ring-1 ring-blue-200' : ''}`}
                    >
                      <div
                        className={`text-sm flex items-center gap-2 ${
                          f.flagged ? 'text-slate-900 font-medium' : 'text-slate-600'
                        }`}
                      >
                        {canRequest && (
                          <span
                            className={`w-2 h-2 rounded-full flex-shrink-0 ${
                              hasHeatmapAlready
                                ? 'bg-blue-500'
                                : isLoadingThis
                                ? 'bg-amber-400 animate-pulse'
                                : 'bg-slate-300'
                            }`}
                          ></span>
                        )}
                        {f.label}
                        {f.flagged && (
                          <span className="text-[9px] font-mono text-red-600">●</span>
                        )}
                      </div>
                      <div className="relative w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`absolute top-0 left-0 h-full ${barCls}`}
                          style={{ width: `${meanPct}%` }}
                        />
                        <div
                          className="absolute top-[-2px] h-[10px] w-[1px] bg-slate-900"
                          style={{ left: `${thresholdPct}%` }}
                        />
                      </div>
                      <div className="text-xs font-mono text-slate-900 text-right">
                        {meanPct.toFixed(1)}%
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
            </div>
          )}
        </section>
      </div>

      <div className="mt-12 text-[10px] text-slate-400 font-mono tracking-wider flex justify-between">
        <span>NAVANTIX PULMO v2.0 · RESEARCH PROTOTYPE · NOT FOR CLINICAL USE</span>
        <span>BUILT IN GHANA</span>
      </div>
    </div>
  )
}

function WorklistPage({
  studies,
  onDelete,
  onClearAll,
}: {
  studies: SavedStudy[]
  onDelete: (id: string) => void
  onClearAll: () => void
}) {
  const [filter, setFilter] = useState<'all' | 'flagged' | 'clear'>('all')
  const [search, setSearch] = useState('')
  const filtered = studies.filter((s) => {
    if (filter === 'flagged' && s.flaggedCount === 0) return false
    if (filter === 'clear' && s.flaggedCount > 0) return false
    if (search) {
      const q = search.toLowerCase()
      const hay = `${s.patient.patientId} ${s.filename} ${s.topFinding}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
  const exportCsv = () => {
    const header =
      'timestamp,patient_id,age,sex,filename,top_finding,top_score,flagged_count\n'
    const rows = filtered
      .map(
        (s) =>
          `${s.timestamp},${s.patient.patientId || ''},${s.patient.age || ''},${
            s.patient.sex || ''
          },${s.filename},${s.topFinding},${s.topScore.toFixed(3)},${s.flaggedCount}`
      )
      .join('\n')
    const blob = new Blob([header + rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `navantix_worklist_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }
  return (
    <div className="max-w-7xl mx-auto px-8 py-10">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 mb-1">Worklist</h1>
          <p className="text-sm text-slate-500">{studies.length} saved · stored locally</p>
        </div>
        <div className="flex gap-2">
          {studies.length > 0 && (
            <>
              <button
                onClick={exportCsv}
                className="px-4 py-2 rounded-md border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50"
              >
                Export CSV
              </button>
              <button
                onClick={onClearAll}
                className="px-4 py-2 rounded-md border border-red-300 text-red-700 text-sm font-medium hover:bg-red-50"
              >
                Clear All
              </button>
            </>
          )}
        </div>
      </div>
      {studies.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-16 text-center">
          <div className="text-2xl font-mono text-slate-300 mb-3">∅</div>
          <div className="text-lg font-semibold text-slate-900 mb-1">No studies yet</div>
          <div className="text-sm text-slate-500">Analyze and save to begin.</div>
        </div>
      ) : (
        <>
          <div className="bg-white border border-slate-200 rounded-lg p-3 mb-5 flex flex-wrap items-center gap-3">
            <div className="flex gap-1">
              {(['all', 'flagged', 'clear'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    filter === f
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {f === 'all'
                    ? `All (${studies.length})`
                    : f === 'flagged'
                    ? `Flagged (${studies.filter((s) => s.flaggedCount > 0).length})`
                    : `Clear (${studies.filter((s) => s.flaggedCount === 0).length})`}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 min-w-[200px] border border-slate-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="text-left px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                    Patient
                  </th>
                  <th className="text-left px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                    Top Finding
                  </th>
                  <th className="text-right px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                    Score
                  </th>
                  <th className="text-center px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                    Flagged
                  </th>
                  <th className="text-right px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 text-xs font-mono text-slate-600">
                      {new Date(s.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="text-slate-800 font-medium">
                        {s.patient.patientId || '—'}
                      </div>
                      <div className="text-slate-400 text-[10px] font-mono">
                        {s.patient.age ? `${s.patient.age}y` : ''} {s.patient.sex || ''}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-800">{s.topFinding}</td>
                    <td className="px-4 py-3 text-xs font-mono text-right text-slate-900">
                      {(s.topScore * 100).toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-center text-xs font-mono">
                      {s.flaggedCount}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {s.flaggedCount > 0 ? (
                        <span className="text-[9px] font-mono font-bold px-2 py-1 rounded uppercase bg-red-50 text-red-700">
                          Flagged
                        </span>
                      ) : (
                        <span className="text-[9px] font-mono font-bold px-2 py-1 rounded uppercase bg-emerald-50 text-emerald-700">
                          Clear
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => onDelete(s.id)}
                        className="text-xs text-slate-400 hover:text-red-600 transition-colors"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="p-12 text-center text-slate-400 text-sm">
                No studies match.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function ReportsPage({ studies }: { studies: SavedStudy[] }) {
  const total = studies.length
  const flagged = studies.filter((s) => s.flaggedCount > 0).length
  const clear = total - flagged
  const flaggedRate = total > 0 ? ((flagged / total) * 100).toFixed(1) : '0.0'
  const avgTime =
    total > 0 ? studies.reduce((a, s) => a + s.elapsed_ms, 0) / total : 0
  const findingCounts: Record<string, number> = {}
  studies.forEach((s) =>
    s.findings
      .filter((f) => f.flagged)
      .forEach((f) => {
        findingCounts[f.label] = (findingCounts[f.label] || 0) + 1
      })
  )
  const topFindings = Object.entries(findingCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
  return (
    <div className="max-w-7xl mx-auto px-8 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900 mb-1">Reports</h1>
        <p className="text-sm text-slate-500">Session summary.</p>
      </div>
      {total === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-16 text-center">
          <div className="text-2xl font-mono text-slate-300 mb-3">∅</div>
          <div className="text-lg font-semibold text-slate-900 mb-1">No data yet</div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <MetricCard label="Total Studies" value={String(total)} accent="blue" />
            <MetricCard label="Flagged" value={String(flagged)} accent="red" />
            <MetricCard label="Clear" value={String(clear)} accent="emerald" />
            <MetricCard
              label="Mean Inference"
              value={`${avgTime.toFixed(0)} ms`}
              accent="slate"
            />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-lg p-6">
              <div className="text-[10px] font-semibold text-slate-500 tracking-[0.14em] uppercase mb-4">
                Flagged Rate
              </div>
              <div className="text-3xl font-mono font-semibold text-slate-900 mb-3">
                {flaggedRate}%
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-red-500 rounded-full"
                  style={{ width: `${flaggedRate}%` }}
                ></div>
              </div>
              <div className="text-xs text-slate-500 mt-3">
                {flagged} of {total} flagged.
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-6">
              <div className="text-[10px] font-semibold text-slate-500 tracking-[0.14em] uppercase mb-4">
                Top Flagged Findings
              </div>
              {topFindings.length === 0 ? (
                <div className="text-xs text-slate-400">None yet.</div>
              ) : (
                <div className="space-y-2">
                  {topFindings.map(([label, count]) => (
                    <div
                      key={label}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="text-slate-800">{label}</span>
                      <span className="font-mono text-slate-600">{count}×</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function MetricCard({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent: 'blue' | 'red' | 'emerald' | 'slate'
}) {
  const colorMap = {
    blue: 'text-blue-600',
    red: 'text-red-600',
    emerald: 'text-emerald-600',
    slate: 'text-slate-800',
  }
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5">
      <div className="text-[10px] font-semibold text-slate-500 tracking-[0.14em] uppercase mb-2">
        {label}
      </div>
      <div className={`text-2xl font-mono font-semibold ${colorMap[accent]}`}>
        {value}
      </div>
    </div>
  )
}

export default App