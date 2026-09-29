import { useEffect, useState } from 'react'
import { Network, RefreshCw, AlertTriangle, ShieldCheck } from 'lucide-react'
import { api, Service } from '../api/client'

interface NodePos {
  x: number
  y: number
  service: Service
}

export default function TopologyPage() {
  const [services, setServices] = useState<Service[]>([])
  const [selectedService, setSelectedService] = useState<Service | null>(null)
  const [loading, setLoading] = useState(true)

  const loadData = async () => {
    try {
      const data = await api.getServices()
      setServices(data)
      if (!selectedService && data.length > 0) {
        setSelectedService(data[0])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 10000)
    return () => clearInterval(interval)
  }, [])

  // Explicit layout mapping for our 7 microservices
  const nodePositions: Record<string, { x: number; y: number }> = {
    'api-gateway': { x: 120, y: 220 },
    'auth-service': { x: 340, y: 100 },
    'checkout-service': { x: 340, y: 340 },
    'payment-service': { x: 560, y: 240 },
    'inventory-service': { x: 560, y: 440 },
    'notification-service': { x: 340, y: 480 },
    'postgresql': { x: 780, y: 220 },
  }

  const nodes: NodePos[] = services.map((svc) => ({
    service: svc,
    x: nodePositions[svc.id]?.x ?? 200,
    y: nodePositions[svc.id]?.y ?? 200,
  }))

  const nodeMap = new Map<string, NodePos>()
  nodes.forEach((n) => nodeMap.set(n.service.id, n))

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Network size={20} className="text-purple-400" />
            Service Dependency Topology
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">Live service dependency graph & cascade blast radius visualization</p>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition-colors"
        >
          <RefreshCw size={12} /> Refresh Graph
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* SVG Graph Canvas */}
        <div className="lg:col-span-3 bg-slate-950 border border-slate-800 rounded-lg p-4 relative overflow-hidden flex items-center justify-center min-h-[560px]">
          {loading ? (
            <div className="text-slate-500 text-sm">Building topology mesh...</div>
          ) : (
            <svg className="w-full h-full min-h-[520px]" viewBox="0 0 920 560">
              <defs>
                <marker
                  id="arrow-healthy"
                  viewBox="0 0 10 10"
                  refX="22"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#3b82f6" />
                </marker>
                <marker
                  id="arrow-unhealthy"
                  viewBox="0 0 10 10"
                  refX="22"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#ef4444" />
                </marker>
              </defs>

              {/* Dependency Edges */}
              {nodes.map((sourceNode) =>
                sourceNode.service.dependencies?.map((depId) => {
                  const targetNode = nodeMap.get(depId)
                  if (!targetNode) return null

                  const isDegraded = !sourceNode.service.isHealthy || !targetNode.service.isHealthy
                  const isSelected =
                    selectedService?.id === sourceNode.service.id ||
                    selectedService?.id === targetNode.service.id

                  return (
                    <g key={`${sourceNode.service.id}-${depId}`}>
                      <line
                        x1={sourceNode.x}
                        y1={sourceNode.y}
                        x2={targetNode.x}
                        y2={targetNode.y}
                        stroke={isDegraded ? '#ef4444' : isSelected ? '#a855f7' : '#334155'}
                        strokeWidth={isSelected ? 2.5 : 1.5}
                        strokeDasharray={isDegraded ? '4 4' : undefined}
                        markerEnd={`url(#arrow-${isDegraded ? 'unhealthy' : 'healthy'})`}
                      />
                    </g>
                  )
                })
              )}

              {/* Service Nodes */}
              {nodes.map((node) => {
                const isSelected = selectedService?.id === node.service.id
                const isUnhealthy = !node.service.isHealthy
                const isDegraded = node.service.status === 'degraded'

                return (
                  <g
                    key={node.service.id}
                    transform={`translate(${node.x}, ${node.y})`}
                    onClick={() => setSelectedService(node.service)}
                    className="cursor-pointer group"
                  >
                    {/* Node circle */}
                    <circle
                      r={26}
                      className={`transition-all duration-200 ${
                        isSelected
                          ? 'stroke-purple-400 stroke-[3px]'
                          : isUnhealthy
                          ? 'stroke-red-500 stroke-2'
                          : isDegraded
                          ? 'stroke-yellow-500 stroke-2'
                          : 'stroke-slate-700 stroke-1'
                      }`}
                      fill={isUnhealthy ? '#450a0a' : isDegraded ? '#422006' : '#0f172a'}
                    />

                    {/* Status Dot */}
                    <circle
                      r={5}
                      cx={16}
                      cy={-16}
                      fill={isUnhealthy ? '#ef4444' : isDegraded ? '#eab308' : '#22c55e'}
                      className={isUnhealthy ? 'animate-pulse' : ''}
                    />

                    {/* Label */}
                    <text
                      textAnchor="middle"
                      dy={42}
                      className="fill-slate-200 font-medium text-[11px] select-none"
                    >
                      {node.service.name}
                    </text>
                    <text
                      textAnchor="middle"
                      dy={54}
                      className={`text-[9px] select-none font-mono ${
                        isUnhealthy ? 'fill-red-400 font-bold' : 'fill-slate-500'
                      }`}
                    >
                      {node.service.errorRate.toFixed(1)}% err
                    </text>
                  </g>
                )
              })}
            </svg>
          )}
        </div>

        {/* Selected Service Detail Panel */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <ShieldCheck size={16} className="text-blue-400" />
            <h2 className="text-sm font-bold text-white">Service Inspector</h2>
          </div>

          {selectedService ? (
            <div className="space-y-4 text-xs">
              <div>
                <div className="text-base font-bold text-white">{selectedService.name}</div>
                <div className="text-slate-500 font-mono mt-0.5">{selectedService.id}</div>
              </div>

              <div className="space-y-1.5 bg-slate-950 p-3 rounded border border-slate-800">
                <div className="flex justify-between">
                  <span className="text-slate-500">Status:</span>
                  <span
                    className={`font-bold uppercase ${
                      selectedService.isHealthy ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    {selectedService.status}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Criticality:</span>
                  <span className="text-slate-300">{selectedService.criticality}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">CPU:</span>
                  <span className="text-slate-300 font-mono">{selectedService.cpu.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Error Rate:</span>
                  <span
                    className={`font-mono font-bold ${
                      selectedService.errorRate > 1 ? 'text-red-400' : 'text-slate-300'
                    }`}
                  >
                    {selectedService.errorRate.toFixed(2)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">P99 Latency:</span>
                  <span className="text-slate-300 font-mono">{selectedService.latencyP99.toFixed(0)} ms</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Active Conns:</span>
                  <span className="text-slate-300 font-mono">
                    {selectedService.activeConnections} / {selectedService.maxConnections}
                  </span>
                </div>
              </div>

              <div>
                <div className="text-slate-400 font-semibold mb-1.5">Direct Downstream Dependencies</div>
                {selectedService.dependencies?.length ? (
                  <div className="space-y-1">
                    {selectedService.dependencies.map((dep) => (
                      <div
                        key={dep}
                        className="p-1.5 bg-slate-800 rounded text-slate-300 font-mono flex items-center gap-1.5"
                      >
                        <span className="text-purple-400">↳</span> {dep}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-slate-600 italic">No downstream dependencies</div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-slate-500 text-xs text-center py-8">Select a node in the graph</div>
          )}
        </div>
      </div>
    </div>
  )
}
