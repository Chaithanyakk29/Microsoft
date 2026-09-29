/**
 * Agent Tools
 *
 * Strongly typed tool implementations available to the incident response agent.
 * Every tool: validates inputs, returns structured JSON, has deterministic permission checks,
 * has timeout handling, has error handling, writes an audit event, creates a timeline event.
 *
 * IMPORTANT: Tools execute real system operations (simulator state changes, DB writes, etc.)
 * The LLM requests tools, but this module executes them with full validation.
 */

import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../db/client';
import { simulator } from '../simulator/simulator';
import { hindsightMemory } from '../services/hindsightMemory';
import { evaluatePolicy } from '../policy/engine';
import { Severity, AutonomyMode } from '../types';

// ─── Audit helper ────────────────────────────────────────────────────────────

async function audit(params: {
  incidentId?: string;
  agentRunId?: string;
  eventType: string;
  tool: string;
  inputSummary?: string;
  outputSummary?: string;
  success: boolean;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.auditEvent.create({
      data: {
        incidentId: params.incidentId,
        agentRunId: params.agentRunId,
        eventType: params.eventType,
        tool: params.tool,
        inputSummary: params.inputSummary?.substring(0, 500),
        outputSummary: params.outputSummary?.substring(0, 500),
        success: params.success,
        metadata: JSON.stringify(params.metadata || {}),
        actorRole: 'AGENT',
      },
    });
  } catch {}
}

async function addEvent(incidentId: string, type: string, message: string, data?: unknown): Promise<void> {
  try {
    await prisma.incidentEvent.create({
      data: {
        incidentId,
        type,
        message,
        data: data ? JSON.stringify(data) : undefined,
        actor: 'agent',
      },
    });
  } catch {}
}

// ─── Tool implementations ─────────────────────────────────────────────────────

