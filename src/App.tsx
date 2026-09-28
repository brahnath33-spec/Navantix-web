import { useRef, useState } from 'react'

const API_BASE = 'http://127.0.0.1:8000'

type Prediction = {
  label: string
  score: number
  severity: 'high' | 'moderate' | 'low'
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
  flagged?: boolean
  findings: Prediction[]
  heatmap_base64: string | null
  heatmaps?: Record<string, string>
  modality?: ModalityInfo
}

function App() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<PredictResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [selectedFinding, setSelectedFinding] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

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

      const res = await fetch(`${API_BASE}/predict`, {
        method: 'POST',
        body: form,
      })

      if (!res.ok) {
        throw new Error(
          `Server error (HTTP ${res.status}). The backend may still be starting. Wait 5 seconds and try again.`
        )
      }

      const raw = await res.text()
      if (!raw || raw.trim() === '') {
        throw new Error('Empty response from server. Please try again.')
      }
      if (raw.trim() === 'null') {
        throw new Error('Backend returned no data. Please try again.')
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

  const clear = () => {
    setFile(null)
    setPreview(null)
    setResult(null)
    setError(null)
    setShowHeatmap(false)
    setSelectedFinding(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  // Which heatmap to display
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
                Checking modality and running inference...
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

                <div className="flex gap-2 mb-3 text-[10px] font-mono">
                  <span className="px-2 py-1 bg-slate-900 text-white rounded">
                    DENSENET-121
                  </span>
                  <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded">
                    {result.elapsed_ms?.toFixed(0)} ms
                  </span>
                  <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded">
                    18 LABELS
                  </span>
                  {result.modality && (
                    <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded">
                      CXR {(result.modality.cxr_score * 100).toFixed(0)}%
                    </span>
                  )}
                </div>

                <div className="text-xs text-slate-500 mb-3 italic">
                  Click any finding to see its attention map on the radiograph.
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
                    return (
                      <div
                        key={f.label}
                        onClick={() => {
                          if (hasHeatmap) {
                            setSelectedFinding(f.label)
                            setShowHeatmap(true)
                          }
                        }}
                        className={`grid grid-cols-[1fr_auto_60px_80px] items-center gap-4 py-2 border-b border-slate-100 last:border-0 px-2 rounded transition-colors ${
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
                        <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${barColor}`}
                            style={{ width: `${f.score * 100}%` }}
                          />
                        </div>
                        <div className="text-xs font-mono text-slate-900 text-right">
                          {(f.score * 100).toFixed(1)}%
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
          <span>NAVANTIX PULMO v1.0 · RESEARCH PROTOTYPE · NOT FOR CLINICAL USE</span>
          <span>BUILT IN GHANA</span>
        </div>
      </main>
    </div>
  )
}

export default App