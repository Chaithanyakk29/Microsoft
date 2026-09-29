// Core domain types for RECALL OPS

export type Severity = 'P1' | 'P2' | 'P3' | 'P4';

export type IncidentStatus =
  | 'DETECTED'
  | 'TRIAGING'
  | 'CONTEXT_GATHERING'
  | 'MEMORY_LOOKUP'
  | 'HYPOTHESIS_FORMATION'
  | 'HYPOTHESIS_VALIDATION'
  | 'ACTION_PLANNING'
  | 'SAFETY_REVIEW'
  | 'AWAITING_APPROVAL'
  | 'EXECUTING'
  | 'VERIFYING'
  | 'RESOLVED'
  | 'POSTMORTEM'
  | 'LEARNING_RETAINED'
  | 'FAILED'
  | 'ESCALATED';

export type HypothesisStatus = 'PROPOSED' | 'TESTING' | 'SUPPORTED' | 'REJECTED' | 'INCONCLUSIVE';

export type ActionRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'DANGEROUS';

export type PolicyDecision = 'ALLOW' | 'DENY' | 'REQUIRES_APPROVAL';

export type AutonomyMode = 'ADVISORY' | 'APPROVAL_REQUIRED' | 'SAFE_AUTONOMOUS';

export type UserRole = 'ADMIN' | 'INCIDENT_COMMANDER' | 'RESPONDER' | 'VIEWER';

export type ActionStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXECUTING' | 'COMPLETED' | 'FAILED' | 'EXPIRED';

export interface ServiceHealth {
  id: string;
  name: string;
  type: string;
  criticality: string;
  isHealthy: boolean;
  cpu: number;
  memory: number;
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
  requestRate: number;
  errorRate: number;
  activeConnections: number;
  deploymentVersion: string;
  configVersion: string;
  dependencies: string[];
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
}

export interface Hypothesis {
  id: string;
  incidentId: string;
  name: string;
  description: string;
  confidence: number;
  supportingEvidence: Evidence[];
  contradictingEvidence: Evidence[];
  nextDiagnostic?: string;
  status: HypothesisStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Evidence {
  type: 'metric' | 'log' | 'deployment' | 'historical' | 'runbook' | 'config' | 'diagnostic';
  source: string;
  content: string;
  timestamp?: string;
  weight?: number;
}

export interface MemoryResult {
  id?: string;
  content: string;
  relevanceScore?: number;
  metadata?: Record<string, unknown>;
  source: 'hindsight_recall' | 'hindsight_reflect';
}

export interface ActionRequest {
  id: string;
  incidentId: string;
  action: string;
  parameters: Record<string, unknown>;
  reason: string;
  risk: ActionRisk;
  blastRadius: string;
  status: ActionStatus;
  policyDecision: PolicyDecision;
  createdAt: string;
  expiresAt?: string;
  executedAt?: string;
  result?: Record<string, unknown>;
}

export interface SimulatorScenario {
  id: string;
  name: string;
  description: string;
  severity: Severity;
  affectedServices: string[];
  trigger: string;
  symptoms: string[];
  expectedRootCause: string;
}

export interface LLMTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

export interface LLMToolCall {
  id: string;
  type: 'tool_use';
  name: string;
  input: Record<string, unknown>;
}

export interface AgentState {
  incidentId: string;
  agentRunId: string;
  currentStatus: IncidentStatus;
  iteration: number;
  maxIterations: number;
  memoryEnabled: boolean;
  memoryResults: MemoryResult[];
  hypotheses: Hypothesis[];
  diagnostics: Array<{ tool: string; input: unknown; output: unknown }>;
  proposedActions: ActionRequest[];
  investigation: string[];
  startedAt: Date;
}
