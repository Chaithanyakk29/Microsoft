import { Router, Request, Response } from 'express';
import { prisma } from '../db/client';
import { runIncidentAgent, registerSSEClient, unregisterSSEClient } from '../agent/orchestrator';
import { evaluatePolicy } from '../policy/engine';
import { Severity, AutonomyMode } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { simulator } from '../simulator/simulator';

const router = Router();

// ─── List incidents ───────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  const incidents = await prisma.incident.findMany({
    orderBy: { detectedAt: 'desc' },
    take: 50,
    include: {
      hypotheses: { take: 5, orderBy: { createdAt: 'desc' } },
      actionRequests: { take: 3, orderBy: { createdAt: 'desc' } },
    },
  });
  res.json(incidents);
});

// ─── Get single incident ──────────────────────────────────────────────────────

router.get('/:id', async (req, res) => {
  const incident = await prisma.incident.findUnique({
    where: { id: req.params['id'] },
    include: {
      hypotheses: { orderBy: { createdAt: 'asc' } },
      actionRequests: {
        include: { approval: true, execution: true },
        orderBy: { createdAt: 'desc' },
      },
      events: { orderBy: { timestamp: 'asc' } },
      diagnostics: { orderBy: { createdAt: 'asc' } },
      postmortem: true,
      agentRuns: { orderBy: { startedAt: 'desc' }, take: 5 },
    },
  });

  if (!incident) return res.status(404).json({ error: 'Incident not found' });
  return res.json(incident);
});

// ─── Create incident manually ─────────────────────────────────────────────────

router.post('/', async (req, res) => {
  const { title, description, severity, affectedServices, symptoms } = req.body as {
    title: string;
    description: string;
    severity: Severity;
    affectedServices: string[];
    symptoms: string[];
  };

  if (!title || !severity) {
    return res.status(400).json({ error: 'title and severity are required' });
  }

  const incident = await prisma.incident.create({
    data: {
      title,
      description: description || title,
      severity,
      status: 'DETECTED',
      affectedServices: JSON.stringify(affectedServices || []),
      symptoms: JSON.stringify(symptoms || []),
      autonomyMode: 'APPROVAL_REQUIRED',
    },
  });

  await prisma.incidentEvent.create({
    data: {
      incidentId: incident.id,
      type: 'DETECTED',
      message: `Manual incident created: ${title}`,
      actor: 'user',
    },
  });

  return res.status(201).json(incident);
});

// ─── Start agent investigation ────────────────────────────────────────────────

router.post('/:id/investigate', async (req, res) => {
  const { memoryEnabled = true } = req.body as { memoryEnabled?: boolean };
  const incidentId = req.params['id']!;

  const incident = await prisma.incident.findUnique({ where: { id: incidentId } });
  if (!incident) return res.status(404).json({ error: 'Incident not found' });

  // Start investigation async
  runIncidentAgent(incidentId, { memoryEnabled }).catch((err) => {
    console.error('[API] Agent run error:', err);
  });

  return res.json({
    message: 'Investigation started',
    incidentId,
    memoryEnabled,
  });
});

// ─── SSE stream for real-time updates ────────────────────────────────────────

router.get('/:id/stream', (req, res) => {
  const incidentId = req.params['id']!;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  // Send initial connection confirmation
  res.write(`event: connected\ndata: {"incidentId":"${incidentId}"}\n\n`);

  registerSSEClient(incidentId, res);

  // Heartbeat every 30s
  const heartbeat = setInterval(() => {
    try {
      res.write(`:heartbeat\n\n`);
    } catch {
      clearInterval(heartbeat);
    }
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unregisterSSEClient(incidentId, res);
  });
});

// ─── Approve/reject action ────────────────────────────────────────────────────

router.post('/:id/actions/:actionId/approve', async (req, res) => {
  const { actionId } = req.params as { actionId: string };
  const { approverId = 'commander-1', decision, reason } = req.body as {
    approverId?: string;
    decision: 'APPROVED' | 'REJECTED';
    reason?: string;
  };

  const actionRequest = await prisma.actionRequest.findUnique({
    where: { id: actionId },
  });

  if (!actionRequest) return res.status(404).json({ error: 'Action request not found' });
  if (actionRequest.status !== 'PENDING') {
    return res.status(400).json({ error: `Action is already ${actionRequest.status}` });
  }

  // Ensure approver user exists
  const approver = await prisma.user.upsert({
    where: { id: approverId },
    update: {},
    create: {
      id: approverId,
      username: 'incident-commander',
      email: 'commander@recall-ops.io',
      role: 'INCIDENT_COMMANDER',
    },
  });

  await prisma.approval.create({
    data: {
      actionRequestId: actionId,
      approverId: approver.id,
      decision,
      reason,
    },
  });

  await prisma.actionRequest.update({
    where: { id: actionId },
    data: { status: decision },
  });

  await prisma.incidentEvent.create({
    data: {
      incidentId: req.params['id']!,
      type: decision === 'APPROVED' ? 'ACTION_APPROVED' : 'ACTION_REJECTED',
      message: `Action ${decision.toLowerCase()} by incident commander${reason ? `: ${reason}` : ''}`,
      actor: approverId,
    },
  });

  return res.json({
    success: true,
    actionRequestId: actionId,
    decision,
    message: `Action ${decision.toLowerCase()}`,
  });
});

