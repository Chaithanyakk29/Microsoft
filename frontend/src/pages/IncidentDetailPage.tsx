import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  AlertTriangle, Brain, Play, Check, X, Clock, Activity, Server,
  ChevronRight, Terminal, Cpu, MemoryStick, Wifi, ArrowLeft, RefreshCw
} from 'lucide-react'
import { api, Incident, Hypothesis, ActionRequest, IncidentEvent, connectToIncidentStream, parseJSON, timeAgo, formatDuration } from '../api/client'

// ─── Sub-components ────────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    P1: 'bg-red-500/20 text-red-400 border-red-500/40',
    P2: 'bg-orange-500/20 text-orange-400 border-orange-500/40',
    P3: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
    P4: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded border text-xs font-bold ${colors[severity] || colors['P4']}`}>
      {severity}
    </span>
  )
}

function StatusChip({ status }: { status: string }) {
  const colors: Record<string, string> = {
    DETECTED: 'bg-slate-700 text-slate-300',
    TRIAGING: 'bg-blue-900/50 text-blue-400 border border-blue-700/50',
    CONTEXT_GATHERING: 'bg-blue-900/50 text-blue-400 border border-blue-700/50',
    MEMORY_LOOKUP: 'bg-purple-900/50 text-purple-400 border border-purple-700/50',
    HYPOTHESIS_FORMATION: 'bg-indigo-900/50 text-indigo-400 border border-indigo-700/50',
    HYPOTHESIS_VALIDATION: 'bg-indigo-900/50 text-indigo-400 border border-indigo-700/50',
    ACTION_PLANNING: 'bg-orange-900/50 text-orange-400 border border-orange-700/50',
    SAFETY_REVIEW: 'bg-orange-900/50 text-orange-400 border border-orange-700/50',
    AWAITING_APPROVAL: 'bg-yellow-900/50 text-yellow-400 border border-yellow-700/50',
    EXECUTING: 'bg-orange-900/50 text-orange-400 border border-orange-700/50',
    VERIFYING: 'bg-cyan-900/50 text-cyan-400 border border-cyan-700/50',
    RESOLVED: 'bg-green-900/50 text-green-400 border border-green-700/50',
    POSTMORTEM: 'bg-teal-900/50 text-teal-400 border border-teal-700/50',
    LEARNING_RETAINED: 'bg-purple-900/50 text-purple-400 border border-purple-700/50',
    FAILED: 'bg-red-900/50 text-red-400 border border-red-700/50',
  }
  const isActive = ['TRIAGING', 'CONTEXT_GATHERING', 'MEMORY_LOOKUP', 'HYPOTHESIS_FORMATION', 'HYPOTHESIS_VALIDATION',
    'ACTION_PLANNING', 'SAFETY_REVIEW', 'AWAITING_APPROVAL', 'EXECUTING', 'VERIFYING'].includes(status)
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium ${colors[status] || 'bg-slate-700 text-slate-300'}`}>
      {isActive && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
      {status.replace(/_/g, ' ')}
    </div>
  )
}

interface StreamEvent {
  type: string
  data: unknown
  timestamp: Date
}

const EVENT_COLORS: Record<string, string> = {
  connected: 'text-green-400',
  state_change: 'text-cyan-400',
  agent_started: 'text-blue-400',
  agent_thinking: 'text-slate-400',
  agent_reasoning: 'text-slate-300',
  tool_call: 'text-blue-400',
  tool_result: 'text-green-400',
  memory_retrieved: 'text-purple-400',
  agent_completed: 'text-green-400',
  agent_error: 'text-red-400',
}

const EVENT_ICONS: Record<string, string> = {
  connected: '●',
  state_change: '→',
  agent_thinking: '...',
  agent_reasoning: '💭',
  tool_call: '⚡',
  tool_result: '✓',
  memory_retrieved: '🧠',
  agent_completed: '✅',
  agent_error: '❌',
}

