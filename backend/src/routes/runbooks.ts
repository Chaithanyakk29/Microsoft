import { Router } from 'express';
import { prisma } from '../db/client';

const router = Router();

router.get('/', async (req, res) => {
  const runbooks = await prisma.runbook.findMany({
    orderBy: { lastReviewed: 'desc' },
  });
  res.json(runbooks);
});

router.get('/:id', async (req, res) => {
  const runbook = await prisma.runbook.findUnique({ where: { id: req.params['id'] } });
  if (!runbook) return res.status(404).json({ error: 'Runbook not found' });
  return res.json(runbook);
});

router.get('/search', async (req, res) => {
  const { q } = req.query as { q?: string };
  if (!q) return res.json([]);

  const runbooks = await prisma.runbook.findMany({
    where: {
      OR: [
        { title: { contains: q } },
        { content: { contains: q } },
        { symptoms: { contains: q } },
      ],
    },
  });
  return res.json(runbooks);
});

export default router;