// ─── Execute approved action ──────────────────────────────────────────────────

router.post('/:id/actions/:actionId/execute', async (req, res) => {
  const { actionId, id: incidentId } = req.params as { actionId: string; id: string };

  const actionRequest = await prisma.actionRequest.findUnique({ where: { id: actionId } });
  if (!actionRequest || actionRequest.status !== 'APPROVED') {
    return res.status(400).json({ error: 'Action not approved' });
  }

  const { executeTool } = await import('../tools/tools');
  const incident = await prisma.incident.findUnique({ where: { id: incidentId } });

  const parameters = JSON.parse(actionRequest.parameters) as Record<string, unknown>;

  const result = await executeTool(
    actionRequest.action,
    { ...parameters, actionRequestId: actionId, service: parameters['service'] as string || incidentId },
    {
      incidentId,
      agentRunId: incident?.agentRunId || uuidv4(),
      incidentSeverity: incident?.severity as Severity || 'P2',
      autonomyMode: incident?.autonomyMode as AutonomyMode || 'APPROVAL_REQUIRED',
      currentState: incident?.status || 'EXECUTING',
    },
  );

  return res.json(result);
});

// ─── Resolve incident ─────────────────────────────────────────────────────────

router.post('/:id/resolve', async (req, res) => {
  const incidentId = req.params['id']!;
  const { rootCause } = req.body as { rootCause?: string };

  await prisma.incident.update({
    where: { id: incidentId },
    data: {
      status: 'RESOLVED',
      resolvedAt: new Date(),
      rootCause: rootCause || 'Resolved',
    },
  });

  await prisma.incidentEvent.create({
    data: {
      incidentId,
      type: 'RESOLVED',
      message: 'Incident marked as resolved',
      actor: 'user',
    },
  });

  return res.json({ success: true });
});

// ─── Get incident events (timeline) ──────────────────────────────────────────

router.get('/:id/events', async (req, res) => {
  const events = await prisma.incidentEvent.findMany({
    where: { incidentId: req.params['id'] },
    orderBy: { timestamp: 'asc' },
  });
  res.json(events);
});

// ─── Get hypotheses ───────────────────────────────────────────────────────────

router.get('/:id/hypotheses', async (req, res) => {
  const hypotheses = await prisma.incidentHypothesis.findMany({
    where: { incidentId: req.params['id'] },
    orderBy: { createdAt: 'asc' },
  });
  res.json(hypotheses);
});

// ─── Replay incident ──────────────────────────────────────────────────────────

router.post('/:id/replay', async (req, res) => {
  const incidentId = req.params['id']!;
  const { memoryEnabled = true } = req.body as { memoryEnabled?: boolean };

  const original = await prisma.incident.findUnique({ where: { id: incidentId } });
  if (!original) return res.status(404).json({ error: 'Incident not found' });

  // Get the scenario that caused the original incident from simulator
  const affectedServices = JSON.parse(original.affectedServices) as string[];

  // Create a new incident based on the original
  const newIncident = await prisma.incident.create({
    data: {
      title: `[REPLAY] ${original.title}`,
      description: original.description,
      severity: original.severity as Severity,
      status: 'DETECTED',
      affectedServices: original.affectedServices,
      symptoms: original.symptoms || '[]',
      autonomyMode: 'APPROVAL_REQUIRED',
    },
  });

  await prisma.incidentEvent.create({
    data: {
      incidentId: newIncident.id,
      type: 'REPLAY',
      message: `Replaying incident from ${original.detectedAt.toISOString()} (original: ${incidentId})`,
      actor: 'user',
    },
  });

  // Re-inject the scenario if we can determine which one
  const { SCENARIOS } = await import('../simulator/simulator');
  const matchingScenario = SCENARIOS.find((s) =>
    s.affectedServices.some((svcId) => affectedServices.includes(svcId)),
  );

  if (matchingScenario) {
    await simulator.injectScenario(matchingScenario.id);
  }

  // Start agent with memory enabled (or disabled per request)
  runIncidentAgent(newIncident.id, { memoryEnabled }).catch((err) => {
    console.error('[Replay] Agent error:', err);
  });

  return res.json({
    success: true,
    newIncidentId: newIncident.id,
    originalIncidentId: incidentId,
    memoryEnabled,
    message: memoryEnabled
      ? 'Replay started with Hindsight memory - agent will recognize historical patterns'
      : 'Replay started without memory - baseline comparison mode',
  });
});

export default router;
