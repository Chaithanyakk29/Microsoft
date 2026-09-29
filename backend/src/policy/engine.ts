/**
 * Policy Engine - Deterministic authorization for all agent actions.
 *
 * The LLM cannot bypass this engine. Every action request goes through here.
 * Policy decisions are based on incident context, action type, role, and risk.
 */

import { PolicyDecision, ActionRisk, Severity, UserRole, AutonomyMode } from '../types';

export interface PolicyInput {
  incidentSeverity: Severity;
  actionType: string;
  serviceCriticality: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  estimatedBlastRadius: 'MINIMAL' | 'SERVICE' | 'CLUSTER' | 'REGION' | 'GLOBAL';
  userRole?: UserRole;
  autonomyMode: AutonomyMode;
  approvalStatus?: 'APPROVED' | 'PENDING' | 'REJECTED';
  currentState: string;
  parameters?: Record<string, unknown>;
}

export interface PolicyResult {
  decision: PolicyDecision;
  risk: ActionRisk;
  reason: string;
  requiresApprovalFrom?: UserRole;
  expiresInMinutes?: number;
  prohibited?: boolean;
}

// Action classification table - deterministic mapping
const ACTION_RISK_MAP: Record<string, ActionRisk> = {
  // Read-only operations - always LOW
  getServiceHealth: 'LOW',
  getServiceMetrics: 'LOW',
  getLogs: 'LOW',
  getRecentDeployments: 'LOW',
  getDependencyGraph: 'LOW',
  searchRunbooks: 'LOW',
  searchIncidentMemory: 'LOW',
  reflectOnIncidentHistory: 'LOW',
  createInvestigationNote: 'LOW',
  createHypothesis: 'LOW',
  updateHypothesis: 'LOW',
  createPostmortem: 'LOW',

  // Medium risk operations
  clearCache: 'MEDIUM',
  scaleService: 'MEDIUM',
  proposeAction: 'LOW',
  requestApproval: 'LOW',
  retainIncidentLearning: 'LOW',
  verifyServiceHealth: 'LOW',

  // High risk operations
  restartService: 'HIGH',
  executeRollback: 'HIGH',

  // Dangerous operations - always denied
  dropDatabase: 'DANGEROUS',
  deleteData: 'DANGEROUS',
  shutdownInfrastructure: 'DANGEROUS',
};

// Blast radius by action + service criticality
function estimateBlastRadius(
  action: string,
  serviceCriticality: PolicyInput['serviceCriticality'],
): PolicyInput['estimatedBlastRadius'] {
  if (action === 'restartService') {
    if (serviceCriticality === 'CRITICAL') return 'CLUSTER';
    if (serviceCriticality === 'HIGH') return 'SERVICE';
    return 'SERVICE';
  }
  if (action === 'executeRollback') {
    if (serviceCriticality === 'CRITICAL') return 'REGION';
    return 'SERVICE';
  }
  if (action === 'scaleService') return 'SERVICE';
  if (action === 'clearCache') return 'SERVICE';
  return 'MINIMAL';
}

