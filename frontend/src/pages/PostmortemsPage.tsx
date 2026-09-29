import { useEffect, useState } from 'react'
import { FileText, Brain, CheckCircle2, ChevronRight, RefreshCw, UploadCloud } from 'lucide-react'
import { api, Postmortem, parseJSON } from '../api/client'

export default function PostmortemsPage() {
  const [postmortems, setPostmortems] = useState<(Postmortem & { incident?: any })[]>([])
  const [selectedPm, setSelectedPm] = useState<(Postmortem & { incident?: any }) | null>(null)
  const [loading, setLoading] = useState(true)
  const [retaining, setRetaining] = useState(false)

  const loadPostmortems = async () => {
    try {
      const data = await api.getPostmortems()
      setPostmortems(data)
      if (data.length > 0 && !selectedPm) {
        setSelectedPm(data[0])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPostmortems()
  }, [])

  const handleRetainToMemory = async (pmId: string) => {
    setRetaining(true)
    try {
      await api.retainPostmortem(pmId)
      await loadPostmortems()
      if (selectedPm && selectedPm.id === pmId) {
        setSelectedPm({ ...selectedPm, retainedToMemory: true, status: 'RETAINED' })
      }
    } catch (e: any) {
      alert(e.message || 'Failed to retain postmortem to memory')
    } finally {
      setRetaining(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-slate-400 flex items-center gap-3">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          Loading postmortems...
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <FileText size={20} className="text-teal-400" />
            Incident Postmortems & Retained Learnings
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Blameless retrospective reports and operational learnings retained in Hindsight memory
          </p>
        </div>
        <button
          onClick={loadPostmortems}
          className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition-colors"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Postmortems List */}
        <div className="space-y-2">
          {postmortems.map((pm) => {
            const isSelected = selectedPm?.id === pm.id
            return (
              <div
                key={pm.id}
                onClick={() => setSelectedPm(pm)}
                className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-slate-800/80 border-teal-500'
                    : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between">
                  <h3 className="text-sm font-semibold text-white truncate max-w-[200px]">
                    {pm.incident?.title || pm.summary || 'Postmortem'}
                  </h3>
                  <ChevronRight size={14} className={isSelected ? 'text-teal-400' : 'text-slate-600'} />
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                      pm.retainedToMemory || pm.status === 'RETAINED'
                        ? 'bg-purple-900/40 text-purple-300 border border-purple-800/50'
                        : 'bg-yellow-900/40 text-yellow-300'
                    }`}
                  >
                    {pm.retainedToMemory || pm.status === 'RETAINED' ? 'RETAINED TO HINDSIGHT' : 'DRAFT'}
                  </span>
                  <span className="text-xs text-slate-500">
                    {new Date(pm.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Selected Postmortem Detail */}
        <div className="md:col-span-2 bg-slate-900 border border-slate-800 rounded-lg p-6 space-y-6">
          {selectedPm ? (
            <>
              <div className="flex items-start justify-between border-b border-slate-800 pb-4">
                <div>
                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                    <span>Incident ID: {selectedPm.incidentId}</span>
                    <span>•</span>
                    <span>Created: {new Date(selectedPm.createdAt).toLocaleString()}</span>
                  </div>
                  <h2 className="text-lg font-bold text-white">
                    {selectedPm.incident?.title || selectedPm.summary}
                  </h2>
                </div>

                {!selectedPm.retainedToMemory && selectedPm.status !== 'RETAINED' ? (
                  <button
                    onClick={() => handleRetainToMemory(selectedPm.id)}
                    disabled={retaining}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded text-xs font-medium transition-colors"
                  >
                    <UploadCloud size={14} />
                    {retaining ? 'Retaining...' : 'Retain to Hindsight'}
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-purple-900/30 border border-purple-700/40 text-purple-300 rounded text-xs">
                    <Brain size={14} /> Retained in Operational Memory
                  </div>
                )}
              </div>

              {/* Summary */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Executive Summary</h4>
                <p className="text-xs text-slate-300 bg-slate-950 p-3 rounded border border-slate-800 leading-relaxed">
                  {selectedPm.summary}
                </p>
              </div>

              {/* Root Cause & Detection */}
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="bg-slate-950 p-3 rounded border border-slate-800 space-y-1">
                  <div className="font-bold text-red-400">Root Cause</div>
                  <p className="text-slate-300 leading-relaxed">{selectedPm.rootCause}</p>
                </div>
                <div className="bg-slate-950 p-3 rounded border border-slate-800 space-y-1">
                  <div className="font-bold text-blue-400">Detection & Symptoms</div>
                  <p className="text-slate-300 leading-relaxed">{selectedPm.detection}</p>
                </div>
              </div>

              {/* What Worked vs What Failed */}
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="bg-slate-950 p-3 rounded border border-slate-800 space-y-1">
                  <div className="font-bold text-green-400">What Worked</div>
                  <p className="text-slate-300 leading-relaxed">{selectedPm.whatWorked}</p>
                </div>
                <div className="bg-slate-950 p-3 rounded border border-slate-800 space-y-1">
                  <div className="font-bold text-yellow-400">What Failed / Gaps</div>
                  <p className="text-slate-300 leading-relaxed">{selectedPm.whatFailed}</p>
                </div>
              </div>

              {/* Resolution & Prevention */}
              <div className="space-y-3 text-xs">
                <div className="bg-slate-950 p-3 rounded border border-slate-800">
                  <div className="font-bold text-cyan-400 mb-1">Final Resolution</div>
                  <p className="text-slate-300">{selectedPm.resolution}</p>
                </div>
                <div className="bg-slate-950 p-3 rounded border border-slate-800">
                  <div className="font-bold text-purple-400 mb-1">Preventive Actions & Long-Term Fixes</div>
                  <p className="text-slate-300">{selectedPm.prevention}</p>
                </div>
              </div>
            </>
          ) : (
            <div className="text-slate-500 text-sm text-center py-12">Select a postmortem from the list</div>
          )}
        </div>
      </div>
    </div>
  )
}
