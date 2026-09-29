import { Router, Request, Response } from 'express';
import { prisma } from '../db/client';
import { simulator, SCENARIOS } from '../simulator/simulator';
import { runIncidentAgent } from '../agent/orchestrator';
import { v4 as uuidv4 } from 'uuid';
import { Severity } from '../types';

const router = Router();

// ─── Simulator endpoints ─────────────────────────────────────────────────────

router.get('/scenarios', (_req, res) => {
  res.json(SCENARIOS.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    severity: s.severity,
    affectedServices: s.affectedServices,
    symptoms: s.symptoms,
    expectedRootCause: s.expectedRootCause,
  })));
});

router.post('/reset', async (_req, res) => {
  try {
    simulator.reset();
    res.json({ success: true, message: 'Environment reset to healthy state' });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/inject', async (req: Request, res: Response) => {
  try {
    const { scenarioId, autoInvestigate = true, memoryEnabled = true } = req.body as {
      scenarioId: string;
      autoInvestigate?: boolean;
      memoryEnabled?: boolean;
    };

    if (!scenarioId) {
      return res.status(400).json({ error: 'scenarioId required' });
    }

    const result = await simulator.injectScenario(scenarioId);

    // Create incident record
    const incidentId = uuidv4();
    const incident = await prisma.incident.create({
      data: {
        id: incidentId,
        title: result.incidentTitle,
        description: `${result.incidentTitle} detected by automated monitoring. ${result.symptoms.slice(0, 2).join('. ')}.`,
        severity: result.severity,
        status: 'DETECTED',
        affectedServices: JSON.stringify(result.affectedServices),
        symptoms: JSON.stringify(result.symptoms),
        autonomyMode: 'APPROVAL_REQUIRED',
      },
    });

    await prisma.incidentEvent.create({
      data: {
        incidentId,
        type: 'DETECTED',
        message: `Incident detected: ${result.incidentTitle}`,
        actor: 'monitoring',
      },
    });

    // Auto-start investigation if requested
    if (autoInvestigate) {
      // Run async - don't await
      runIncidentAgent(incidentId, { memoryEnabled }).catch((err) => {
        console.error('[Simulator] Agent run failed:', err);
      });
    }

    return res.json({
      success: true,
      incident,
      scenarioInjected: scenarioId,
      autoInvestigating: autoInvestigate,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: message });
  }
});

// ─── Services ────────────────────────────────────────────────────────────────

router.get('/services', (_req, res) => {
  const services = simulator.getAllServices();
  res.json(services);
});

router.get('/services/:id', (req, res) => {
  const svc = simulator.getService(req.params['id']!);
  if (!svc) return res.status(404).json({ error: 'Service not found' });
  return res.json(svc);
});

router.get('/services/:id/metrics', (req, res) => {
  const svc = simulator.getService(req.params['id']!);
  if (!svc) return res.status(404).json({ error: 'Service not found' });
  return res.json(simulator.getServiceMetrics(svc));
});

router.get('/services/:id/logs', (req, res) => {
  const limit = parseInt(req.query['limit'] as string || '20', 10);
  const logs = simulator.getServiceLogs(req.params['id']!, limit);
  return res.json(logs);
});

router.get('/deployments', async (_req, res) => {
  const deployments = await prisma.deployment.findMany({
    orderBy: { deployedAt: 'desc' },
    take: 20,
  });
  res.json(deployments);
});

router.get('/dependencies', (_req, res) => {
  const services = simulator.getAllServices();
  const graph = services.map((s) => ({
    id: s.id,
    name: s.name,
    status: s.status,
    isHealthy: s.isHealthy,
    dependencies: s.dependencies,
    criticality: s.criticality,
  }));
  res.json(graph);
});

export default router;
