import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Terminal, RotateCcw, Zap, Server, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react'
import { api, Service, SimulatorScenario } from '../api/client'

function ServiceHealthCard({ service }: { service: Service }) {
  const isHealthy = service.isHealthy
  const statusColor = service.status === 'healthy' ? 'border-green-700/40 bg-green-900/5' :
    service.status === 'degraded' ? 'border-yellow-700/40 bg-yellow-900/5' :
    'border-red-700/40 bg-red-900/10'

  return (
    <div className={`border rounded-lg p-3 ${statusColor}`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
          isHealthy ? 'bg-green-400' : service.status === 'degraded' ? 'bg-yellow-400 animate-pulse' : 'bg-red-400 animate-pulse'
        }`} />
        <span className="text-xs font-medium text-slate-200 truncate">{service.name}</span>
        <span className={`ml-auto text-xs px-1.5 rounded flex-shrink-0 ${
          service.criticality === 'CRITICAL' ? 'bg-red-900/40 text-red-400' :
          service.criticality === 'HIGH' ? 'bg-orange-900/40 text-orange-400' :
          'bg-slate-700 text-slate-400'
        }`}>{service.criticality}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <div className="text-slate-600">CPU</div>
          <div className={`font-mono ${service.cpu > 80 ? 'text-red-400' : service.cpu > 60 ? 'text-yellow-400' : 'text-slate-300'}`}>
            {service.cpu.toFixed(0)}%
          </div>
        </div>
        <div>
          <div className="text-slate-600">Error</div>
          <div className={`font-mono ${service.errorRate > 5 ? 'text-red-400' : service.errorRate > 1 ? 'text-yellow-400' : 'text-green-400'}`}>
            {service.errorRate.toFixed(1)}%
          </div>
        </div>
        <div>
          <div className="text-slate-600">P99</div>
          <div className={`font-mono ${service.latencyP99 > 2000 ? 'text-red-400' : service.latencyP99 > 1000 ? 'text-yellow-400' : 'text-slate-300'}`}>
            {service.latencyP99.toFixed(0)}ms
          </div>
        </div>
      </div>
      {service.activeConnections > 0 && (
        <div className="mt-2 text-xs">
          <div className="text-slate-600">Connections</div>
          <div className="flex items-center gap-1">
            <div className="flex-1 bg-slate-700 rounded-full h-1">
              <div
                className={`h-1 rounded-full ${
                  service.activeConnections / service.maxConnections > 0.9 ? 'bg-red-500' :
                  service.activeConnections / service.maxConnections > 0.7 ? 'bg-yellow-500' : 'bg-green-500'
                }`}
                style={{ width: `${Math.min(100, (service.activeConnections / service.maxConnections) * 100).toFixed(0)}%` }}
              />
            </div>
            <span className="text-slate-400 font-mono">{service.activeConnections}/{service.maxConnections}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function ScenarioCard({
  scenario,
  onInject,
}: {
  scenario: SimulatorScenario
  onInject: (id: string, autoInvestigate: boolean, memoryEnabled: boolean) => Promise<void>
}) {
  const [injecting, setInjecting] = useState(false)
  const [autoInvestigate, setAutoInvestigate] = useState(true)
  const [memoryEnabled, setMemoryEnabled] = useState(true)

  const severityColors: Record<string, string> = {
    P1: 'border-red-600/50 bg-red-900/10',
    P2: 'border-orange-600/50 bg-orange-900/10',
    P3: 'border-yellow-600/50 bg-yellow-900/10',
  }

  return (
    <div className={`border rounded-lg p-5 space-y-4 ${severityColors[scenario.severity] || 'border-slate-700 bg-slate-900'}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-bold px-2 py-0.5 rounded border ${
              scenario.severity === 'P1' ? 'bg-red-500/20 text-red-400 border-red-500/40' :
              scenario.severity === 'P2' ? 'bg-orange-500/20 text-orange-400 border-orange-500/40' :
              'bg-yellow-500/20 text-yellow-400 border-yellow-500/40'
            }`}>{scenario.severity}</span>
            <span className="text-sm font-semibold text-slate-100">{scenario.name}</span>
          </div>
          <p className="text-xs text-slate-400">{scenario.description}</p>
        </div>
      </div>

      <div className="space-y-2 text-xs">
        <div>
          <div className="text-slate-600 mb-1">Affected Services</div>
          <div className="flex flex-wrap gap-1">
            {scenario.affectedServices.map((s) => (
              <span key={s} className="bg-slate-800 border border-slate-700 px-2 py-0.5 rounded text-slate-300">{s}</span>
            ))}
          </div>
        </div>
        <div>
          <div className="text-slate-600 mb-1">Symptoms</div>
          <div className="space-y-0.5">
            {scenario.symptoms.slice(0, 3).map((s, i) => (
              <div key={i} className="text-slate-400">• {s}</div>
            ))}
          </div>
        </div>
        <div>
          <div className="text-slate-600 mb-1">Expected Root Cause</div>
          <div className="text-slate-400">{scenario.expectedRootCause}</div>
        </div>
      </div>

      <div className="border-t border-slate-700 pt-3 space-y-3">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
            <input type="checkbox" checked={autoInvestigate} onChange={(e) => setAutoInvestigate(e.target.checked)} className="rounded" />
            Auto-investigate
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
            <input type="checkbox" checked={memoryEnabled} onChange={(e) => setMemoryEnabled(e.target.checked)} className="rounded" />
            <span className="text-purple-400">🧠</span> Enable Memory
          </label>
        </div>
        <button
          onClick={async () => {
            setInjecting(true)
            try {
              await onInject(scenario.id, autoInvestigate, memoryEnabled)
            } finally {
              setInjecting(false)
            }
          }}
          disabled={injecting}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 rounded text-sm font-bold transition-colors disabled:opacity-50"
        >
          {injecting ? (
            <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Injecting...</>
          ) : (
            <><Zap size={14} /> INJECT SCENARIO</>
          )}
        </button>
      </div>
    </div>
  )
}

export default function SimulatorPage() {
  const [services, setServices] = useState<Service[]>([])
  const [scenarios, setScenarios] = useState<SimulatorScenario[]>([])
  const [loading, setLoading] = useState(true)
  const [resetting, setResetting] = useState(false)
  const [lastAction, setLastAction] = useState<string | null>(null)
  const navigate = useNavigate()

  const loadData = async () => {
    try {
      const [svcs, scens] = await Promise.all([api.getServices(), api.getSimulatorScenarios()])
      setServices(svcs)
      setScenarios(scens)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 5000)
    return () => clearInterval(interval)
  }, [])

  const resetSimulator = async () => {
    setResetting(true)
    try {
      await api.resetSimulator()
      setLastAction('Environment reset to healthy state')
      await loadData()
    } catch (e) {
      setLastAction(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`)
    } finally {
      setResetting(false)
    }
  }

  const injectScenario = async (scenarioId: string, autoInvestigate: boolean, memoryEnabled: boolean) => {
    try {
      const result = await api.injectScenario(scenarioId, autoInvestigate, memoryEnabled)
      setLastAction(`Scenario injected. Incident created: ${result.incident.id.substring(0, 8)}`)
      if (result.incident.id) {
        setTimeout(() => navigate(`/incidents/${result.incident.id}`), 500)
      }
    } catch (e) {
      setLastAction(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`)
    }
  }

  const unhealthyCount = services.filter((s) => !s.isHealthy).length

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Terminal size={20} className="text-green-400" />
            Incident Simulator
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">Inject golden demo scenarios into the production simulator</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={loadData} className="p-2 text-slate-500 hover:text-slate-300">
            <RefreshCw size={14} />
          </button>
          <button
            onClick={resetSimulator}
            disabled={resetting}
            className="flex items-center gap-2 px-4 py-2 border border-red-700 text-red-400 hover:bg-red-900/20 rounded text-sm font-medium transition-colors disabled:opacity-50"
          >
            <RotateCcw size={14} />
            {resetting ? 'Resetting...' : 'RESET ENVIRONMENT'}
          </button>
        </div>
      </div>

      {lastAction && (
        <div className={`flex items-center gap-2 px-4 py-2 rounded text-sm ${
          lastAction.startsWith('Error') ? 'bg-red-900/20 border border-red-700 text-red-400' : 'bg-green-900/20 border border-green-700 text-green-400'
        }`}>
          {lastAction.startsWith('Error') ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
          {lastAction}
        </div>
      )}

      {/* System Overview */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Server size={14} className="text-blue-400" />
          <span className="text-sm font-medium text-slate-300">Production System State</span>
          <span className={`text-xs px-2 py-0.5 rounded ${unhealthyCount > 0 ? 'bg-red-900/40 text-red-400' : 'bg-green-900/40 text-green-400'}`}>
            {unhealthyCount > 0 ? `${unhealthyCount} DEGRADED` : 'ALL HEALTHY'}
          </span>
        </div>
        {loading ? (
          <div className="grid grid-cols-4 gap-3">
            {Array(7).fill(null).map((_, i) => (
              <div key={i} className="bg-slate-800 rounded-lg h-24 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-3">
            {services.map((svc) => <ServiceHealthCard key={svc.id} service={svc} />)}
          </div>
        )}
      </div>

      {/* Scenarios */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Zap size={14} className="text-yellow-400" />
          <span className="text-sm font-medium text-slate-300">Golden Demo Scenarios</span>
          <span className="text-xs text-slate-600">Click INJECT SCENARIO to create a live incident</span>
        </div>
        <div className="grid grid-cols-2 gap-5">
          {scenarios.map((scenario) => (
            <ScenarioCard key={scenario.id} scenario={scenario} onInject={injectScenario} />
          ))}
        </div>
      </div>
    </div>
  )
}
