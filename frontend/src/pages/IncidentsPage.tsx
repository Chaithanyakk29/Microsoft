import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Clock, CheckCircle2, Plus, ExternalLink, Filter } from 'lucide-react'
import { api, Incident, parseJSON, timeAgo, formatDuration } from '../api/client'

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    P1: 'bg-red-500/20 text-red-400 border-red-500/40',
    P2: 'bg-orange-500/20 text-orange-400 border-orange-500/40',
    P3: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
    P4: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-bold flex-shrink-0 ${colors[severity] || colors['P4']}`}>
      {severity}
    </span>
  )
}

const STATUS_COLORS: Record<string, string> = {
  DETECTED: 'bg-slate-700 text-slate-300',
  TRIAGING: 'bg-blue-900/40 text-blue-400',
  CONTEXT_GATHERING: 'bg-blue-900/40 text-blue-400',
  MEMORY_LOOKUP: 'bg-purple-900/40 text-purple-400',
  HYPOTHESIS_FORMATION: 'bg-indigo-900/40 text-indigo-400',
  HYPOTHESIS_VALIDATION: 'bg-indigo-900/40 text-indigo-400',
  ACTION_PLANNING: 'bg-orange-900/40 text-orange-400',
  SAFETY_REVIEW: 'bg-orange-900/40 text-orange-400',
  AWAITING_APPROVAL: 'bg-yellow-900/40 text-yellow-400',
  EXECUTING: 'bg-orange-900/40 text-orange-400',
  VERIFYING: 'bg-cyan-900/40 text-cyan-400',
  RESOLVED: 'bg-green-900/40 text-green-400',
  POSTMORTEM: 'bg-teal-900/40 text-teal-400',
  LEARNING_RETAINED: 'bg-purple-900/40 text-purple-400',
  FAILED: 'bg-red-900/40 text-red-400',
  ESCALATED: 'bg-red-900/40 text-red-400',
}

const ACTIVE_STATUSES = ['DETECTED', 'TRIAGING', 'CONTEXT_GATHERING', 'MEMORY_LOOKUP', 'HYPOTHESIS_FORMATION',
  'HYPOTHESIS_VALIDATION', 'ACTION_PLANNING', 'SAFETY_REVIEW', 'AWAITING_APPROVAL', 'EXECUTING', 'VERIFYING']

function IncidentRow({ incident }: { incident: Incident }) {
  const isActive = ACTIVE_STATUSES.includes(incident.status)
  const services = parseJSON<string[]>(incident.affectedServices, [])

  return (
    <Link to={`/incidents/${incident.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-800 transition-colors border-b border-slate-800 last:border-b-0">
      <SeverityBadge severity={incident.severity} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-100 truncate">{incident.title}</span>
          {isActive && (
            <span className="flex-shrink-0 w-2 h-2 rounded-full bg-red-400 animate-pulse" />
          )}
        </div>
        <div className="text-xs text-slate-500 mt-0.5 truncate">
          {services.slice(0, 3).join(' · ')} {services.length > 3 ? `+${services.length - 3}` : ''}
        </div>
      </div>
      <div className={`text-xs px-2 py-1 rounded flex-shrink-0 ${STATUS_COLORS[incident.status] || 'bg-slate-700 text-slate-300'}`}>
        {incident.status.replace(/_/g, ' ')}
      </div>
      <div className="text-xs text-slate-500 flex-shrink-0 w-20 text-right">
        {timeAgo(incident.detectedAt)}
      </div>
      {incident.resolvedAt && (
        <div className="text-xs text-slate-500 flex-shrink-0">
          TTR: {formatDuration(incident.detectedAt, incident.resolvedAt)}
        </div>
      )}
      <ExternalLink size={12} className="text-slate-600 flex-shrink-0" />
    </Link>
  )
}

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'active' | 'resolved'>('all')
  const [severityFilter, setSeverityFilter] = useState<string>('all')

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getIncidents()
        setIncidents(data)
        setError(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load incidents')
      } finally {
        setLoading(false)
      }
    }
    load()
    const interval = setInterval(load, 15000)
    return () => clearInterval(interval)
  }, [])

  const filtered = incidents.filter((inc) => {
    const isActive = ACTIVE_STATUSES.includes(inc.status)
    if (filter === 'active' && !isActive) return false
    if (filter === 'resolved' && isActive) return false
    if (severityFilter !== 'all' && inc.severity !== severityFilter) return false
    return true
  })

  const activeCount = incidents.filter((i) => ACTIVE_STATUSES.includes(i.status)).length
  const resolvedCount = incidents.filter((i) => !ACTIVE_STATUSES.includes(i.status)).length

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="text-slate-400 flex items-center gap-3">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        Loading incidents...
      </div>
    </div>
  )

  return (
    <div className="p-6 space-y-4 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <AlertTriangle size={20} className="text-red-400" />
            Incidents
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {activeCount} active · {resolvedCount} historical
          </p>
        </div>
        <Link to="/simulator" className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium transition-colors">
          <Plus size={14} />
          New Scenario
        </Link>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-700 rounded p-3 text-red-400 text-sm">{error}</div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 bg-slate-800 rounded p-1">
          {(['all', 'active', 'resolved'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                filter === f ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
              {f === 'active' && activeCount > 0 && (
                <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full px-1.5">{activeCount}</span>
              )}
            </button>
          ))}
        </div>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded px-2 py-1.5"
        >
          <option value="all">All severities</option>
          <option value="P1">P1 - Critical</option>
          <option value="P2">P2 - High</option>
          <option value="P3">P3 - Medium</option>
          <option value="P4">P4 - Low</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-8 text-center">
          <CheckCircle2 className="mx-auto mb-3 text-green-400" size={32} />
          <div className="text-slate-400">No incidents found</div>
          <div className="text-slate-600 text-sm mt-1">All systems operational</div>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
          <div className="flex items-center gap-4 px-4 py-2 border-b border-slate-700 bg-slate-800/50 text-xs text-slate-500 font-medium">
            <span className="w-14">SEV</span>
            <span className="flex-1">Title / Services</span>
            <span className="w-36">Status</span>
            <span className="w-20 text-right">Detected</span>
            <span className="w-16">TTR</span>
            <span className="w-4" />
          </div>
          {filtered.map((incident) => (
            <IncidentRow key={incident.id} incident={incident} />
          ))}
        </div>
      )}
    </div>
  )
}
