/**
 * Incident Response Agent Orchestrator
 *
 * This is the heart of RECALL OPS. It implements the deterministic incident state machine
 * and orchestrates the LLM agent through hypothesis-driven investigation.
 *
 * Architecture:
 * - State machine controls incident lifecycle (LLM cannot change state directly)
 * - LLM is only called for reasoning, planning, and tool selection
 * - All tool calls go through the validated tool executor
 * - Hindsight memory is retrieved early and fed as evidence into LLM context
 * - Policy engine gates all actions
 * - Full audit trail is maintained
 *
 * SSE broadcasts allow real-time observation in the UI.
 */

import { v4 as uuidv4 } from 'uuid';
import { Response } from 'express';
import { prisma } from '../db/client';
import { llmProvider, LLMMessage } from '../services/llmProvider';
import { hindsightMemory } from '../services/hindsightMemory';
import { executeTool, ToolContext } from '../tools/tools';
import { TOOL_DEFINITIONS } from '../tools/schemas';
import { config } from '../config';
import {
  AgentState,
  IncidentStatus,
  Severity,
  AutonomyMode,
} from '../types';

// ─── SSE Event Bus (in-memory for demo; production would use Redis pub/sub) ──

const sseClients = new Map<string, Response[]>();

export function registerSSEClient(incidentId: string, res: Response): void {
  const clients = sseClients.get(incidentId) || [];
  clients.push(res);
  sseClients.set(incidentId, clients);
}

export function unregisterSSEClient(incidentId: string, res: Response): void {
  const clients = sseClients.get(incidentId) || [];
  sseClients.set(incidentId, clients.filter((c) => c !== res));
}

function broadcast(incidentId: string, event: string, data: unknown): void {
  const clients = sseClients.get(incidentId) || [];
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    try {
      client.write(payload);
    } catch {}
  }
}

// ─── State Machine Transitions ────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  DETECTED: ['TRIAGING'],
  TRIAGING: ['CONTEXT_GATHERING', 'ESCALATED', 'FAILED'],
  CONTEXT_GATHERING: ['MEMORY_LOOKUP', 'HYPOTHESIS_FORMATION', 'FAILED'],
  MEMORY_LOOKUP: ['HYPOTHESIS_FORMATION', 'FAILED'],
  HYPOTHESIS_FORMATION: ['HYPOTHESIS_VALIDATION', 'ACTION_PLANNING', 'FAILED'],
  HYPOTHESIS_VALIDATION: ['HYPOTHESIS_VALIDATION', 'ACTION_PLANNING', 'ESCALATED', 'FAILED'],
  ACTION_PLANNING: ['SAFETY_REVIEW', 'AWAITING_APPROVAL', 'FAILED'],
  SAFETY_REVIEW: ['AWAITING_APPROVAL', 'EXECUTING', 'FAILED'],
  AWAITING_APPROVAL: ['EXECUTING', 'FAILED', 'ESCALATED'],
  EXECUTING: ['VERIFYING', 'FAILED'],
  VERIFYING: ['RESOLVED', 'EXECUTING', 'FAILED', 'ESCALATED'],
  RESOLVED: ['POSTMORTEM'],
  POSTMORTEM: ['LEARNING_RETAINED'],
  LEARNING_RETAINED: [],
  FAILED: ['TRIAGING'],
  ESCALATED: ['TRIAGING'],
};

async function transitionState(
  incidentId: string,
  from: IncidentStatus,
  to: IncidentStatus,
  reason?: string,
): Promise<boolean> {
  const valid = VALID_TRANSITIONS[from]?.includes(to);
  if (!valid) {
    console.warn(`[Agent] Invalid transition: ${from} -> ${to}`);
    return false;
  }

  await prisma.incident.update({
    where: { id: incidentId },
    data: { status: to },
  });

  await prisma.incidentEvent.create({
    data: {
      incidentId,
      type: 'STATE_CHANGE',
      message: `Status changed: ${from} → ${to}${reason ? ` (${reason})` : ''}`,
      actor: 'agent',
    },
  });

  broadcast(incidentId, 'state_change', { from, to, timestamp: new Date().toISOString() });
  return true;
}

