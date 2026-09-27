import { useEffect, useState } from 'react'

type HealthResponse = {
  status: string
  timestamp: string
  model: string
  model_loaded: boolean
}

const API_BASE = 'http://127.0.0.1:8000'

function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API_BASE}/health`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => {
        setHealth(data)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-8 py-5 flex items-center justify-between">
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
            <span className="text-xs text-emerald-700 font-medium">
              {loading ? 'Checking...' : error ? 'Offline' : 'Connected'}
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-8 py-12">
        <h1 className="text-3xl font-semibold text-slate-900 mb-2">
          System Status
        </h1>
        <p className="text-slate-500 mb-10">
          Foundation check — frontend and backend communication.
        </p>

        {loading && (
          <div className="bg-white border border-slate-200 rounded-lg p-8">
            <div className="text-slate-500 text-sm">Connecting to API...</div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <div className="text-red-900 font-semibold mb-1">Connection Failed</div>
            <div className="text-red-700 text-sm font-mono">{error}</div>
            <div className="text-red-700 text-sm mt-3">
              Make sure the backend is running on port 8000.
            </div>
          </div>
        )}

        {health && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <StatCard label="API Service" value={health.status} accent="emerald" />
            <StatCard label="Model" value={health.model} accent="blue" />
            <StatCard
              label="Model Loaded"
              value={health.model_loaded ? 'Yes' : 'Pending (Day 3)'}
              accent={health.model_loaded ? 'emerald' : 'amber'}
            />
            <StatCard
              label="Last Check"
              value={new Date(health.timestamp).toLocaleTimeString()}
              accent="slate"
            />
          </div>
        )}

        <div className="mt-12 text-xs text-slate-400 font-mono tracking-wider">
          RESEARCH PROTOTYPE · NOT FOR CLINICAL USE
        </div>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent: 'emerald' | 'blue' | 'amber' | 'slate'
}) {
  const accentColor: Record<string, string> = {
    emerald: 'bg-emerald-500',
    blue: 'bg-blue-500',
    amber: 'bg-amber-500',
    slate: 'bg-slate-400',
  }
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-6">
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-1.5 h-1.5 rounded-full ${accentColor[accent]}`}></span>
        <div className="text-[10px] font-semibold text-slate-500 tracking-[0.14em] uppercase">
          {label}
        </div>
      </div>
      <div className="text-lg font-medium text-slate-900 font-mono break-all">
        {value}
      </div>
    </div>
  )
}

export default App