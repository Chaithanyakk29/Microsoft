/**
 * Typed API client for RECALL OPS backend.
 * All requests go through the Vite proxy at /api -> http://localhost:3001
 */

const BASE_URL = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }))
    throw new Error(error.error || error.message || `HTTP ${response.status}`)
  }

  if (response.status === 204) return undefined as unknown as T
  return response.json()
}

// ─── Domain Types ─────────────────────────────────────────────────────────────

export interface Incident {
  id: string
  title: string
  description: string
  severity: 'P1' | 'P2' | 'P3' | 'P4'
  status: string
  detectedAt: string
  acknowledgedAt?: string
  resolvedAt?: string
  affectedServices: string // JSON string
  symptoms: string // JSON string
  rootCause?: string
  impact?: string
  autonomyMode: string
  agentRunId?: string
  learningStatus: string
  hypotheses?: Hypothesis[]
  actionRequests?: ActionRequest[]
  events?: IncidentEvent[]
  postmortem?: Postmortem
}

export interface Hypothesis {
  id: string
  incidentId: string
  name: string
  description: string
  confidence: number
  supportingEvidence: string // JSON string
  contradictingEvidence: string // JSON string
  nextDiagnostic?: string
  status: 'PROPOSED' | 'TESTING' | 'SUPPORTED' | 'REJECTED' | 'INCONCLUSIVE'
  createdAt: string
  updatedAt: string
}

export interface ActionRequest {
  id: string
  incidentId: string
  action: string
  parameters: string // JSON string
  reason: string
  risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'DANGEROUS'
  blastRadius: string
  status: string
  policyDecision: string
  createdAt: string
  expiresAt?: string
  executedAt?: string
  result?: string // JSON string
  approval?: {
    id: string
    approverId: string
    decision: string
    reason?: string
    createdAt: string
  }
}

export interface IncidentEvent {
  id: string
  incidentId: string
  type: string
  message: string
  data?: string
  actor?: string
  timestamp: string
}

export interface Postmortem {
  id: string
  incidentId: string
  summary: string
  detection: string
  impact: string
  rootCause: string
  whatWorked: string
  whatFailed: string
  resolution: string
  prevention: string
  status: string
  retainedToMemory: boolean
  createdAt: string
  incident?: Incident
}

export interface Service {
  id: string
  name: string
  type: string
  criticality: string
  isHealthy: boolean
  cpu: number
  memory: number
  latencyP50: number
  latencyP95: number
  latencyP99: number
  requestRate: number
  errorRate: number
  activeConnections: number
  maxConnections: number
  deploymentVersion: string
  dependencies: string[]
  status: 'healthy' | 'degraded' | 'unhealthy'
}

export interface SimulatorScenario {
  id: string
  name: string
  description: string
  severity: string
  affectedServices: string[]
  symptoms: string[]
  expectedRootCause: string
}

export interface MemoryOperation {
  id: string
  type: string
  bankId: string
  query?: string
  content?: string
  result?: string
  incidentId?: string
  duration: number
  success: boolean
  error?: string
  createdAt: string
}

export interface MemoryStatus {
  available: boolean
  status: 'OPERATIONAL' | 'DEGRADED'
  bankId: string
  stats: {
    totalOps: number
    retainOps: number
    recallOps: number
    reflectOps: number
    failedOps: number
  }
  recentOps: MemoryOperation[]
}

export interface DashboardData {
  activeIncidents: Incident[]
  resolvedToday: number
  totalMemoryOps: number
  hindsightAvailable: boolean
  services: Service[]
  unhealthyCount: number
  recentPostmortems: (Postmortem & { incident: Incident })[]
  activeScenario?: string
}

export interface Runbook {
  id: string
  title: string
  service: string
  incidentType: string
  symptoms: string // JSON string
  diagnostics: string // JSON string
  mitigation: string
  verification: string
  escalation: string
  owner: string
  content: string
  tags: string // JSON string
  lastReviewed: string
}

export interface AuditEvent {
  id: string
  timestamp: string
  actorRole?: string
  incidentId?: string
  agentRunId?: string
  eventType: string
  tool?: string
  inputSummary?: string
  outputSummary?: string
  policyDecision?: string
  success: boolean
  metadata?: string
}

// ─── API Object ───────────────────────────────────────────────────────────────