// ─── System Prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(incident: { title: string; severity: string; affectedServices: string; symptoms: string }, memoryEnabled: boolean): string {
  return `You are RECALL OPS, an expert Site Reliability Engineer AI agent conducting an incident investigation.

INCIDENT: ${incident.title}
SEVERITY: ${incident.severity}
AFFECTED SERVICES: ${incident.affectedServices}
SYMPTOMS: ${incident.symptoms}
MEMORY: ${memoryEnabled ? 'ENABLED - Hindsight persistent memory is available' : 'DISABLED - No historical context available'}

## Your Investigation Protocol

1. **Gather Evidence First**: Use getServiceHealth (all), getLogs, getRecentDeployments, getRecentConfigChanges
2. **Retrieve Memory**: Always use searchIncidentMemory early. Historical evidence MUST be labeled [HISTORICAL] when referenced.
3. **Form Hypotheses**: Use createHypothesis for each plausible root cause with confidence scores
4. **Validate**: Use diagnostic tools to gather evidence for/against each hypothesis
5. **Propose Action**: Use proposeAction (policy engine will determine approval requirements)
6. **Verify**: After execution, use verifyServiceHealth
7. **Postmortem**: Use createPostmortem after resolution
8. **Retain Learning**: Use retainIncidentLearning as the final step

## Critical Rules

- NEVER claim historical evidence without explicitly retrieving it from searchIncidentMemory
- ALWAYS label historical evidence as [HISTORICAL] vs current evidence [CURRENT]
- NEVER try to execute actions directly - always use proposeAction first
- NEVER bypass the policy engine - if it requires approval, wait for it
- If hypothesis confidence < 0.4, mark as REJECTED and continue investigating
- Provide clear reasoning for each decision

## Evidence Attribution

When presenting evidence, always cite the source:
- [CURRENT] for real-time metrics and logs
- [HISTORICAL] for Hindsight memory results
- [RUNBOOK] for runbook knowledge

Be concise in tool calls but thorough in analysis.`;
}

// ─── Main Agent Orchestrator ──────────────────────────────────────────────────

