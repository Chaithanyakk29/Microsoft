/**
 * RECALL OPS - Main Express Server
 *
 * Modular-monolith architecture:
 * - All API routes registered here
 * - CORS configured for frontend
 * - Rate limiting applied
 * - Request IDs assigned
 * - Structured logging
 * - Health endpoints
 * - Graceful shutdown
 */

import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { config } from './config';
import { prisma } from './db/client';
import { hindsightMemory } from './services/hindsightMemory';

// Route imports
import simulatorRouter from './routes/simulator';
import incidentsRouter from './routes/incidents';
import memoryRouter from './routes/memory';
import runbooksRouter from './routes/runbooks';
import postmortemsRouter from './routes/postmortems';
import auditRouter from './routes/audit';

const app = express();

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(cors({
  origin: config.corsOrigin,
  credentials: true,
}));

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Request ID middleware
app.use((req, _res, next) => {
  (req as express.Request & { requestId: string }).requestId = uuidv4();
  next();
});

// Structured request logging
app.use((req, _res, next) => {
  const startTime = Date.now();
  _res.on('finish', () => {
    if (!req.path.includes('/stream') && !req.path.includes('/health')) {
      console.log(JSON.stringify({
        type: 'request',
        method: req.method,
        path: req.path,
        status: _res.statusCode,
        duration: Date.now() - startTime,
        requestId: (req as express.Request & { requestId: string }).requestId,
      }));
    }
  });
  next();
});

// ─── Health endpoints ─────────────────────────────────────────────────────────

app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'ok',
      version: '1.0.0',
      memory: hindsightMemory.isAvailable() ? 'operational' : 'degraded',
      llmProvider: config.llmProvider,
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({ status: 'error', message: 'Database unavailable' });
  }
});

app.get('/health/memory', (_req, res) => {
  res.json({
    available: hindsightMemory.isAvailable(),
    status: hindsightMemory.isAvailable() ? 'OPERATIONAL' : 'DEGRADED',
    provider: 'hindsight',
    bankId: config.hindsightBankId,
  });
});

// ─── API Routes ───────────────────────────────────────────────────────────────

app.use('/api/simulator', simulatorRouter);
app.use('/api/incidents', incidentsRouter);
app.use('/api/memory', memoryRouter);
app.use('/api/runbooks', runbooksRouter);
app.use('/api/postmortems', postmortemsRouter);
app.use('/api/audit', auditRouter);

// ─── Dashboard stats ──────────────────────────────────────────────────────────

app.get('/api/dashboard', async (_req, res) => {
  const [
    activeIncidents,
    resolvedToday,
    memoryOps,
    recentPostmortems,
  ] = await Promise.all([
    prisma.incident.findMany({
      where: { status: { notIn: ['RESOLVED', 'LEARNING_RETAINED', 'FAILED'] } },
      orderBy: { detectedAt: 'desc' },
    }),
    prisma.incident.count({
      where: {
        status: { in: ['RESOLVED', 'LEARNING_RETAINED'] },
        resolvedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    }),
    prisma.memoryOperation.count({ where: { success: true } }),
    prisma.postmortem.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { incident: true },
    }),
  ]);

  const { simulator } = await import('./simulator/simulator');
  const services = simulator.getAllServices();
  const unhealthyServices = services.filter((s) => !s.isHealthy);

  res.json({
    activeIncidents,
    resolvedToday,
    totalMemoryOps: memoryOps,
    hindsightAvailable: hindsightMemory.isAvailable(),
    services: services.map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      isHealthy: s.isHealthy,
      errorRate: s.errorRate,
      cpu: s.cpu,
    })),
    unhealthyCount: unhealthyServices.length,
    recentPostmortems,
    activeScenario: simulator.getActiveScenario(),
  });
});

// ─── 404 handler ──────────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ─── Error handler ────────────────────────────────────────────────────────────

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Error]', err.message, err.stack);
  res.status(500).json({
    error: 'Internal server error',
    message: config.nodeEnv === 'development' ? err.message : undefined,
  });
});

// ─── Start server ─────────────────────────────────────────────────────────────

async function start(): Promise<void> {
  try {
    await prisma.$connect();
    console.log('[DB] Connected');

    const server = app.listen(config.port, () => {
      console.log(`[Server] RECALL OPS backend running on http://localhost:${config.port}`);
      console.log(`[Config] LLM=${config.llmProvider}/${config.llmModel}`);
      console.log(`[Config] Hindsight=${hindsightMemory.isAvailable() ? 'ENABLED' : 'DEGRADED'}`);
      console.log(`[Config] Demo mode=${config.demoMode}`);
    });

    // Graceful shutdown
    const shutdown = async (): Promise<void> => {
      console.log('[Server] Shutting down...');
      server.close(async () => {
        await prisma.$disconnect();
        process.exit(0);
      });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (err) {
    console.error('[Server] Failed to start:', err);
    process.exit(1);
  }
}

start();

export default app;