export const api = {
  getDashboard: () => request<DashboardData>('/dashboard'),

  getIncidents: () => request<Incident[]>('/incidents'),
  getIncident: (id: string) => request<Incident>(`/incidents/${id}`),
  createIncident: (data: {
    title: string
    description: string
    severity: string
    affectedServices: string[]
    symptoms: string[]
  }) => request<Incident>('/incidents', { method: 'POST', body: JSON.stringify(data) }),
  investigateIncident: (id: string, memoryEnabled = true) =>
    request<{ message: string }>(`/incidents/${id}/investigate`, {
      method: 'POST',
      body: JSON.stringify({ memoryEnabled }),
    }),
  resolveIncident: (id: string, rootCause?: string) =>
    request(`/incidents/${id}/resolve`, { method: 'POST', body: JSON.stringify({ rootCause }) }),
  approveAction: (
    incidentId: string,
    actionId: string,
    decision: 'APPROVED' | 'REJECTED',
    reason?: string
  ) =>
    request(`/incidents/${incidentId}/actions/${actionId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ decision, reason, approverId: 'commander-1' }),
    }),
  replayIncident: (id: string, memoryEnabled = true) =>
    request<{ newIncidentId: string; message: string }>(`/incidents/${id}/replay`, {
      method: 'POST',
      body: JSON.stringify({ memoryEnabled }),
    }),
  getIncidentEvents: (id: string) => request<IncidentEvent[]>(`/incidents/${id}/events`),

  getSimulatorScenarios: () => request<SimulatorScenario[]>('/simulator/scenarios'),
  resetSimulator: () => request('/simulator/reset', { method: 'POST' }),
  injectScenario: (scenarioId: string, autoInvestigate = true, memoryEnabled = true) =>
    request<{ success: boolean; incident: Incident }>('/simulator/inject', {
      method: 'POST',
      body: JSON.stringify({ scenarioId, autoInvestigate, memoryEnabled }),
    }),
  getServices: () => request<Service[]>('/simulator/services'),

  getMemoryStatus: () => request<MemoryStatus>('/memory/status'),
  recallMemory: (service: string, symptoms: string[]) =>
    request('/memory/recall', { method: 'POST', body: JSON.stringify({ service, symptoms }) }),
  reflectMemory: (query: string) =>
    request('/memory/reflect', { method: 'POST', body: JSON.stringify({ query }) }),
  runABExperiment: (scenarioId: string) =>
    request<{ modeA: { incidentId: string }; modeB: { incidentId: string } }>(
      '/memory/ab-experiment',
      {
        method: 'POST',
        body: JSON.stringify({ scenarioId }),
      }
    ),

  getRunbooks: () => request<Runbook[]>('/runbooks'),
  getRunbook: (id: string) => request<Runbook>(`/runbooks/${id}`),

  getPostmortems: () => request<(Postmortem & { incident: Incident })[]>('/postmortems'),
  getPostmortem: (id: string) => request<Postmortem & { incident: Incident }>(`/postmortems/${id}`),
  retainPostmortem: (id: string) => request(`/postmortems/${id}/retain`, { method: 'POST' }),
  approvePostmortem: (id: string) => request(`/postmortems/${id}/approve`, { method: 'POST' }),

  getAuditEvents: (limit = 100) => request<AuditEvent[]>(`/audit?limit=${limit}`),
}

// ─── SSE Streaming Helper ─────────────────────────────────────────────────────

export function connectToIncidentStream(
  incidentId: string,
  onEvent: (type: string, data: unknown) => void,
  onError?: (err: Event) => void
): () => void {
  const eventSource = new EventSource(`/api/incidents/${incidentId}/stream`)

  const eventTypes = [
    'connected',
    'state_change',
    'agent_started',
    'agent_thinking',
    'agent_reasoning',
    'tool_call',
    'tool_result',
    'memory_retrieved',
    'agent_completed',
    'agent_error',
  ]

  eventTypes.forEach((type) => {
    eventSource.addEventListener(type, (e: MessageEvent) => {
      try {
        onEvent(type, JSON.parse(e.data))
      } catch {
        onEvent(type, e.data)
      }
    })
  })

  if (onError) eventSource.onerror = onError

  return () => eventSource.close()
}

// ─── Utility Helpers ──────────────────────────────────────────────────────────

export function parseJSON<T>(str: string | null | undefined, fallback: T): T {
  if (!str) return fallback
  try {
    return JSON.parse(str) as T
  } catch {
    return fallback
  }
}

export function formatDuration(startIso: string, endIso?: string): string {
  const start = new Date(startIso)
  const end = endIso ? new Date(endIso) : new Date()
  const diffMs = end.getTime() - start.getTime()
  const mins = Math.floor(diffMs / 60000)
  const hours = Math.floor(mins / 60)
  if (hours > 0) return `${hours}h ${mins % 60}m`
  if (mins > 0) return `${mins}m`
  return `${Math.max(0, Math.floor(diffMs / 1000))}s`
}

export function timeAgo(isoString: string): string {
  const date = new Date(isoString)
  const diffMs = Date.now() - date.getTime()
  const mins = Math.floor(diffMs / 60000)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)
  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (mins > 0) return `${mins}m ago`
  return 'just now'
}
