import { useEffect, useState } from 'react'
import { Server, Activity, RefreshCw, Cpu, Database, Network } from 'lucide-react'
import { api, Service } from '../api/client'

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadServices = async () => {
    try {
      const data = await api.getServices()
      setServices(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load services')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadServices()
    const interval = setInterval(loadServices, 10000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-slate-400 flex items-center gap-3">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          Loading services telemetry...
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Server size={20} className="text-blue-400" />
            Monitored Services
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">Real-time health, metrics & deployment status</p>
        </div>
        <button
          onClick={loadServices}
          className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition-colors"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-700 rounded p-3 text-red-400 text-sm">{error}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {services.map((svc) => (
          <div
            key={svc.id}
            className={`bg-slate-900 border rounded-lg p-5 space-y-4 ${
              !svc.isHealthy
                ? 'border-red-600/50 bg-red-950/10'
                : svc.status === 'degraded'
                ? 'border-yellow-600/50 bg-yellow-950/10'
                : 'border-slate-800'
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2.5 h-2.5 rounded-full ${
                      svc.isHealthy
                        ? 'bg-green-400'
                        : svc.status === 'degraded'
                        ? 'bg-yellow-400 animate-pulse'
                        : 'bg-red-400 animate-pulse'
                    }`}
                  />
                  <span className="text-base font-semibold text-white">{svc.name}</span>
                </div>
                <div className="text-xs text-slate-500 font-mono mt-0.5">{svc.id}</div>
              </div>
              <span
                className={`text-xs px-2 py-0.5 rounded font-bold ${
                  svc.criticality === 'CRITICAL'
                    ? 'bg-red-900/40 text-red-400 border border-red-800/50'
                    : svc.criticality === 'HIGH'
                    ? 'bg-orange-900/40 text-orange-400 border border-orange-800/50'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {svc.criticality}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-950/60 p-2.5 rounded border border-slate-800/50">
                <div className="text-slate-500 flex items-center gap-1.5 mb-1">
                  <Cpu size={12} /> CPU Utilization
                </div>
                <div
                  className={`text-base font-bold font-mono ${
                    svc.cpu > 80 ? 'text-red-400' : svc.cpu > 60 ? 'text-yellow-400' : 'text-slate-200'
                  }`}
                >
                  {svc.cpu.toFixed(1)}%
                </div>
              </div>

              <div className="bg-slate-950/60 p-2.5 rounded border border-slate-800/50">
                <div className="text-slate-500 flex items-center gap-1.5 mb-1">
                  <Activity size={12} /> Error Rate
                </div>
                <div
                  className={`text-base font-bold font-mono ${
                    svc.errorRate > 5 ? 'text-red-400' : svc.errorRate > 1 ? 'text-yellow-400' : 'text-green-400'
                  }`}
                >
                  {svc.errorRate.toFixed(2)}%
                </div>
              </div>

              <div className="bg-slate-950/60 p-2.5 rounded border border-slate-800/50">
                <div className="text-slate-500 mb-1">P99 Latency</div>
                <div
                  className={`text-base font-bold font-mono ${
                    svc.latencyP99 > 2000 ? 'text-red-400' : svc.latencyP99 > 1000 ? 'text-yellow-400' : 'text-slate-200'
                  }`}
                >
                  {svc.latencyP99.toFixed(0)} ms
                </div>
              </div>

              <div className="bg-slate-950/60 p-2.5 rounded border border-slate-800/50">
                <div className="text-slate-500 mb-1">Active / Max Conns</div>
                <div
                  className={`text-base font-bold font-mono ${
                    svc.activeConnections / (svc.maxConnections || 1) > 0.85
                      ? 'text-red-400'
                      : 'text-slate-200'
                  }`}
                >
                  {svc.activeConnections} / {svc.maxConnections}
                </div>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-800 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Version:</span>
                <span className="font-mono text-slate-200">v{svc.deploymentVersion}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Dependencies:</span>
                <span className="text-slate-300">
                  {svc.dependencies?.length ? svc.dependencies.join(', ') : 'None'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
