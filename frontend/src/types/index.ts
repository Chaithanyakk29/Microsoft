/** All shared TypeScript types for RECALL OPS frontend */

// ─── Severity ────────────────────────────────────────────────────────────────
export type Severity = 'P1' | 'P2' | 'P3' | 'P4'

// ─── Incident Status ─────────────────────────────────────────────────────────
export type IncidentStatus =
  | 'DETECTED'
  | 'TRIAGING'
  | 'HYPOTHESIS_FORMATION'
  | 'INVESTIGATING'
  | 'AWAITING_APPROVAL'
  | 'IMPLEMENTING_FIX'
  | 'MONITORING'
  | 'RESOLVED'
  | 'FAILED'

// ─── Service Health ──────────────────────────────────────────────────────────
export type ServiceStatus = 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'UNKNOWN'

export interface ServiceMetrics {
  cpu: number
  memory: number
  errorRate: number
  latencyP99: number
  activeConnections: number
}

export interface Service {
  name: string
  status: ServiceStatus
  criticality: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  metrics: ServiceMetrics
  dependencies?: string[]
}

// ─── Hypothesis ──────────────────────────────────────────────────────────────
export type HypothesisStatus =
  | 'PROPOSED'
  | 'TESTING'
  | 'SUPPORTED'
  | 'CONTRADICTED'
  | 'CONFIRMED'

export interface Evidence {
  type: string
  source: string
  data: unknown
  fromMemory?: boolean
  timestamp?: string
}

export interface Hypothesis {
  id: string
  description: string
  confidence: number // 0–100
  status: HypothesisStatus
  supportingEvidence: Evidence[]
  contradictingEvidence: Evidence[]
  testedAt?: string
}

// ─── Action Request ──────────────────────────────────────────────────────────
export type ActionDecision = 'APPROVED' | 'REJECTED' | 'PENDING'
export type ActionRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export interface ActionRequest {
  id: string
  description: string
  command?: string
  rationale: string
  risk: ActionRisk
  decision: ActionDecision
  decisionReason?: string
  requestedAt: string
  decidedAt?: string
}

// ─── SSE Event ───────────────────────────────────────────────────────────────
export type SSEEventType =
  | 'agent_started'
  | 'agent_thinking'
  | 'tool_call'
  | 'tool_result'
  | 'memory_retrieved'
  | 'state_change'
  | 'agent_completed'
  | 'error'
  | 'action_required'
  | 'hypothesis_formed'

export interface SSEEvent {
  type: SSEEventType
  message?: string
  data?: Record<string, unknown>
  timestamp: string
}

// ─── Postmortem ──────────────────────────────────────────────────────────────
export type PostmortemStatus = 'DRAFT' | 'APPROVED' | 'PUBLISHED'

export interface Postmortem {
  id: string
  incidentId: string
  incidentTitle: string
  status: PostmortemStatus
  retainedToMemory: boolean
  createdAt: string
  severity?: Severity
  timeline?: string
  rootCause?: string
  contributingFactors?: string[]
  impact?: string
  resolution?: string
  lessonsLearned?: string[]
  preventionItems?: string[]
  detectionTime?: number
  resolutionTime?: number
}

// ─── Incident ────────────────────────────────────────────────────────────────
export interface Incident {
  id: string
  title: string
  description?: string
  severity: Severity
  status: IncidentStatus
  affectedServices: string[]
  detectedAt: string
  resolvedAt?: string
  hypotheses?: Hypothesis[]
  events?: SSEEvent[]
  actionRequests?: ActionRequest[]
  postmortem?: Postmortem
  memoryRetrieved?: number
  rootCause?: string
  resolution?: string
  currentState?: string
  agentActive?: boolean
}

// ─── Dashboard ───────────────────────────────────────────────────────────────
export interface DashboardData {
  activeIncidents: number
  services: Service[]
  unhealthyCount: number
  hindsightAvailable: boolean
  totalMemoryOps: number
  recentIncidents?: Incident[]
}

// ─── Memory ──────────────────────────────────────────────────────────────────
export type MemoryOpType = 'RETAIN' | 'RECALL' | 'REFLECT' | 'FORGET'

export interface MemoryOp {
  id?: string
  type: MemoryOpType
  bankId?: string
  query?: string
  durationMs: number
  success: boolean
  timestamp: string
  error?: string
}

export interface MemoryStats {
  totalOps: number
  retainOps: number
  recallOps: number
  reflectOps: number
  failedOps: number
}

export interface MemoryStatus {
  available: boolean
  status: 'OPERATIONAL' | 'DEGRADED' | 'UNAVAILABLE'
  stats: MemoryStats
  recentOps: MemoryOp[]
  bankId?: string
}

export interface RecallResult {
  memories: Array<{
    content: string
    score: number
    metadata?: Record<string, unknown>
    fromIncident?: string
  }>
  synthesis?: string
  durationMs?: number
}

export interface ReflectResult {
  synthesis: string
  sources?: number
  durationMs?: number
}

// ─── Runbook ─────────────────────────────────────────────────────────────────
export interface Runbook {
  id: string
  title: string
  service: string
  incidentType: string
  symptoms?: string[]
  diagnostics?: string[]
  mitigation?: string[]
  verification?: string[]
  updatedAt?: string
}

// ─── Audit ───────────────────────────────────────────────────────────────────
export interface AuditEvent {
  id?: string
  timestamp: string
  eventType: string
  tool?: string
  inputSummary?: string
  outputSummary?: string
  success: boolean
  incidentId?: string
  durationMs?: number
}

// ─── Simulator ───────────────────────────────────────────────────────────────
export interface Scenario {
  id: string
  name: string
  description: string
  severity: Severity
  affectedServices: string[]
  expectedRootCause?: string
  estimatedDuration?: number
}