export async function runIncidentAgent(
  incidentId: string,
  options: {
    memoryEnabled?: boolean;
    maxIterations?: number;
    sseResponse?: Response;
  } = {},
): Promise<{ success: boolean; finalStatus: IncidentStatus; agentRunId: string }> {
  const memoryEnabled = options.memoryEnabled ?? config.hindsightEnabled;
  const maxIterations = options.maxIterations ?? config.agentMaxIterations;

  const agentRunId = uuidv4();

  // Load incident
  const incident = await prisma.incident.findUnique({ where: { id: incidentId } });
  if (!incident) {
    throw new Error(`Incident ${incidentId} not found`);
  }

  // Create agent run record
  await prisma.agentRun.create({
    data: {
      id: agentRunId,
      incidentId,
      status: 'RUNNING',
      toolCalls: JSON.stringify([]),
      memoryOps: JSON.stringify([]),
    },
  });

  await prisma.incident.update({
    where: { id: incidentId },
    data: { agentRunId },
  });

  console.log(`[Agent] Starting run ${agentRunId} for incident ${incidentId} (memory=${memoryEnabled})`);

  if (options.sseResponse) {
    registerSSEClient(incidentId, options.sseResponse);
  }

  broadcast(incidentId, 'agent_started', { agentRunId, memoryEnabled });

  const agentState: AgentState = {
    incidentId,
    agentRunId,
    currentStatus: incident.status as IncidentStatus,
    iteration: 0,
    maxIterations,
    memoryEnabled,
    memoryResults: [],
    hypotheses: [],
    diagnostics: [],
    proposedActions: [],
    investigation: [],
    startedAt: new Date(),
  };

  const toolContext: ToolContext = {
    incidentId,
    agentRunId,
    incidentSeverity: incident.severity as Severity,
    autonomyMode: incident.autonomyMode as AutonomyMode,
    currentState: incident.status,
  };

  try {
    // ── Phase 1: Triage ────────────────────────────────────────────────────

    await transitionState(incidentId, 'DETECTED', 'TRIAGING');
    broadcast(incidentId, 'agent_event', {
      type: 'TRIAGE',
      message: `Incident triaged as ${incident.severity}. Starting investigation.`,
      timestamp: new Date().toISOString(),
    });

    // ── Phase 2: Context gathering with Hindsight memory ──────────────────

    await transitionState(incidentId, 'TRIAGING', 'CONTEXT_GATHERING');
    await transitionState(incidentId, 'CONTEXT_GATHERING', 'MEMORY_LOOKUP');

    let hindsightContext = '';

    if (memoryEnabled) {
      broadcast(incidentId, 'agent_event', {
        type: 'MEMORY_LOOKUP',
        message: 'Querying Hindsight for similar historical incidents...',
        timestamp: new Date().toISOString(),
      });

      const affectedServices = JSON.parse(incident.affectedServices) as string[];
      const symptoms = JSON.parse(incident.symptoms || '[]') as string[];
      const primaryService = affectedServices[0] || 'unknown';

      // Parallel memory queries
      const [recallResult, reflectResult] = await Promise.all([
        hindsightMemory.recallSimilarIncidents(primaryService, symptoms, incidentId),
        hindsightMemory.reflectOnIncidentHistory(
          `What commonly causes ${primaryService} failures? What remediation actions have worked?`,
          incidentId,
        ),
      ]);

      agentState.memoryResults = recallResult.memories;

      if (recallResult.available && recallResult.memories.length > 0) {
        hindsightContext = `\n\n## HISTORICAL MEMORY (from Hindsight)\nThe following historical incidents are relevant [label as HISTORICAL]:\n${recallResult.memories.map((m) => m.content).join('\n---\n')}`;

        if (reflectResult.available && reflectResult.synthesis) {
          hindsightContext += `\n\n## REFLECTION (Hindsight pattern synthesis):\n${reflectResult.synthesis}`;
        }

        broadcast(incidentId, 'memory_retrieved', {
          memoriesFound: recallResult.memories.length,
          memoryOperationId: recallResult.memoryOperationId,
          memories: recallResult.memories,
          reflection: reflectResult.synthesis,
          available: true,
        });
      } else if (!recallResult.available) {
        broadcast(incidentId, 'memory_retrieved', {
          memoriesFound: 0,
          available: false,
          message: 'Hindsight memory unavailable - proceeding without historical context',
        });
      } else {
        broadcast(incidentId, 'memory_retrieved', {
          memoriesFound: 0,
          available: true,
          message: 'No similar historical incidents found in Hindsight memory',
        });
      }
    } else {
      broadcast(incidentId, 'memory_retrieved', {
        memoriesFound: 0,
        available: false,
        message: 'Memory disabled for this run (A/B comparison mode)',
      });
    }

    // ── Phase 3: LLM-driven investigation loop ────────────────────────────

    await transitionState(incidentId, 'MEMORY_LOOKUP', 'HYPOTHESIS_FORMATION');

    const systemPrompt = buildSystemPrompt(
      {
        title: incident.title,
        severity: incident.severity,
        affectedServices: incident.affectedServices,
        symptoms: incident.symptoms || '[]',
      },
      memoryEnabled && agentState.memoryResults.length > 0,
    );

    const messages: LLMMessage[] = [
      {
        role: 'user',
        content: `Incident detected: ${incident.title}

Severity: ${incident.severity}
Description: ${incident.description}
Affected Services: ${incident.affectedServices}
Reported Symptoms: ${incident.symptoms || '[]'}${hindsightContext}

Begin your hypothesis-driven investigation. Start by gathering current system evidence, then form and validate hypotheses, then propose a remediation action.`,
      },
    ];

    let resolvedViaAgent = false;
    const toolCallLog: Array<{ name: string; input: unknown; result: unknown; duration: number }> = [];

    // Main agent loop
    while (agentState.iteration < maxIterations) {
      agentState.iteration++;

      broadcast(incidentId, 'agent_thinking', {
        iteration: agentState.iteration,
        timestamp: new Date().toISOString(),
      });

      let llmResponse;
      try {
        llmResponse = await llmProvider.call({
          systemPrompt,
          messages,
          tools: TOOL_DEFINITIONS,
          maxTokens: 4096,
        });
      } catch (llmErr) {
        const error = llmErr instanceof Error ? llmErr.message : String(llmErr);
        console.error(`[Agent] LLM call failed:`, error);

        await prisma.incidentEvent.create({
          data: {
            incidentId,
            type: 'ERROR',
            message: `LLM call failed: ${error}. Entering degraded investigation mode.`,
            actor: 'agent',
          },
        });

        broadcast(incidentId, 'agent_error', { error, iteration: agentState.iteration });

        // Retry once after brief delay
        if (agentState.iteration < 3) {
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        break;
      }

      // Add LLM response to message history
      if (llmResponse.toolCalls.length > 0) {
        const contentBlocks: Array<{ type: string; id?: string; name?: string; input?: unknown; text?: string }> = [];
        if (llmResponse.content) {
          contentBlocks.push({ type: 'text', text: llmResponse.content });
        }
        for (const tc of llmResponse.toolCalls) {
          contentBlocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
        }
        messages.push({ role: 'assistant', content: contentBlocks });
      } else {
        messages.push({ role: 'assistant', content: llmResponse.content });
      }

      if (llmResponse.content) {
        agentState.investigation.push(llmResponse.content);
        broadcast(incidentId, 'agent_reasoning', {
          content: llmResponse.content,
          iteration: agentState.iteration,
        });
      }

      // Process tool calls
      if (llmResponse.toolCalls.length === 0) {
        // Agent has finished reasoning
        if (llmResponse.stopReason === 'end_turn') {
          console.log(`[Agent] Investigation complete at iteration ${agentState.iteration}`);
          break;
        }
        continue;
      }

      const toolResults: Array<{ type: string; tool_use_id: string; content: string }> = [];

      for (const toolCall of llmResponse.toolCalls) {
        broadcast(incidentId, 'tool_call', {
          tool: toolCall.name,
          input: toolCall.input,
          iteration: agentState.iteration,
          timestamp: new Date().toISOString(),
        });

        const execution = await executeTool(toolCall.name, toolCall.input, toolContext);

        toolCallLog.push({
          name: toolCall.name,
          input: toolCall.input,
          result: execution.result,
          duration: execution.duration,
        });

        broadcast(incidentId, 'tool_result', {
          tool: toolCall.name,
          success: execution.success,
          duration: execution.duration,
          result: execution.result,
          error: execution.error,
          timestamp: new Date().toISOString(),
        });

        const resultContent = execution.success
          ? JSON.stringify(execution.result)
          : `ERROR: ${execution.error}`;

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolCall.id,
          content: resultContent,
        });

        // Check if this was a resolution action
        if (['executeRollback', 'scaleService', 'restartService', 'clearCache'].includes(toolCall.name)) {
          if (execution.success && (execution.result as { success: boolean }).success) {
            // Transition to verifying
            const currentStatus = (await prisma.incident.findUnique({ where: { id: incidentId } }))!.status as IncidentStatus;
            if (!['VERIFYING', 'RESOLVED'].includes(currentStatus)) {
              await transitionState(incidentId, currentStatus as IncidentStatus, 'VERIFYING' as IncidentStatus);
            }
          }
        }

        // Check if retainIncidentLearning was called - that signals completion
        if (toolCall.name === 'retainIncidentLearning' && execution.success) {
          resolvedViaAgent = true;
        }
      }

      messages.push({ role: 'user', content: toolResults });

      // Update agent run with tool call log
      await prisma.agentRun.update({
        where: { id: agentRunId },
        data: {
          toolCalls: JSON.stringify(toolCallLog),
          llmCalls: agentState.iteration,
        },
      }).catch(() => {});

      if (resolvedViaAgent) break;
    }

    // ── Finalize incident status ───────────────────────────────────────────

    const finalIncident = await prisma.incident.findUnique({ where: { id: incidentId } });
    const finalStatus = finalIncident?.status as IncidentStatus;

    // If we got through investigation but haven't resolved, check state
    if (!['RESOLVED', 'LEARNING_RETAINED', 'FAILED', 'ESCALATED'].includes(finalStatus)) {
      // Check if any action was approved and executed successfully
      const executedActions = await prisma.actionRequest.findMany({
        where: { incidentId, status: 'COMPLETED' },
      });

      if (executedActions.length > 0) {
        // Mark as awaiting approval if there are pending actions
        const pendingActions = await prisma.actionRequest.findMany({
          where: { incidentId, status: 'PENDING' },
        });

        if (pendingActions.length > 0) {
          await transitionState(incidentId, finalStatus, 'AWAITING_APPROVAL');
        }
      } else {
        // Check for pending approvals
        const pendingActions = await prisma.actionRequest.findMany({
          where: { incidentId, status: 'PENDING' },
        });

        if (pendingActions.length > 0 && !['AWAITING_APPROVAL'].includes(finalStatus)) {
          await transitionState(incidentId, finalStatus, 'AWAITING_APPROVAL').catch(() => {});
        }
      }
    }

    const updatedIncident = await prisma.incident.findUnique({ where: { id: incidentId } });
    const newFinalStatus = updatedIncident?.status as IncidentStatus;

    await prisma.agentRun.update({
      where: { id: agentRunId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        toolCalls: JSON.stringify(toolCallLog),
        llmCalls: agentState.iteration,
      },
    });

    broadcast(incidentId, 'agent_completed', {
      agentRunId,
      finalStatus: newFinalStatus,
      iterations: agentState.iteration,
      memoryEnabled,
      memoriesUsed: agentState.memoryResults.length,
    });

    console.log(`[Agent] Run ${agentRunId} completed. Status: ${newFinalStatus}, Iterations: ${agentState.iteration}`);

    return { success: true, finalStatus: newFinalStatus, agentRunId };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[Agent] Fatal error in run ${agentRunId}:`, error);

    await prisma.agentRun.update({
      where: { id: agentRunId },
      data: { status: 'FAILED', completedAt: new Date() },
    }).catch(() => {});

    const currentIncident = await prisma.incident.findUnique({ where: { id: incidentId } }).catch(() => null);
    if (currentIncident) {
      await prisma.incident.update({
        where: { id: incidentId },
        data: { status: 'FAILED' },
      }).catch(() => {});
    }

    broadcast(incidentId, 'agent_error', { error, agentRunId });

    return { success: false, finalStatus: 'FAILED', agentRunId };
  }
}
