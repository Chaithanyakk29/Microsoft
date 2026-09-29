import { useEffect, useState } from 'react'
import { ClipboardList, Shield, CheckCircle2, XCircle, RefreshCw } from 'lucide-react'
import { api, AuditEvent } from '../api/client'

export default function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState('ALL')

  const loadAudit = async () => {
    try {
      const data = await api.getAuditEvents(100)
      setEvents(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAudit()
  }, [])

  const filtered = filterType === 'ALL' ? events : events.filter((e) => e.eventType === filterType)

  const eventTypes = Array.from(new Set(events.map((e) => e.eventType)))

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-slate-400 flex items-center gap-3">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          Loading audit events...
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <ClipboardList size={20} className="text-blue-400" />
            Security & Agent Action Audit Log
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Immutable trace of all agent decisions, policy evaluations, tool calls, and approvals
          </p>
        </div>
        <button
          onClick={loadAudit}
          className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition-colors"
        >
          <RefreshCw size={12} /> Refresh Log
        </button>
      </div>

      {/* Filter Chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setFilterType('ALL')}
          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
            filterType === 'ALL'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          ALL ({events.length})
        </button>
        {eventTypes.map((type) => (
          <button
            key={type}
            onClick={() => setFilterType(type)}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              filterType === type
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            {type} ({events.filter((e) => e.eventType === type).length})
          </button>
        ))}
      </div>

      {/* Audit Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-950 text-slate-500 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="p-3">Timestamp</th>
                <th className="p-3">Event Type</th>
                <th className="p-3">Actor</th>
                <th className="p-3">Tool / Action</th>
                <th className="p-3">Summary Payload</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.length ? (
                filtered.map((ev) => (
                  <tr key={ev.id} className="hover:bg-slate-800/40">
                    <td className="p-3 font-mono text-slate-500 whitespace-nowrap">
                      {new Date(ev.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="p-3">
                      <span className="font-mono font-bold text-blue-400 bg-blue-950/60 px-2 py-0.5 rounded border border-blue-800/40">
                        {ev.eventType}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-slate-400">{ev.actorRole || 'AGENT'}</td>
                    <td className="p-3 font-mono text-slate-300 font-semibold">{ev.tool || '-'}</td>
                    <td className="p-3 text-slate-300 max-w-md truncate">
                      {ev.inputSummary || ev.outputSummary || '-'}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        {ev.success ? (
                          <CheckCircle2 size={14} className="text-green-400" />
                        ) : (
                          <XCircle size={14} className="text-red-400" />
                        )}
                        <span className={ev.success ? 'text-green-400' : 'text-red-400'}>
                          {ev.success ? 'SUCCESS' : 'FAILED'}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    No audit records matching filter
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
