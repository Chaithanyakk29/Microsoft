import { Router } from 'express';
import { prisma } from '../db/client';

const router = Router();

router.get('/', async (req, res) => {
  const { incidentId, eventType, limit = '100' } = req.query as Record<string, string>;

  const events = await prisma.auditEvent.findMany({
    where: {
      ...(incidentId ? { incidentId } : {}),
      ...(eventType ? { eventType } : {}),
    },
    orderBy: { timestamp: 'desc' },
    take: parseInt(limit, 10),
    include: { actor: true },
  });

  res.json(events);
});

export default router;