export function evaluatePolicy(input: PolicyInput): PolicyResult {
  const actionRisk = ACTION_RISK_MAP[input.actionType] ?? 'HIGH';
  const blastRadius =
    input.estimatedBlastRadius || estimateBlastRadius(input.actionType, input.serviceCriticality);

  // DANGEROUS actions are always denied
  if (actionRisk === 'DANGEROUS') {
    return {
      decision: 'DENY',
      risk: 'DANGEROUS',
      reason: `Action "${input.actionType}" is classified as DANGEROUS and is not permitted under any circumstances.`,
      prohibited: true,
    };
  }

  // Read-only, investigation actions always allowed
  if (actionRisk === 'LOW') {
    return {
      decision: 'ALLOW',
      risk: 'LOW',
      reason: `Action "${input.actionType}" is a read-only/investigation operation and is always permitted.`,
    };
  }

  // ADVISORY mode: only investigation allowed, no destructive actions
  if (input.autonomyMode === 'ADVISORY') {
    // At this point actionRisk is MEDIUM, HIGH, or DANGEROUS (LOW was already returned above)
    return {
      decision: 'DENY',
      risk: actionRisk,
      reason: `In ADVISORY mode, only investigation actions are permitted. Action "${input.actionType}" requires APPROVAL_REQUIRED or SAFE_AUTONOMOUS mode.`,
    };
  }

  // SAFE_AUTONOMOUS mode: only LOW risk auto-approved, others need approval
  if (input.autonomyMode === 'SAFE_AUTONOMOUS') {
    if (actionRisk === 'MEDIUM') {
      return {
        decision: 'ALLOW',
        risk: actionRisk,
        reason: `In SAFE_AUTONOMOUS mode, MEDIUM risk action "${input.actionType}" is auto-approved.`,
      };
    }
  }

  // Pre-approved actions can proceed
  if (input.approvalStatus === 'APPROVED') {
    if (actionRisk === 'HIGH' && blastRadius === 'REGION') {
      return {
        decision: 'DENY',
        risk: actionRisk,
        reason: `Action "${input.actionType}" has REGION-level blast radius which exceeds approval scope. Escalation required.`,
      };
    }
    return {
      decision: 'ALLOW',
      risk: actionRisk,
      reason: `Action "${input.actionType}" has been approved by an authorized commander.`,
    };
  }

  // Rejected actions are denied
  if (input.approvalStatus === 'REJECTED') {
    return {
      decision: 'DENY',
      risk: actionRisk,
      reason: `Action "${input.actionType}" was rejected by the approval workflow.`,
    };
  }

  // P1 critical incidents with HIGH risk need commander approval
  if (input.incidentSeverity === 'P1' && actionRisk === 'HIGH') {
    return {
      decision: 'REQUIRES_APPROVAL',
      risk: actionRisk,
      reason: `P1 incident with HIGH risk action "${input.actionType}" affecting ${input.serviceCriticality} criticality service. Requires INCIDENT_COMMANDER approval.`,
      requiresApprovalFrom: 'INCIDENT_COMMANDER',
      expiresInMinutes: 15,
    };
  }

  // Medium risk actions always need approval
  if (actionRisk === 'MEDIUM') {
    return {
      decision: 'REQUIRES_APPROVAL',
      risk: actionRisk,
      reason: `Action "${input.actionType}" is classified as MEDIUM risk and requires approval before execution.`,
      requiresApprovalFrom: 'RESPONDER',
      expiresInMinutes: 30,
    };
  }

  // High risk always needs approval
  if (actionRisk === 'HIGH') {
    return {
      decision: 'REQUIRES_APPROVAL',
      risk: actionRisk,
      reason: `Action "${input.actionType}" is HIGH risk. Requires INCIDENT_COMMANDER approval. Blast radius: ${blastRadius}.`,
      requiresApprovalFrom: 'INCIDENT_COMMANDER',
      expiresInMinutes: 15,
    };
  }

  // Default: require approval for anything not explicitly allowed
  return {
    decision: 'REQUIRES_APPROVAL',
    risk: actionRisk,
    reason: `Action "${input.actionType}" requires approval by default policy.`,
    requiresApprovalFrom: 'RESPONDER',
    expiresInMinutes: 30,
  };
}

/**
 * Check if a user role can approve a given action.
 */
export function canApprove(userRole: UserRole, requiredRole: UserRole): boolean {
  const hierarchy: Record<UserRole, number> = {
    VIEWER: 0,
    RESPONDER: 1,
    INCIDENT_COMMANDER: 2,
    ADMIN: 3,
  };

  return hierarchy[userRole] >= hierarchy[requiredRole];
}

/**
 * Check if a user can perform an action based on their role.
 */
export function checkPermission(
  userRole: UserRole,
  action: 'read' | 'investigate' | 'request_action' | 'approve' | 'configure',
): boolean {
  switch (action) {
    case 'read':
      return true; // All roles can read
    case 'investigate':
      return ['RESPONDER', 'INCIDENT_COMMANDER', 'ADMIN'].includes(userRole);
    case 'request_action':
      return ['RESPONDER', 'INCIDENT_COMMANDER', 'ADMIN'].includes(userRole);
    case 'approve':
      return ['INCIDENT_COMMANDER', 'ADMIN'].includes(userRole);
    case 'configure':
      return userRole === 'ADMIN';
    default:
      return false;
  }
}
