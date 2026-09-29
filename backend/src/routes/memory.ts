import { Router } from 'express';
import { prisma } from '../db/client';
import { hindsightMemory } from '../services/hindsightMemory';

const router = Router();

// ─── Memory status ────────────────────────────────────────────────────────────

router.get('/status', async (_req, res) => {
  const available = hindsightMemory.isAvailable();

  const recentOps = await prisma.memoryOperation.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  const stats = {
    totalOps: await prisma.memoryOperation.count(),
    retainOps: await prisma.memoryOperation.count({ where: { type: 'retain', success: true } }),
    recallOps: await prisma.memoryOperation.count({ where: { type: 'recall', success: true } }),
    reflectOps: await prisma.memoryOperation.count({ where: { type: 'reflect', success: true } }),
    failedOps: await prisma.memoryOperation.count({ where: { success: false } }),
  };

  res.json({
    available,
    status: available ? 'OPERATIONAL' : 'DEGRADED',
    bankId: process.env['HINDSIGHT_BANK_ID'] || 'recall-ops-incidents',
    stats,
    recentOps,
  });
});

// ─── Memory operations log ────────────────────────────────────────────────────

router.get('/operations', async (req, res) => {
  const { type, incidentId } = req.query;

  const ops = await prisma.memoryOperation.findMany({
    where: {
      ...(type ? { type: type as string } : {}),
      ...(incidentId ? { incidentId: incidentId as string } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  res.json(ops);
});

// ─── Recall query ─────────────────────────────────────────────────────────────

router.post('/recall', async (req, res) => {
  const { service, symptoms = [], incidentId } = req.body as {
    service: string;
    symptoms?: string[];
    incidentId?: string;
  };

  if (!service) return res.status(400).json({ error: 'service required' });

  const result = await hindsightMemory.recallSimilarIncidents(service, symptoms, incidentId);
  return res.json(result);
});

// ─── Reflect query ────────────────────────────────────────────────────────────

router.post('/reflect', async (req, res) => {
  const { query, incidentId } = req.body as { query: string; incidentId?: string };

  if (!query) return res.status(400).json({ error: 'query required' });

  const result = await hindsightMemory.reflectOnIncidentHistory(query, incidentId);
  return res.json(result);
});

// ─── Service reliability model ────────────────────────────────────────────────

router.get('/reliability/:service', async (req, res) => {
  const service = req.params['service']!;
  const result = await hindsightMemory.getServiceReliabilityModel(service);
  return res.json(result);
});

// ─── A/B experiment ──────────────────────────────────────────────────────────

router.post('/ab-experiment', async (req, res) => {
  const { scenarioId } = req.body as { scenarioId: string };

  if (!scenarioId) return res.status(400).json({ error: 'scenarioId required' });

  const { simulator, SCENARIOS } = await import('../simulator/simulator');
  const scenario = SCENARIOS.find((s) => s.id === scenarioId);
  if (!scenario) return res.status(404).json({ error: 'Scenario not found' });

  const { runIncidentAgent } = await import('../agent/orchestrator');
  const { v4: uuidv4 } = await import('uuid');

  // Run A: No memory
  await simulator.injectScenario(scenarioId);
  const incidentAId = uuidv4();
  await prisma.incident.create({
    data: {
      id: incidentAId,
      title: `[A/B-A] ${scenario.name}`,
      description: scenario.description,
      severity: scenario.severity,
      status: 'DETECTED',
      affectedServices: JSON.stringify(scenario.affectedServices),
      symptoms: JSON.stringify(scenario.symptoms),
      autonomyMode: 'APPROVAL_REQUIRED',
    },
  });

  const runA = runIncidentAgent(incidentAId, { memoryEnabled: false });

  // Short delay then run B: With memory
  await new Promise((r) => setTimeout(r, 2000));
  await simulator.injectScenario(scenarioId);
  const incidentBId = uuidv4();
  await prisma.incident.create({
    data: {
      id: incidentBId,
      title: `[A/B-B] ${scenario.name}`,
      description: scenario.description,
      severity: scenario.severity,
      status: 'DETECTED',
      affectedServices: JSON.stringify(scenario.affectedServices),
      symptoms: JSON.stringify(scenario.symptoms),
      autonomyMode: 'APPROVAL_REQUIRED',
    },
  });

  const runB = runIncidentAgent(incidentBId, { memoryEnabled: true });

  // Return immediately - runs happen async
  return res.json({
    experimentId: uuidv4(),
    modeA: { incidentId: incidentAId, memoryEnabled: false },
    modeB: { incidentId: incidentBId, memoryEnabled: true },
    message: 'A/B experiment started. Monitor both incidents for comparison.',
  });
});

export default router;