function AgentStream({ events, isActive }: { events: StreamEvent[], isActive: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [events])

  return (
    <div className="bg-slate-950 border border-slate-700 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700 bg-slate-900">
        <Terminal size={12} className="text-green-400" />
        <span className="text-xs font-medium text-slate-400">Agent Stream</span>
        {isActive && (
          <span className="flex items-center gap-1 ml-auto text-xs text-green-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            LIVE
          </span>
        )}
      </div>
      <div ref={containerRef} className="p-3 font-mono text-xs space-y-1 max-h-64 overflow-y-auto">
        {events.length === 0 ? (
          <div className="text-slate-600 text-center py-4">Waiting for agent...</div>
        ) : events.map((ev, i) => (
          <div key={i} className="flex gap-2">
            <span className="text-slate-700 flex-shrink-0">
              {ev.timestamp.toTimeString().substring(0, 8)}
            </span>
            <span className={EVENT_COLORS[ev.type] || 'text-slate-400'}>
              {EVENT_ICONS[ev.type] || '·'}
            </span>
            <span className="text-slate-300 flex-1 break-all">
              {formatStreamEvent(ev.type, ev.data)}
            </span>
          </div>
        ))}
        {isActive && (
          <div className="flex items-center gap-2 text-slate-600">
            <span className="animate-pulse">_</span>
          </div>
        )}
      </div>
    </div>
  )
}

function formatStreamEvent(type: string, data: unknown): string {
  if (!data) return type
  const d = data as Record<string, unknown>
  switch (type) {
    case 'connected': return `Connected to incident stream`
    case 'state_change': return `State: ${d['from']} → ${d['to']}`
    case 'agent_started': return `Agent started (memory: ${d['memoryEnabled']})`
    case 'agent_thinking': return `Thinking... (iteration ${d['iteration']})`
    case 'agent_reasoning': return String(d['content']).substring(0, 200)
    case 'tool_call': return `[TOOL] ${d['tool']}(${JSON.stringify(d['input']).substring(0, 100)})`
    case 'tool_result': return `[RESULT] ${d['tool']}: ${d['success'] ? '✓' : '✗'} (${d['duration']}ms)`
    case 'memory_retrieved': return `[MEMORY] ${d['memoriesFound']} memories found (available: ${d['available']})`
    case 'agent_completed': return `Investigation complete. Status: ${d['finalStatus']} (${d['iterations']} iterations, ${d['memoriesUsed']} memories used)`
    case 'agent_error': return `ERROR: ${d['error']}`
    default: return JSON.stringify(data).substring(0, 200)
  }
}

function HypothesisCard({ hypothesis }: { hypothesis: Hypothesis }) {
  const evidence = parseJSON<string[]>(hypothesis.supportingEvidence, [])
  const contradicting = parseJSON<string[]>(hypothesis.contradictingEvidence, [])
  const confidencePct = Math.round(hypothesis.confidence * 100)
  const statusColors: Record<string, string> = {
    PROPOSED: 'text-blue-400 border-blue-700',
    TESTING: 'text-yellow-400 border-yellow-700',
    SUPPORTED: 'text-green-400 border-green-700',
    REJECTED: 'text-red-400 border-red-700',
    INCONCLUSIVE: 'text-slate-400 border-slate-600',
  }

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-slate-100">{hypothesis.name}</div>
          <div className="text-xs text-slate-400 mt-1">{hypothesis.description}</div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-xs px-2 py-0.5 rounded border ${statusColors[hypothesis.status] || statusColors['PROPOSED']}`}>
            {hypothesis.status}
          </span>
          <span className={`text-sm font-bold ${confidencePct >= 70 ? 'text-green-400' : confidencePct >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
            {confidencePct}%
          </span>
        </div>
      </div>
      {/* Confidence bar */}
      <div className="w-full bg-slate-700 rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full transition-all ${confidencePct >= 70 ? 'bg-green-500' : confidencePct >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`}
          style={{ width: `${confidencePct}%` }}
        />
      </div>
      {evidence.length > 0 && (
        <div>
          <div className="text-xs text-blue-400 mb-1.5 font-medium">[CURRENT] Supporting Evidence</div>
          {evidence.map((e, i) => (
            <div key={i} className="text-xs text-slate-400 flex gap-2 border-l-2 border-blue-700 pl-2 mb-1">
              <span>•</span><span>{e}</span>
            </div>
          ))}
        </div>
      )}
      {contradicting.length > 0 && (
        <div>
          <div className="text-xs text-red-400 mb-1.5 font-medium">Contradicting Evidence</div>
          {contradicting.map((e, i) => (
            <div key={i} className="text-xs text-slate-500 flex gap-2 border-l-2 border-red-800 pl-2 mb-1">
              <span>•</span><span>{e}</span>
            </div>
          ))}
        </div>
      )}
      {hypothesis.nextDiagnostic && (
        <div className="text-xs text-slate-500 italic">Next: {hypothesis.nextDiagnostic}</div>
      )}
    </div>
  )
}