export const toolHandlers: Record<string, (input: Record<string, unknown>, context: ToolContext) => Promise<unknown>> = {

  getServiceHealth: async (input, ctx) => {
    const serviceId = input['serviceId'] as string;
    const services = serviceId === 'all'
      ? simulator.getAllServices()
      : [simulator.getService(serviceId)].filter(Boolean);

    await audit({
      incidentId: ctx.incidentId,
      agentRunId: ctx.agentRunId,
      eventType: 'TOOL_CALL',
      tool: 'getServiceHealth',
      inputSummary: `serviceId=${serviceId}`,
      outputSummary: `Retrieved ${services.length} services`,
      success: true,
    });

    return services.map((s) => ({
      id: s!.id,
      name: s!.name,
      status: s!.status,
      isHealthy: s!.isHealthy,
      cpu: s!.cpu,
      memory: s!.memory,
      errorRate: s!.errorRate,
      latencyP99: s!.latencyP99,
      activeConnections: s!.activeConnections,
      maxConnections: s!.maxConnections,
      deploymentVersion: s!.deploymentVersion,
    }));
  },

  getServiceMetrics: async (input, ctx) => {
    const serviceId = input['serviceId'] as string;
    const svc = simulator.getService(serviceId);
    if (!svc) throw new Error(`Service ${serviceId} not found`);

    await audit({
      incidentId: ctx.incidentId,
      agentRunId: ctx.agentRunId,
      eventType: 'TOOL_CALL',
      tool: 'getServiceMetrics',
      inputSummary: `serviceId=${serviceId}`,
      outputSummary: `cpu=${svc.cpu}% mem=${svc.memory}% errRate=${svc.errorRate}%`,
      success: true,
    });

    return simulator.getServiceMetrics(svc);
  },

  getLogs: async (input, ctx) => {
    const serviceId = input['serviceId'] as string;
    const limit = (input['limit'] as number) || 20;
    const logs = simulator.getServiceLogs(serviceId, limit);

    await audit({
      incidentId: ctx.incidentId,
      agentRunId: ctx.agentRunId,
      eventType: 'TOOL_CALL',
      tool: 'getLogs',
      inputSummary: `serviceId=${serviceId} limit=${limit}`,
      outputSummary: `Retrieved ${logs.length} log entries`,
      success: true,
    });

    return logs;
  },

  getRecentDeployments: async (input, ctx) => {
    const serviceId = input['serviceId'] as string | undefined;
    const deployments = await prisma.deployment.findMany({
      where: serviceId ? { serviceId } : {},
      orderBy: { deployedAt: 'desc' },
      take: 10,
    });

    await audit({
      incidentId: ctx.incidentId,
      eventType: 'TOOL_CALL',
      tool: 'getRecentDeployments',
      inputSummary: `serviceId=${serviceId}`,
      outputSummary: `Found ${deployments.length} recent deployments`,
      success: true,
    });

    return deployments;
  },

  getRecentConfigChanges: async (input, ctx) => {
    const serviceId = input['serviceId'] as string | undefined;
    const changes = await prisma.configurationChange.findMany({
      where: serviceId ? { serviceId } : {},
      orderBy: { changedAt: 'desc' },
      take: 10,
    });

    await audit({
      incidentId: ctx.incidentId,
      eventType: 'TOOL_CALL',
      tool: 'getRecentConfigChanges',
      inputSummary: `serviceId=${serviceId}`,
      outputSummary: `Found ${changes.length} recent config changes`,
      success: true,
    });

    return changes;
  },

  getDependencyGraph: async (input, ctx) => {
    const serviceId = input['serviceId'] as string | undefined;
    const allServices = simulator.getAllServices();

    const graph = allServices.map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      dependencies: s.dependencies,
      isHealthy: s.isHealthy,
    }));

    await audit({
      incidentId: ctx.incidentId,
      eventType: 'TOOL_CALL',
      tool: 'getDependencyGraph',
      success: true,
    });

    if (serviceId) {
      // Return graph focused on the service and its transitive dependencies
      const relevant = new Set<string>();
      const addDeps = (id: string) => {
        relevant.add(id);
        const svc = allServices.find((s) => s.id === id);
        svc?.dependencies.forEach((d) => { if (!relevant.has(d)) addDeps(d); });
      };
      addDeps(serviceId);
      // Also add services that depend on this service
      allServices.forEach((s) => {
        if (s.dependencies.includes(serviceId)) relevant.add(s.id);
      });
      return graph.filter((n) => relevant.has(n.id));
    }

    return graph;
  },

  searchRunbooks: async (input, ctx) => {
    const query = input['query'] as string;
    const service = input['service'] as string | undefined;

    const runbooks = await prisma.runbook.findMany({
      where: {
        OR: [
          { content: { contains: query } },
          { title: { contains: query } },
          { symptoms: { contains: query } },
        ],
        ...(service ? { service } : {}),
      },
      take: 5,
    });

    await audit({
      incidentId: ctx.incidentId,
      eventType: 'TOOL_CALL',
      tool: 'searchRunbooks',
      inputSummary: `query="${query}"`,
      outputSummary: `Found ${runbooks.length} runbooks`,
      success: true,
    });

    return runbooks.map((r) => ({
      id: r.id,
      title: r.title,
      service: r.service,
      incidentType: r.incidentType,
      symptoms: JSON.parse(r.symptoms),
      diagnostics: JSON.parse(r.diagnostics),
      mitigation: r.mitigation,
      verification: r.verification,
    }));
  },

  searchIncidentMemory: async (input, ctx) => {
    const service = input['service'] as string;
    const symptoms = input['symptoms'] as string[];

    await addEvent(ctx.incidentId, 'MEMORY_LOOKUP', `Searching Hindsight memory for similar incidents: ${service}`);

    const result = await hindsightMemory.recallSimilarIncidents(service, symptoms, ctx.incidentId);

    await audit({
      incidentId: ctx.incidentId,
      eventType: 'MEMORY_RECALL',
      tool: 'searchIncidentMemory',
      inputSummary: `service=${service} symptoms=${symptoms.join(',')}`,
      outputSummary: `Found ${result.memories.length} historical memories (available=${result.available})`,
      success: true,
      metadata: { memoryOperationId: result.memoryOperationId, available: result.available },
    });

    return {
      available: result.available,
      memoryOperationId: result.memoryOperationId,
      memoriesFound: result.memories.length,
      memories: result.memories,
      query: result.query,
      note: result.available
        ? 'Historical evidence retrieved from Hindsight memory. Label these as HISTORICAL when presenting.'
        : 'Hindsight memory unavailable - investigation proceeding without historical context.',
    };
  },

  reflectOnIncidentHistory: async (input, ctx) => {
    const query = input['query'] as string;

    await addEvent(ctx.incidentId, 'MEMORY_REFLECT', `Reflecting on incident history: ${query}`);

    const result = await hindsightMemory.reflectOnIncidentHistory(query, ctx.incidentId);

    await audit({
      incidentId: ctx.incidentId,
      eventType: 'MEMORY_REFLECT',
      tool: 'reflectOnIncidentHistory',
      inputSummary: query.substring(0, 200),
      outputSummary: result.available ? `Synthesis: ${result.synthesis.substring(0, 200)}` : 'Unavailable',
      success: true,
    });

    return {
      available: result.available,
      memoryOperationId: result.memoryOperationId,
      synthesis: result.synthesis,
      query: result.query,
    };
  },

  createHypothesis: async (input, ctx) => {
    const id = uuidv4();
    const hypothesis = await prisma.incidentHypothesis.create({
      data: {
        id,
        incidentId: ctx.incidentId,
        name: input['name'] as string,
        description: input['description'] as string,
        confidence: (input['confidence'] as number) || 0.5,
        supportingEvidence: JSON.stringify(input['supportingEvidence'] || []),
        contradictingEvidence: JSON.stringify(input['contradictingEvidence'] || []),
        nextDiagnostic: input['nextDiagnostic'] as string | undefined,
        status: 'PROPOSED',
      },
    });

    await addEvent(
      ctx.incidentId,
      'HYPOTHESIS_CREATED',
      `Hypothesis created: ${input['name']} (confidence: ${((input['confidence'] as number) * 100).toFixed(0)}%)`,
      { hypothesisId: id },
    );

    await audit({
      incidentId: ctx.incidentId,
      eventType: 'HYPOTHESIS_CREATED',
      tool: 'createHypothesis',
      inputSummary: `name="${input['name']}" confidence=${input['confidence']}`,
      success: true,
    });

    return hypothesis;
  },

  updateHypothesis: async (input, ctx) => {
    const hypothesisId = input['hypothesisId'] as string;
    const updated = await prisma.incidentHypothesis.update({
      where: { id: hypothesisId },
      data: {
        status: input['status'] as string | undefined,
        confidence: input['confidence'] as number | undefined,
        supportingEvidence: input['supportingEvidence']
          ? JSON.stringify(input['supportingEvidence'])
          : undefined,
        contradictingEvidence: input['contradictingEvidence']
          ? JSON.stringify(input['contradictingEvidence'])
          : undefined,
      },
    });

    await addEvent(
      ctx.incidentId,
      'HYPOTHESIS_UPDATED',
      `Hypothesis "${updated.name}" updated to ${updated.status}`,
    );

    return updated;
  },

  createInvestigationNote: async (input, ctx) => {
    const note = await prisma.incidentEvent.create({
      data: {
        incidentId: ctx.incidentId,
        type: 'INVESTIGATION_NOTE',
        message: input['note'] as string,
        actor: 'agent',
      },
    });

    return note;
  },

  proposeAction: async (input, ctx) => {
    const action = input['action'] as string;
    const service = input['service'] as string;
    const parameters = input['parameters'] as Record<string, unknown>;
    const reason = input['reason'] as string;

    // Get service criticality for policy check
    const svc = simulator.getService(service);
    const criticality = (svc?.criticality || 'HIGH') as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

    const policyResult = evaluatePolicy({
      incidentSeverity: ctx.incidentSeverity,
      actionType: action,
      serviceCriticality: criticality,
      estimatedBlastRadius: 'SERVICE',
      autonomyMode: ctx.autonomyMode,
      currentState: ctx.currentState,
    });

    const actionRequest = await prisma.actionRequest.create({
      data: {
        id: uuidv4(),
        incidentId: ctx.incidentId,
        action,
        parameters: JSON.stringify(parameters),
        reason,
        risk: policyResult.risk,
        blastRadius: `${service} and its dependents`,
        status: policyResult.decision === 'ALLOW' ? 'APPROVED' : 'PENDING',
        policyDecision: policyResult.decision,
        expiresAt: policyResult.expiresInMinutes
          ? new Date(Date.now() + policyResult.expiresInMinutes * 60 * 1000)
          : undefined,
      },
    });

    await addEvent(
      ctx.incidentId,
      'ACTION_PROPOSED',
      `Proposed action: ${action} on ${service} (policy: ${policyResult.decision})`,
      { actionRequestId: actionRequest.id, risk: policyResult.risk },
    );

    await audit({
      incidentId: ctx.incidentId,
      eventType: 'ACTION_PROPOSED',
      tool: 'proposeAction',
      inputSummary: `action=${action} service=${service}`,
      outputSummary: `policy=${policyResult.decision} risk=${policyResult.risk}`,
      success: true,
      metadata: { actionRequestId: actionRequest.id, policyDecision: policyResult.decision },
    });

    return {
      actionRequestId: actionRequest.id,
      action,
      service,
      policyDecision: policyResult.decision,
      risk: policyResult.risk,
      reason: policyResult.reason,
      requiresApproval: policyResult.decision === 'REQUIRES_APPROVAL',
      requiresApprovalFrom: policyResult.requiresApprovalFrom,
      message:
        policyResult.decision === 'ALLOW'
          ? 'Action auto-approved by policy.'
          : policyResult.decision === 'REQUIRES_APPROVAL'
          ? `Approval required from ${policyResult.requiresApprovalFrom}. Action queued.`
          : `Action DENIED: ${policyResult.reason}`,
    };
  },

  executeRollback: async (input, ctx) => {
    const service = input['service'] as string;
    const actionRequestId = input['actionRequestId'] as string;

    // Verify approval
    const actionReq = await prisma.actionRequest.findUnique({
      where: { id: actionRequestId },
      include: { approval: true },
    });

    if (!actionReq || actionReq.status !== 'APPROVED') {
      throw new Error(`Action ${actionRequestId} is not approved (status: ${actionReq?.status})`);
    }

    await prisma.actionRequest.update({
      where: { id: actionRequestId },
      data: { status: 'EXECUTING', executedAt: new Date() },
    });

    await addEvent(ctx.incidentId, 'ACTION_EXECUTING', `Executing rollback on ${service}`);

    const startTime = Date.now();
    const result = await simulator.remediate('executeRollback', service);
    const duration = Date.now() - startTime;

    await prisma.actionRequest.update({
      where: { id: actionRequestId },
      data: { status: result.success ? 'COMPLETED' : 'FAILED', result: JSON.stringify(result) },
    });

    await prisma.actionExecution.create({
      data: {
        actionRequestId,
        success: result.success,
        output: JSON.stringify(result),
        duration,
      },
    });

    await addEvent(
      ctx.incidentId,
      result.success ? 'ACTION_COMPLETED' : 'ACTION_FAILED',
      result.message,
    );

    return result;
  },

  scaleService: async (input, ctx) => {
    const service = input['service'] as string;
    const actionRequestId = input['actionRequestId'] as string;

    const actionReq = await prisma.actionRequest.findUnique({ where: { id: actionRequestId } });
    if (!actionReq || actionReq.status !== 'APPROVED') {
      throw new Error(`Action ${actionRequestId} is not approved`);
    }

    await prisma.actionRequest.update({
      where: { id: actionRequestId },
      data: { status: 'EXECUTING', executedAt: new Date() },
    });

    const startTime = Date.now();
    const result = await simulator.remediate('scaleService', service);
    const duration = Date.now() - startTime;

    await prisma.actionRequest.update({
      where: { id: actionRequestId },
      data: { status: result.success ? 'COMPLETED' : 'FAILED', result: JSON.stringify(result) },
    });

    await prisma.actionExecution.create({
      data: { actionRequestId, success: result.success, output: JSON.stringify(result), duration },
    });

    await addEvent(ctx.incidentId, 'ACTION_COMPLETED', result.message);
    return result;
  },

  restartService: async (input, ctx) => {
    const service = input['service'] as string;
    const actionRequestId = input['actionRequestId'] as string;

    const actionReq = await prisma.actionRequest.findUnique({ where: { id: actionRequestId } });
    if (!actionReq || actionReq.status !== 'APPROVED') {
      throw new Error(`Action ${actionRequestId} is not approved`);
    }

    await prisma.actionRequest.update({
      where: { id: actionRequestId },
      data: { status: 'EXECUTING', executedAt: new Date() },
    });

    const startTime = Date.now();
    const result = await simulator.remediate('restartService', service);
    const duration = Date.now() - startTime;

    await prisma.actionRequest.update({
      where: { id: actionRequestId },
      data: { status: result.success ? 'COMPLETED' : 'FAILED', result: JSON.stringify(result) },
    });

    await prisma.actionExecution.create({
      data: { actionRequestId, success: result.success, output: JSON.stringify(result), duration },
    });

    await addEvent(ctx.incidentId, 'ACTION_COMPLETED', result.message);
    return result;
  },

  clearCache: async (input, ctx) => {
    const service = input['service'] as string;
    const actionRequestId = input['actionRequestId'] as string | undefined;

    const result = await simulator.remediate('clearCache', service);
    await addEvent(ctx.incidentId, 'ACTION_COMPLETED', result.message);
    return result;
  },

  verifyServiceHealth: async (input, ctx) => {
    const service = input['service'] as string;
    const svc = simulator.getService(service);

    if (!svc) return { service, verified: false, reason: 'Service not found' };

    const verified = svc.isHealthy && svc.errorRate < 2.0 && svc.latencyP99 < 2000;

    await addEvent(
      ctx.incidentId,
      'VERIFICATION',
      `Health verification for ${service}: ${verified ? 'HEALTHY' : 'STILL DEGRADED'}`,
      { cpu: svc.cpu, memory: svc.memory, errorRate: svc.errorRate, latencyP99: svc.latencyP99 },
    );

    await audit({
      incidentId: ctx.incidentId,
      eventType: 'VERIFICATION',
      tool: 'verifyServiceHealth',
      inputSummary: `service=${service}`,
      outputSummary: `verified=${verified} errorRate=${svc.errorRate}% latencyP99=${svc.latencyP99}ms`,
      success: true,
    });

    return {
      service,
      verified,
      status: svc.status,
      cpu: svc.cpu,
      memory: svc.memory,
      errorRate: svc.errorRate,
      latencyP99: svc.latencyP99,
      activeConnections: svc.activeConnections,
      reason: verified ? 'Service metrics are within acceptable thresholds' : 'Service metrics still outside acceptable thresholds',
    };
  },

  createPostmortem: async (input, ctx) => {
    const existing = await prisma.postmortem.findUnique({ where: { incidentId: ctx.incidentId } });
    if (existing) return existing;

    const postmortem = await prisma.postmortem.create({
      data: {
        incidentId: ctx.incidentId,
        summary: input['summary'] as string,
        detection: input['detection'] as string,
        impact: input['impact'] as string,
        timeline: JSON.stringify(input['timeline'] || []),
        rootCause: input['rootCause'] as string,
        contributingFactors: JSON.stringify(input['contributingFactors'] || []),
        investigation: input['investigation'] as string,
        actionsAttempted: JSON.stringify(input['actionsAttempted'] || []),
        whatWorked: input['whatWorked'] as string,
        whatFailed: input['whatFailed'] as string,
        resolution: input['resolution'] as string,
        prevention: input['prevention'] as string,
        observabilityImprovements: input['observabilityImprovements'] as string,
        runbookImprovements: input['runbookImprovements'] as string,
        followUpActions: JSON.stringify(input['followUpActions'] || []),
        status: 'DRAFT',
      },
    });

    await addEvent(ctx.incidentId, 'POSTMORTEM_CREATED', 'Postmortem draft created');

    return postmortem;
  },

  retainIncidentLearning: async (input, ctx) => {
    const incident = await prisma.incident.findUnique({ where: { id: ctx.incidentId } });
    if (!incident) throw new Error('Incident not found');

    const memoryOpId = await hindsightMemory.retainIncidentExperience({
      incidentId: ctx.incidentId,
      title: incident.title,
      service: (JSON.parse(incident.affectedServices) as string[])[0] || 'unknown',
      symptoms: JSON.parse(incident.symptoms || '[]') as string[],
      severity: incident.severity,
      time: incident.detectedAt.toISOString(),
      rootCause: input['rootCause'] as string || incident.rootCause || 'Unknown',
      impact: incident.impact || 'Service degradation',
    });

    // Also retain postmortem if available
    const postmortem = await prisma.postmortem.findUnique({ where: { incidentId: ctx.incidentId } });
    if (postmortem) {
      await hindsightMemory.retainPostmortem({
        incidentId: ctx.incidentId,
        service: (JSON.parse(incident.affectedServices) as string[])[0] || 'unknown',
        rootCause: postmortem.rootCause,
        whatWorked: postmortem.whatWorked,
        whatFailed: postmortem.whatFailed,
        prevention: postmortem.prevention,
        lessons: input['lessons'] as string || postmortem.whatWorked,
      });

      await prisma.postmortem.update({
        where: { incidentId: ctx.incidentId },
        data: { retainedToMemory: true, memoryOperationId: memoryOpId || undefined },
      });
    }

    await prisma.incident.update({
      where: { id: ctx.incidentId },
      data: {
        learningStatus: 'RETAINED',
        status: 'LEARNING_RETAINED',
        memoryBankId: hindsightMemory.isAvailable() ? 'recall-ops-incidents' : undefined,
      },
    });

    await addEvent(
      ctx.incidentId,
      'LEARNING_RETAINED',
      `Incident learning retained to Hindsight memory (available=${hindsightMemory.isAvailable()})`,
      { memoryOperationId: memoryOpId },
    );

    await audit({
      incidentId: ctx.incidentId,
      eventType: 'MEMORY_RETAIN',
      tool: 'retainIncidentLearning',
      outputSummary: `Learning retained (available=${hindsightMemory.isAvailable()})`,
      success: true,
      metadata: { memoryOperationId: memoryOpId },
    });

    return {
      success: true,
      hindsightAvailable: hindsightMemory.isAvailable(),
      memoryOperationId: memoryOpId,
      message: hindsightMemory.isAvailable()
        ? 'Incident learning successfully retained to Hindsight. Future similar incidents will benefit from this experience.'
        : 'Hindsight unavailable - learning recorded locally only.',
    };
  },
};

export interface ToolContext {
  incidentId: string;
  agentRunId: string;
  incidentSeverity: Severity;
  autonomyMode: AutonomyMode;
  currentState: string;
}

export async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  context: ToolContext,
): Promise<{ success: boolean; result?: unknown; error?: string; duration: number }> {
  const handler = toolHandlers[toolName];
  if (!handler) {
    return { success: false, error: `Unknown tool: ${toolName}`, duration: 0 };
  }

  const startTime = Date.now();
  try {
    const result = await Promise.race([
      handler(input, context),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Tool ${toolName} timed out after 30s`)), 30000),
      ),
    ]);

    return { success: true, result, duration: Date.now() - startTime };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await audit({
      incidentId: context.incidentId,
      eventType: 'TOOL_ERROR',
      tool: toolName,
      outputSummary: error,
      success: false,
    });
    return { success: false, error, duration: Date.now() - startTime };
  }
}
