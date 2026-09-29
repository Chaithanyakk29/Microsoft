import { useEffect, useState } from 'react'
import { Brain, Search, Sparkles, RefreshCw, Layers, Zap, CheckCircle2, AlertCircle } from 'lucide-react'
import { api, MemoryStatus, MemoryOperation } from '../api/client'

export default function MemoryPage() {
  const [status, setStatus] = useState<MemoryStatus | null>(null)
  const [loading, setLoading] = useState(true)

  // Manual Recall State
  const [recallService, setRecallService] = useState('checkout-service')
  const [recallSymptoms, setRecallSymptoms] = useState('connection pool exhausted, high error rate, 504 gateway timeout')
  const [recallResult, setRecallResult] = useState<any>(null)
  const [recalling, setRecalling] = useState(false)

  // Manual Reflect State
  const [reflectQuery, setReflectQuery] = useState(
    'What are the most frequent root causes of checkout failures, and what remediations worked?'
  )
  const [reflectResult, setReflectResult] = useState<any>(null)
  const [reflecting, setReflecting] = useState(false)

  // A/B Experiment State
  const [abScenario, setAbScenario] = useState('db-connection-pool-exhaustion')
  const [abResult, setAbResult] = useState<any>(null)
  const [abRunning, setAbRunning] = useState(false)

  const loadStatus = async () => {
    try {
      const data = await api.getMemoryStatus()
      setStatus(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStatus()
  }, [])

  const handleRecall = async () => {
    setRecalling(true)
    try {
      const symptoms = recallSymptoms.split(',').map((s) => s.trim()).filter(Boolean)
      const res = await api.recallMemory(recallService, symptoms)
      setRecallResult(res)
      loadStatus()
    } catch (err: any) {
      setRecallResult({ error: err.message })
    } finally {
      setRecalling(false)
    }
  }

  const handleReflect = async () => {
    setReflecting(true)
    try {
      const res = await api.reflectMemory(reflectQuery)
      setReflectResult(res)
      loadStatus()
    } catch (err: any) {
      setReflectResult({ error: err.message })
    } finally {
      setReflecting(false)
    }
  }

  const handleRunAB = async () => {
    setAbRunning(true)
    try {
      const res = await api.runABExperiment(abScenario)
      setAbResult(res)
    } catch (err: any) {
      setAbResult({ error: err.message })
    } finally {
      setAbRunning(false)
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Brain size={20} className="text-purple-400" />
            Hindsight Operational Memory Console
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Real-time memory bank telemetry, knowledge graphs, pattern reflection & A/B benchmarks
          </p>
        </div>
        <button
          onClick={loadStatus}
          className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition-colors"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* Memory Bank Status Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-3.5 h-3.5 rounded-full ${
                status?.available ? 'bg-purple-400 animate-pulse' : 'bg-red-500'
              }`}
            />
            <div>
              <div className="text-sm font-bold text-white flex items-center gap-2">
                Bank: <span className="font-mono text-purple-300">{status?.bankId || 'recall-ops-incidents'}</span>
              </div>
              <div className="text-xs text-slate-500">
                Status: {status?.available ? 'OPERATIONAL (Live Hindsight SDK)' : 'DEGRADED / SIMULATION FALLBACK'}
              </div>
            </div>
          </div>
          <span
            className={`text-xs px-3 py-1 rounded font-bold ${
              status?.available
                ? 'bg-purple-900/40 text-purple-300 border border-purple-700/50'
                : 'bg-red-900/40 text-red-300 border border-red-700/50'
            }`}
          >
            {status?.status || 'UNKNOWN'}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-xs">
          <div className="bg-slate-950 p-3 rounded border border-slate-800">
            <div className="text-slate-500 mb-1">Total Operations</div>
            <div className="text-xl font-bold text-white font-mono">{status?.stats.totalOps || 0}</div>
          </div>
          <div className="bg-slate-950 p-3 rounded border border-slate-800">
            <div className="text-slate-500 mb-1">Retain Ops (Write)</div>
            <div className="text-xl font-bold text-purple-400 font-mono">{status?.stats.retainOps || 0}</div>
          </div>
          <div className="bg-slate-950 p-3 rounded border border-slate-800">
            <div className="text-slate-500 mb-1">Recall Ops (Search)</div>
            <div className="text-xl font-bold text-blue-400 font-mono">{status?.stats.recallOps || 0}</div>
          </div>
          <div className="bg-slate-950 p-3 rounded border border-slate-800">
            <div className="text-slate-500 mb-1">Reflect Ops (Synthesize)</div>
            <div className="text-xl font-bold text-cyan-400 font-mono">{status?.stats.reflectOps || 0}</div>
          </div>
          <div className="bg-slate-950 p-3 rounded border border-slate-800">
            <div className="text-slate-500 mb-1">Failed Ops</div>
            <div className="text-xl font-bold text-red-400 font-mono">{status?.stats.failedOps || 0}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Interactive Recall Query */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Search size={16} className="text-blue-400" />
            <h2 className="text-sm font-bold text-white">Manual Hindsight Recall (Point Query)</h2>
          </div>
          <p className="text-xs text-slate-400">
            Execute a semantic retrieval against the persistent incident memory bank.
          </p>

          <div className="space-y-3 text-xs">
            <div>
              <label className="text-slate-400 block mb-1">Target Service:</label>
              <input
                type="text"
                value={recallService}
                onChange={(e) => setRecallService(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-200"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Symptoms (comma separated):</label>
              <textarea
                rows={2}
                value={recallSymptoms}
                onChange={(e) => setRecallSymptoms(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-200"
              />
            </div>
            <button
              onClick={handleRecall}
              disabled={recalling}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded font-medium text-xs transition-colors"
            >
              {recalling ? 'Querying Bank...' : 'Execute Recall'}
            </button>
          </div>

          {recallResult && (
            <div className="mt-4 p-3 bg-slate-950 rounded border border-slate-800 text-xs font-mono max-h-52 overflow-y-auto">
              <div className="text-purple-400 font-bold mb-1">Results Payload:</div>
              <pre className="text-slate-300 whitespace-pre-wrap">{JSON.stringify(recallResult, null, 2)}</pre>
            </div>
          )}
        </div>

        {/* Interactive Reflect Synthesis */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-purple-400" />
            <h2 className="text-sm font-bold text-white">Reflect Synthesis (High-Order Reasoning)</h2>
          </div>
          <p className="text-xs text-slate-400">
            Request Hindsight's mental models to synthesize patterns across historical postmortems.
          </p>

          <div className="space-y-3 text-xs">
            <div>
              <label className="text-slate-400 block mb-1">Synthesis Question:</label>
              <textarea
                rows={3}
                value={reflectQuery}
                onChange={(e) => setReflectQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-200"
              />
            </div>
            <button
              onClick={handleReflect}
              disabled={reflecting}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded font-medium text-xs transition-colors"
            >
              {reflecting ? 'Reflecting on Knowledge...' : 'Synthesize Reflection'}
            </button>
          </div>

          {reflectResult && (
            <div className="mt-4 p-3 bg-slate-950 rounded border border-slate-800 text-xs max-h-52 overflow-y-auto">
              <div className="text-purple-400 font-bold mb-1 font-mono">Synthesized Mental Model:</div>
              <div className="text-slate-300 leading-relaxed whitespace-pre-wrap">
                {reflectResult.synthesis || JSON.stringify(reflectResult, null, 2)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* A/B Benchmark Experiment Runner */}
      <div className="bg-slate-900 border border-purple-800/40 rounded-lg p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Layers size={16} className="text-cyan-400" />
          <h2 className="text-sm font-bold text-white">Memory A/B Benchmark Comparison</h2>
        </div>
        <p className="text-xs text-slate-400">
          Run simultaneous parallel agent investigations on the same injected scenario: [Mode A: Stateless Baseline] vs [Mode B: Hindsight Memory Assisted].
        </p>

        <div className="flex items-center gap-4 text-xs">
          <select
            value={abScenario}
            onChange={(e) => setAbScenario(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded p-2 text-slate-200"
          >
            <option value="db-connection-pool-exhaustion">P1: PostgreSQL Connection Pool Exhaustion</option>
            <option value="deployment-regression">P2: Checkout Service Deployment Regression</option>
          </select>

          <button
            onClick={handleRunAB}
            disabled={abRunning}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded font-medium transition-colors"
          >
            {abRunning ? 'Dispatching Benchmark...' : 'Launch A/B Parallel Benchmark'}
          </button>
        </div>

        {abResult && (
          <div className="p-4 bg-slate-950 rounded border border-slate-800 text-xs">
            <div className="text-green-400 font-bold flex items-center gap-1.5 mb-2">
              <CheckCircle2 size={14} /> Benchmark Injected Successfully
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-slate-900 rounded border border-slate-800">
                <div className="font-bold text-slate-300 mb-1">Mode A (Stateless Baseline)</div>
                <div className="text-slate-500 font-mono">Incident ID: {abResult.modeA?.incidentId}</div>
                <div className="text-slate-400 mt-1">Investigating without historical memory context.</div>
              </div>
              <div className="p-3 bg-purple-950/40 rounded border border-purple-800/50">
                <div className="font-bold text-purple-300 mb-1">Mode B (Hindsight Memory Assisted)</div>
                <div className="text-purple-400 font-mono">Incident ID: {abResult.modeB?.incidentId}</div>
                <div className="text-slate-400 mt-1">Recalling previous failure patterns and remediations.</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Operations Log */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
        <h2 className="text-sm font-bold text-white mb-3">Recent Memory Operations Log</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-950 text-slate-500 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="p-2.5">Type</th>
                <th className="p-2.5">Bank</th>
                <th className="p-2.5">Query / Summary</th>
                <th className="p-2.5">Duration</th>
                <th className="p-2.5">Status</th>
                <th className="p-2.5">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {status?.recentOps?.length ? (
                status.recentOps.map((op) => (
                  <tr key={op.id} className="hover:bg-slate-800/50">
                    <td className="p-2.5 font-bold font-mono text-purple-300 uppercase">{op.type}</td>
                    <td className="p-2.5 font-mono text-slate-400">{op.bankId}</td>
                    <td className="p-2.5 text-slate-300 max-w-xs truncate">{op.query || op.content || '-'}</td>
                    <td className="p-2.5 font-mono text-slate-400">{op.duration} ms</td>
                    <td className="p-2.5">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          op.success ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'
                        }`}
                      >
                        {op.success ? 'SUCCESS' : 'FAILED'}
                      </span>
                    </td>
                    <td className="p-2.5 text-slate-500">{new Date(op.createdAt).toLocaleTimeString()}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-slate-600">
                    No operations recorded yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