function ActionCard({
  action,
  incidentId,
  onApprove,
}: {
  action: ActionRequest
  incidentId: string
  onApprove: () => void
}) {
  const [approving, setApproving] = useState(false)
  const [reason, setReason] = useState('')
  const [showReason, setShowReason] = useState(false)

  const params = parseJSON<Record<string, unknown>>(action.parameters, {})

  const riskColors: Record<string, string> = {
    LOW: 'text-green-400 border-green-700',
    MEDIUM: 'text-yellow-400 border-yellow-700',
    HIGH: 'text-orange-400 border-orange-700',
    DANGEROUS: 'text-red-400 border-red-700',
  }

  const approve = async (decision: 'APPROVED' | 'REJECTED') => {
    setApproving(true)
    try {
      await api.approveAction(incidentId, action.id, decision, reason || undefined)
      onApprove()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed')
    } finally {
      setApproving(false)
    }
  }

  return (
    <div className={`border rounded-lg p-4 space-y-3 ${
      action.status === 'PENDING' ? 'border-yellow-700/60 bg-yellow-900/10' :
      action.status === 'APPROVED' ? 'border-green-700/50 bg-green-900/10' :
      action.status === 'COMPLETED' ? 'border-green-700/30 bg-green-900/5' :
      action.status === 'REJECTED' ? 'border-red-700/50 bg-red-900/10' :
      'border-slate-700 bg-slate-800/30'
    }`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-100">{action.action}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded border ${riskColors[action.risk] || riskColors['MEDIUM']}`}>
              {action.risk} RISK
            </span>
          </div>
          <div className="text-xs text-slate-400 mt-1">{action.reason}</div>
        </div>
        <span className={`text-xs px-2 py-1 rounded font-medium ${
          action.status === 'PENDING' ? 'bg-yellow-900/40 text-yellow-300' :
          action.status === 'APPROVED' ? 'bg-green-900/40 text-green-300' :
          action.status === 'COMPLETED' ? 'bg-green-900/40 text-green-400' :
          action.status === 'REJECTED' ? 'bg-red-900/40 text-red-300' :
          'bg-slate-700 text-slate-300'
        }`}>{action.status}</span>
      </div>
      <div className="text-xs text-slate-500">
        Blast radius: {action.blastRadius}
      </div>

      {action.status === 'PENDING' && (
        <div className="space-y-2 pt-1 border-t border-yellow-700/30">
          <div className="text-xs text-yellow-400 font-medium">⚠ Awaiting Approval from Incident Commander</div>
          {showReason && (
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Optional: reason for decision"
              className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-xs text-slate-300 placeholder-slate-600"
            />
          )}
          <div className="flex gap-2">
            <button
              onClick={() => approve('APPROVED')}
              disabled={approving}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-700 hover:bg-green-600 rounded text-xs font-medium transition-colors disabled:opacity-50"
            >
              <Check size={12} /> APPROVE
            </button>
            <button
              onClick={() => approve('REJECTED')}
              disabled={approving}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-700 hover:bg-red-600 rounded text-xs font-medium transition-colors disabled:opacity-50"
            >
              <X size={12} /> DENY
            </button>
            <button
              onClick={() => setShowReason(!showReason)}
              className="px-3 py-1.5 text-slate-400 hover:text-slate-300 text-xs"
            >
              {showReason ? 'Hide reason' : 'Add reason'}
            </button>
          </div>
        </div>
      )}
      {action.approval && (
        <div className="text-xs text-slate-500 border-t border-slate-700 pt-2">
          {action.approval.decision} by incident-commander · {timeAgo(action.approval.createdAt)}
          {action.approval.reason && <> · "{action.approval.reason}"</>}
        </div>
      )}
    </div>
  )
}

function Timeline({ events }: { events: IncidentEvent[] }) {
  return (
    <div className="space-y-2">
      {events.map((ev, i) => (
        <div key={ev.id} className="flex gap-3 text-xs">
          <div className="flex flex-col items-center pt-1">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
              ev.type === 'RESOLVED' ? 'bg-green-400' :
              ev.type === 'ERROR' ? 'bg-red-400' :
              ev.type.includes('MEMORY') ? 'bg-purple-400' :
              ev.type === 'STATE_CHANGE' ? 'bg-blue-400' :
              'bg-slate-600'
            }`} />
            {i < events.length - 1 && <div className="w-px bg-slate-700 flex-1 mt-1" />}
          </div>
          <div className="pb-3 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-slate-400">{ev.message}</span>
              <span className="text-slate-600 flex-shrink-0">{timeAgo(ev.timestamp)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

const ACTIVE_STATUSES = ['TRIAGING', 'CONTEXT_GATHERING', 'MEMORY_LOOKUP', 'HYPOTHESIS_FORMATION',
  'HYPOTHESIS_VALIDATION', 'ACTION_PLANNING', 'SAFETY_REVIEW', 'AWAITING_APPROVAL', 'EXECUTING', 'VERIFYING']

export default function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [incident, setIncident] = useState<Incident | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [streamEvents, setStreamEvents] = useState<StreamEvent[]>([])
  const [investigating, setInvestigating] = useState(false)
  const [memoryEnabled, setMemoryEnabled] = useState(true)

  const loadIncident = useCallback(async () => {
    if (!id) return
    try {
      const data = await api.getIncident(id)
      setIncident(data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load incident')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    loadIncident()
  }, [loadIncident])

  // SSE connection
  useEffect(() => {
    if (!id) return
    const disconnect = connectToIncidentStream(
      id,
      (type, data) => {
        setStreamEvents((prev) => [...prev, { type, data, timestamp: new Date() }])
        // Reload incident data when state changes
        if (type === 'state_change' || type === 'agent_completed' || type === 'tool_result') {
          setTimeout(loadIncident, 1000)
        }
      },
      () => {} // Ignore SSE errors (backend may not be running)
    )
    return disconnect
  }, [id, loadIncident])

  const startInvestigation = async () => {
    if (!id) return
    setInvestigating(true)
    setStreamEvents([])
    try {
      await api.investigateIncident(id, memoryEnabled)
      await loadIncident()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start investigation')
    } finally {
      setInvestigating(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="text-slate-400 flex items-center gap-3">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        Loading incident...
      </div>
    </div>
  )

  if (error) return (
    <div className="p-8">
      <div className="bg-red-900/20 border border-red-700 rounded p-4 text-red-400">{error}</div>
    </div>
  )

  if (!incident) return null

  const hypotheses = incident.hypotheses || []
  const events = incident.events || []
  const actionRequests = incident.actionRequests || []
  const pendingActions = actionRequests.filter((a) => a.status === 'PENDING')
  const services = parseJSON<string[]>(incident.affectedServices, [])
  const symptoms = parseJSON<string[]>(incident.symptoms, [])
  const isActive = ACTIVE_STATUSES.includes(incident.status)
  const duration = formatDuration(incident.detectedAt, incident.resolvedAt)

  return (
    <div className="p-6 space-y-4 max-w-7xl">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={() => navigate('/incidents')} className="text-slate-500 hover:text-slate-300 mt-1">
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <SeverityBadge severity={incident.severity} />
            <h1 className="text-xl font-bold text-white">{incident.title}</h1>
            <StatusChip status={incident.status} />
            {isActive && <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />}
          </div>
          <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
            <span className="flex items-center gap-1"><Clock size={10} /> {timeAgo(incident.detectedAt)}</span>
            <span>Duration: {duration}</span>
            <span>Services: {services.join(', ')}</span>
            {incident.agentRunId && <span>Run: {incident.agentRunId.substring(0, 8)}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadIncident} className="p-2 text-slate-500 hover:text-slate-300">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Pending approvals banner */}
      {pendingActions.length > 0 && (
        <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg px-4 py-3 flex items-center gap-3">
          <AlertTriangle size={16} className="text-yellow-400" />
          <span className="text-yellow-300 text-sm font-medium">
            {pendingActions.length} action{pendingActions.length > 1 ? 's' : ''} awaiting approval
          </span>
          <span className="text-yellow-500 text-xs">Scroll to Actions section below</span>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        {/* Left col */}
        <div className="col-span-2 space-y-4">
          {/* Investigate button */}
          {(incident.status === 'DETECTED' || incident.status === 'FAILED') && (
            <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-200 mb-1">Start AI Investigation</div>
                  <div className="text-xs text-slate-500">Agent will gather evidence, form hypotheses, and propose remediation</div>
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-400">
                  <input type="checkbox" checked={memoryEnabled} onChange={(e) => setMemoryEnabled(e.target.checked)} className="rounded" />
                  <Brain size={12} className="text-purple-400" />
                  Enable Memory
                </label>
                <button
                  onClick={startInvestigation}
                  disabled={investigating}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {investigating ? (
                    <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Investigating...</>
                  ) : (
                    <><Play size={14} /> INVESTIGATE</>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Agent Stream */}
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-300">Agent Activity Stream</h2>
            <AgentStream events={streamEvents} isActive={isActive} />
          </div>

          {/* Memory retrieval */}
          {streamEvents.some((e) => e.type === 'memory_retrieved') && (
            <div className="bg-purple-900/10 border border-purple-700/40 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Brain size={14} className="text-purple-400" />
                <span className="text-sm font-medium text-purple-300">Hindsight Memory Retrieved</span>
                <span className="ml-auto text-xs bg-purple-800/50 text-purple-300 px-2 py-0.5 rounded">
                  {streamEvents.filter((e) => e.type === 'memory_retrieved').reduce((sum, e) => {
                    const d = e.data as Record<string, unknown>
                    return sum + ((d['memoriesFound'] as number) || 0)
                  }, 0)} memories
                </span>
              </div>
              <div className="text-xs text-purple-400 mb-2">
                Historical evidence retrieved from Hindsight. Items labeled [HISTORICAL] below were sourced from memory.
              </div>
              {streamEvents.filter((e) => e.type === 'memory_retrieved').map((ev, i) => {
                const d = ev.data as Record<string, unknown>
                const memories = (d['memories'] as Array<{ content: string }>) || []
                return memories.map((m, j) => (
                  <div key={`${i}-${j}`} className="mb-2 pl-3 border-l-2 border-purple-500 bg-purple-900/10 rounded-r py-2 pr-2">
                    <div className="text-xs text-purple-300 font-medium mb-1">[HISTORICAL]</div>
                    <div className="text-xs text-slate-400">{m.content.substring(0, 300)}</div>
                  </div>
                ))
              })}
            </div>
          )}

          {/* Hypotheses */}
          {hypotheses.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-300">Hypothesis Ledger</h2>
              {hypotheses.map((h) => <HypothesisCard key={h.id} hypothesis={h} />)}
            </div>
          )}

          {/* Action Requests */}
          {actionRequests.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                Proposed Actions
                {pendingActions.length > 0 && (
                  <span className="bg-yellow-500 text-black text-xs rounded-full px-2 font-bold">{pendingActions.length} PENDING</span>
                )}
              </h2>
              {actionRequests.map((action) => (
                <ActionCard key={action.id} action={action} incidentId={incident.id} onApprove={loadIncident} />
              ))}
            </div>
          )}

          {/* Timeline */}
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-300">Investigation Timeline</h2>
            <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
              {events.length === 0 ? (
                <div className="text-xs text-slate-600 text-center py-4">No events yet</div>
              ) : (
                <Timeline events={events} />
              )}
            </div>
          </div>
        </div>

        {/* Right col */}
        <div className="space-y-4">
          {/* Symptoms */}
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
            <div className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wider">Symptoms</div>
            <div className="space-y-1.5">
              {symptoms.map((s, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-slate-300">
                  <span className="text-red-400 mt-0.5">●</span>
                  <span>{s}</span>
                </div>
              ))}
              {symptoms.length === 0 && <div className="text-slate-600 text-xs">No symptoms recorded</div>}
            </div>
          </div>

          {/* Root cause (if known) */}
          {incident.rootCause && (
            <div className="bg-green-900/10 border border-green-700/40 rounded-lg p-4">
              <div className="text-xs font-semibold text-green-400 mb-2 uppercase tracking-wider">Root Cause</div>
              <div className="text-xs text-slate-300">{incident.rootCause}</div>
            </div>
          )}

          {/* Memory status */}
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
            <div className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wider flex items-center gap-2">
              <Brain size={12} className="text-purple-400" />
              Memory Context
            </div>
            <div className="space-y-2 text-xs">
              {streamEvents.some((e) => e.type === 'memory_retrieved') ? (
                <>
                  <div className="flex items-center gap-2 text-purple-400">
                    <span className="w-2 h-2 rounded-full bg-purple-400" />
                    Memory RETRIEVED
                  </div>
                  <div className="text-slate-500">
                    {streamEvents.filter((e) => e.type === 'memory_retrieved').reduce((sum, e) => {
                      const d = e.data as Record<string, unknown>
                      return sum + ((d['memoriesFound'] as number) || 0)
                    }, 0)} historical memories used
                  </div>
                </>
              ) : (
                <div className="text-slate-600">No memory retrieved yet</div>
              )}
            </div>
          </div>

          {/* Postmortem link */}
          {incident.postmortem && (
            <div className="bg-teal-900/10 border border-teal-700/40 rounded-lg p-4">
              <div className="text-xs font-semibold text-teal-400 mb-2">Postmortem Available</div>
              <div className="text-xs text-slate-400 truncate">{incident.postmortem.summary}</div>
              <div className={`mt-2 text-xs ${incident.postmortem.retainedToMemory ? 'text-purple-400' : 'text-slate-500'}`}>
                {incident.postmortem.retainedToMemory ? '🧠 Retained to Hindsight' : 'Not yet retained to memory'}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
