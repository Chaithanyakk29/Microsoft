import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import {
  LayoutDashboard, AlertTriangle, Terminal, Server, Network,
  BookOpen, Brain, FileText, ClipboardList, Settings, Zap
} from 'lucide-react'
import { api } from './api/client'
import OverviewPage from './pages/OverviewPage'
import IncidentsPage from './pages/IncidentsPage'
import IncidentDetailPage from './pages/IncidentDetailPage'
import SimulatorPage from './pages/SimulatorPage'
import ServicesPage from './pages/ServicesPage'
import TopologyPage from './pages/TopologyPage'
import RunbooksPage from './pages/RunbooksPage'
import MemoryPage from './pages/MemoryPage'
import PostmortemsPage from './pages/PostmortemsPage'
import AuditPage from './pages/AuditPage'

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Overview', exact: true },
  { path: '/incidents', icon: AlertTriangle, label: 'Live Incidents' },
  { path: '/simulator', icon: Terminal, label: 'Simulator' },
  { path: '/services', icon: Server, label: 'Services' },
  { path: '/topology', icon: Network, label: 'Topology' },
  { path: '/runbooks', icon: BookOpen, label: 'Runbooks' },
  { path: '/memory', icon: Brain, label: 'Memory' },
  { path: '/postmortems', icon: FileText, label: 'Postmortems' },
  { path: '/audit', icon: ClipboardList, label: 'Audit Log' },
]

export default function App() {
  const [memoryAvailable, setMemoryAvailable] = useState<boolean | null>(null)
  const [activeIncidentCount, setActiveIncidentCount] = useState(0)
  const location = useLocation()

  useEffect(() => {
    const loadStatus = async () => {
      try {
        const [memStatus, dashboard] = await Promise.all([
          api.getMemoryStatus(),
          api.getDashboard(),
        ])
        setMemoryAvailable(memStatus.available)
        setActiveIncidentCount(dashboard.activeIncidents.length)
      } catch {}
    }
    loadStatus()
    const interval = setInterval(loadStatus, 30000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex h-screen bg-gray-950 text-slate-100 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-52 flex-shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col">
        {/* Logo */}
        <div className="px-4 py-5 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-blue-600 flex items-center justify-center">
              <Zap size={14} className="text-white" />
            </div>
            <div>
              <div className="text-sm font-bold text-white tracking-wide">RECALL OPS</div>
              <div className="text-xs text-slate-500">Incident Response</div>
            </div>
          </div>
        </div>

        {/* Memory Status */}
        <div className="px-4 py-2 border-b border-slate-800">
          <div className="flex items-center gap-2 text-xs">
            <div className={`w-2 h-2 rounded-full ${
              memoryAvailable === null ? 'bg-slate-500' :
              memoryAvailable ? 'bg-purple-400 animate-pulse' : 'bg-red-400'
            }`} />
            <span className={memoryAvailable ? 'text-purple-400' : 'text-red-400'}>
              {memoryAvailable === null ? 'Checking...' :
               memoryAvailable ? 'Memory: LIVE' : 'Memory: DEGRADED'}
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 space-y-1 px-2 overflow-y-auto">
          {navItems.map(({ path, icon: Icon, label, exact }) => (
            <NavLink
              key={path}
              to={path}
              end={exact}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded text-sm transition-colors ${
                  isActive
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`
              }
            >
              <Icon size={16} />
              <span>{label}</span>
              {label === 'Live Incidents' && activeIncidentCount > 0 && (
                <span className="ml-auto bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {activeIncidentCount}
                </span>
              )}
              {label === 'Memory' && !memoryAvailable && memoryAvailable !== null && (
                <span className="ml-auto text-red-400 text-xs">!</span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-800 text-xs text-slate-600">
          v1.0.0 · HackwithHyd 3.0
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/incidents" element={<IncidentsPage />} />
          <Route path="/incidents/:id" element={<IncidentDetailPage />} />
          <Route path="/simulator" element={<SimulatorPage />} />
          <Route path="/services" element={<ServicesPage />} />
          <Route path="/topology" element={<TopologyPage />} />
          <Route path="/runbooks" element={<RunbooksPage />} />
          <Route path="/memory" element={<MemoryPage />} />
          <Route path="/postmortems" element={<PostmortemsPage />} />
          <Route path="/audit" element={<AuditPage />} />
        </Routes>
      </main>
    </div>
  )
}
