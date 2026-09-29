import { Router } from 'express';
import { prisma } from '../db/client';
import { hindsightMemory } from '../services/hindsightMemory';

const router = Router();

router.get('/', async (_req, res) => {
  const postmortems = await prisma.postmortem.findMany({
    orderBy: { createdAt: 'desc' },
    include: { incident: true },
  });
  res.json(postmortems);
});

router.get('/:id', async (req, res) => {
  const pm = await prisma.postmortem.findUnique({
    where: { id: req.params['id'] },
    include: { incident: true },
  });
  if (!pm) return res.status(404).json({ error: 'Postmortem not found' });
  return res.json(pm);
});

router.patch('/:id', async (req, res) => {
  const pm = await prisma.postmortem.update({
    where: { id: req.params['id'] },
    data: req.body,
  });
  return res.json(pm);
});

router.post('/:id/approve', async (req, res) => {
  const pm = await prisma.postmortem.update({
    where: { id: req.params['id'] },
    data: { status: 'APPROVED' },
  });
  return res.json(pm);
});

router.post('/:id/retain', async (req, res) => {
  const pm = await prisma.postmortem.findUnique({
    where: { id: req.params['id'] },
    include: { incident: true },
  });
  if (!pm) return res.status(404).json({ error: 'Postmortem not found' });

  const affectedServices = JSON.parse(pm.incident.affectedServices) as string[];

  const opId = await hindsightMemory.retainPostmortem({
    incidentId: pm.incidentId,
    service: affectedServices[0] || 'unknown',
    rootCause: pm.rootCause,
    whatWorked: pm.whatWorked,
    whatFailed: pm.whatFailed,
    prevention: pm.prevention,
    lessons: pm.whatWorked,
  });

  await prisma.postmortem.update({
    where: { id: pm.id },
    data: { retainedToMemory: true, status: 'RETAINED', memoryOperationId: opId || undefined },
  });

  await prisma.incidentEvent.create({
    data: {
      incidentId: pm.incidentId,
      type: 'LEARNING_RETAINED',
      message: `Postmortem retained to Hindsight memory (available=${hindsightMemory.isAvailable()})`,
      actor: 'user',
    },
  });

  return res.json({
    success: true,
    hindsightAvailable: hindsightMemory.isAvailable(),
    memoryOperationId: opId,
  });
});

export default router;
