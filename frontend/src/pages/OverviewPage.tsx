import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Server, Brain, Activity, TrendingUp, ExternalLink, Zap } from 'lucide-react'
import { api, DashboardData, parseJSON, timeAgo } from '../api/client'

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    P1: 'bg-red-500/20 text-red-400 border-red-500/40',
    P2: 'bg-orange-500/20 text-orange-400 border-orange-500/40',
    P3: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
    P4: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-bold ${colors[severity] || colors['P4']}`}>
      {severity}
    </span>
  )
}

function StatusDot({ healthy }: { healthy: boolean }) {
  return <div className={`w-2 h-2 rounded-full ${healthy ? 'bg-green-400' : 'bg-red-400 animate-pulse'}`} />
}

export default function OverviewPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const d = await api.getDashboard()
        setData(d)
        setError(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load dashboard')
      } finally {
        setLoading(false)
      }
    }
    load()
    const interval = setInterval(load, 15000)
    return () => clearInterval(interval)
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="text-slate-400 flex items-center gap-3">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        Loading dashboard...
      </div>
    </div>
  )

  if (error) return (
    <div className="p-8 flex items-center justify-center h-full">
      <div className="bg-red-900/20 border border-red-700 rounded-lg p-6 text-center max-w-md">
        <AlertTriangle className="mx-auto mb-3 text-red-400" size={32} />
        <div className="text-red-400 font-semibold mb-2">Failed to load dashboard</div>
        <div className="text-slate-400 text-sm">{error}</div>
        <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-red-600 rounded text-sm hover:bg-red-700 transition-colors">
          Retry
        </button>
      </div>
    </div>
  )

  if (!data) return null

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
              <Zap size={16} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">RECALL OPS</h1>
          </div>
          <p className="text-slate-400 text-sm">Adaptive Incident Response Agent with Operational Memory</p>
        </div>
        <div className="flex items-center gap-3">
          {!data.hindsightAvailable && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-red-900/30 border border-red-700/50 rounded text-xs text-red-400">
              <Brain size={12} />
              MEMORY DEGRADED
            </div>
          )}
          {data.hindsightAvailable && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-900/30 border border-purple-700/50 rounded text-xs text-purple-400">
              <Brain size={12} />
              Memory LIVE
            </div>
          )}
          <Link to="/simulator" className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium transition-colors">
            <Activity size={14} />
            Inject Scenario
          </Link>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
          <div className="text-xs text-slate-500 mb-1">Active Incidents</div>
          <div className={`text-3xl font-bold ${data.activeIncidents.length > 0 ? 'text-red-400' : 'text-green-400'}`}>
            {data.activeIncidents.length}
          </div>
          <div className="text-xs text-slate-500 mt-1">Resolved today: {data.resolvedToday}</div>
        </div>
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
          <div className="text-xs text-slate-500 mb-1">Unhealthy Services</div>
          <div className={`text-3xl font-bold ${data.unhealthyCount > 0 ? 'text-red-400' : 'text-green-400'}`}>
            {data.unhealthyCount}
          </div>
          <div className="text-xs text-slate-500 mt-1">of {data.services.length} monitored</div>
        </div>
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
          <div className="text-xs text-slate-500 mb-1">Memory Operations</div>
          <div className="text-3xl font-bold text-purple-400">{data.totalMemoryOps}</div>
          <div className="text-xs text-slate-500 mt-1">Hindsight retain/recall/reflect</div>
        </div>
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
          <div className="text-xs text-slate-500 mb-1">Hindsight Memory</div>
          <div className={`text-2xl font-bold ${data.hindsightAvailable ? 'text-purple-400' : 'text-red-400'}`}>
            {data.hindsightAvailable ? 'LIVE' : 'DEGRADED'}
          </div>
          <div className="text-xs text-slate-500 mt-1">recall-ops-incidents bank</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Active Incidents */}
        <div className="col-span-2 bg-slate-900 border border-slate-700 rounded-lg">
          <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className="text-red-400" />
              <span className="text-sm font-medium">Active Incidents</span>
            </div>
            <Link to="/incidents" className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
              View all <ExternalLink size={10} />
            </Link>
          </div>
          <div className="divide-y divide-slate-800">
            {data.activeIncidents.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                <div className="w-12 h-12 bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Activity size={20} className="text-green-400" />
                </div>
                <div className="text-sm">All systems operational</div>
                <div className="text-xs mt-1">No active incidents</div>
              </div>
            ) : data.activeIncidents.map((inc) => (
              <Link key={inc.id} to={`/incidents/${inc.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800 transition-colors">
                <SeverityBadge severity={inc.severity} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-100 truncate">{inc.title}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {parseJSON<string[]>(inc.affectedServices, []).join(', ')} · {timeAgo(inc.detectedAt)}
                  </div>
                </div>
                <div className="text-xs text-slate-500 flex-shrink-0">{inc.status}</div>
              </Link>
            ))}
          </div>
        </div>

        {/* Service Health */}
        <div className="bg-slate-900 border border-slate-700 rounded-lg">
          <div className="px-4 py-3 border-b border-slate-700 flex items-center gap-2">
            <Server size={14} className="text-blue-400" />
            <span className="text-sm font-medium">Service Health</span>
          </div>
          <div className="divide-y divide-slate-800">
            {data.services.map((svc) => (
              <div key={svc.id} className="flex items-center gap-3 px-4 py-2.5">
                <StatusDot healthy={svc.isHealthy} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-slate-200 truncate">{svc.name}</div>
                  <div className={`text-xs ${svc.errorRate > 5 ? 'text-red-400' : svc.errorRate > 1 ? 'text-yellow-400' : 'text-slate-500'}`}>
                    {svc.errorRate.toFixed(1)}% err · {svc.cpu.toFixed(0)}% cpu
                  </div>
                </div>
                <div className={`text-xs px-2 py-0.5 rounded ${
                  svc.status === 'healthy' ? 'bg-green-900/30 text-green-400' :
                  svc.status === 'degraded' ? 'bg-yellow-900/30 text-yellow-400' :
                  'bg-red-900/30 text-red-400'
                }`}>{svc.status}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* How Hindsight Memory Works */}
      <div className="bg-purple-900/10 border border-purple-700/30 rounded-lg p-5">
        <div className="flex items-center gap-2 mb-4">
          <Brain size={16} className="text-purple-400" />
          <span className="text-sm font-semibold text-purple-300">How Hindsight Memory Changes Incident Response</span>
        </div>
        <div className="grid grid-cols-4 gap-4 text-xs">
          {[
            { step: '1. RETAIN', desc: 'After each incident resolves, experience is retained to Hindsight memory bank', color: 'text-purple-400' },
            { step: '2. RECALL', desc: 'When a new incident starts, agent recalls similar historical incidents from memory', color: 'text-blue-400' },
            { step: '3. REFLECT', desc: 'Agent reflects on patterns to synthesize operational knowledge and failure modes', color: 'text-cyan-400' },
            { step: '4. IMPROVE', desc: 'Future incidents benefit from historical experience - faster diagnosis, proven remediations', color: 'text-green-400' },
          ].map(({ step, desc, color }) => (
            <div key={step} className="space-y-1">
              <div className={`font-bold ${color}`}>{step}</div>
              <div className="text-slate-400">{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
