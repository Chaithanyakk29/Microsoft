import { useEffect, useState } from 'react'
import { BookOpen, Search, ShieldCheck, ChevronRight } from 'lucide-react'
import { api, Runbook, parseJSON } from '../api/client'

export default function RunbooksPage() {
  const [runbooks, setRunbooks] = useState<Runbook[]>([])
  const [selectedRunbook, setSelectedRunbook] = useState<Runbook | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getRunbooks()
        setRunbooks(data)
        if (data.length > 0) setSelectedRunbook(data[0])
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const filtered = runbooks.filter(
    (rb) =>
      rb.title.toLowerCase().includes(search.toLowerCase()) ||
      rb.service.toLowerCase().includes(search.toLowerCase()) ||
      rb.incidentType.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-slate-400 flex items-center gap-3">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          Loading Runbook repository...
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <BookOpen size={20} className="text-cyan-400" />
            Operational Runbooks & SOPs
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">SRE playbooks referenced automatically by RECALL OPS during triage</p>
        </div>
        <div className="relative w-72">
          <Search size={14} className="absolute left-3 top-2.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search playbooks, services, tags..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Runbook List */}
        <div className="space-y-2">
          {filtered.map((rb) => {
            const isSelected = selectedRunbook?.id === rb.id
            const tags = parseJSON<string[]>(rb.tags, [])
            return (
              <div
                key={rb.id}
                onClick={() => setSelectedRunbook(rb)}
                className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-slate-800/80 border-blue-500'
                    : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between">
                  <h3 className="text-sm font-semibold text-white">{rb.title}</h3>
                  <ChevronRight size={14} className={isSelected ? 'text-blue-400' : 'text-slate-600'} />
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded font-mono">
                    {rb.service}
                  </span>
                  <span className="text-xs bg-cyan-950 text-cyan-400 px-2 py-0.5 rounded">
                    {rb.incidentType}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {tags.map((tag) => (
                    <span key={tag} className="text-[10px] bg-slate-950 text-slate-500 px-1.5 py-0.2 rounded">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Selected Runbook Details */}
        <div className="md:col-span-2 bg-slate-900 border border-slate-800 rounded-lg p-6 space-y-6">
          {selectedRunbook ? (
            <>
              <div>
                <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                  <span>Owner: {selectedRunbook.owner}</span>
                  <span>•</span>
                  <span>Last Reviewed: {new Date(selectedRunbook.lastReviewed).toLocaleDateString()}</span>
                </div>
                <h2 className="text-lg font-bold text-white">{selectedRunbook.title}</h2>
                <p className="text-xs text-slate-400 mt-1">{selectedRunbook.content}</p>
              </div>

              {/* Symptoms */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Symptoms & Triggers</h4>
                <div className="bg-slate-950 p-3 rounded border border-slate-800 space-y-1 text-xs text-slate-300">
                  {parseJSON<string[]>(selectedRunbook.symptoms, []).map((sym, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-red-400">•</span>
                      <span>{sym}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Diagnostics */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Diagnostic Steps</h4>
                <div className="bg-slate-950 p-3 rounded border border-slate-800 space-y-1.5 text-xs text-slate-300 font-mono">
                  {parseJSON<string[]>(selectedRunbook.diagnostics, []).map((diag, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-blue-400">{i + 1}.</span>
                      <span>{diag}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mitigation */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Remediation Procedure</h4>
                <div className="bg-slate-950 p-4 rounded border border-slate-800 text-xs text-slate-200 font-mono whitespace-pre-wrap leading-relaxed">
                  {selectedRunbook.mitigation}
                </div>
              </div>

              {/* Verification & Escalation */}
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="bg-slate-950/60 p-3 rounded border border-slate-800">
                  <div className="font-bold text-green-400 mb-1">Verification Criteria</div>
                  <p className="text-slate-300">{selectedRunbook.verification}</p>
                </div>
                <div className="bg-slate-950/60 p-3 rounded border border-slate-800">
                  <div className="font-bold text-yellow-400 mb-1">Escalation Policy</div>
                  <p className="text-slate-300">{selectedRunbook.escalation}</p>
                </div>
              </div>
            </>
          ) : (
            <div className="text-slate-500 text-sm text-center py-12">Select a playbook from the list</div>
          )}
        </div>
      </div>
    </div>
  )
}
