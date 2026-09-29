/**
 * Production Simulator
 *
 * Provides a deterministic simulated production environment so judges can
 * trigger realistic incidents without destructive real infrastructure.
 *
 * All state is stored in-memory (with DB sync) and follows deterministic
 * event sequences for reproducible demo scenarios.
 */

import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../db/client';
import { Severity } from '../types';

export interface ServiceState {
  id: string;
  name: string;
  type: string;
  criticality: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  isHealthy: boolean;
  cpu: number;       // 0-100%
  memory: number;    // 0-100%
  latencyP50: number;  // ms
  latencyP95: number;  // ms
  latencyP99: number;  // ms
  requestRate: number; // req/s
  errorRate: number;   // 0-100%
  activeConnections: number;
  maxConnections: number;
  deploymentVersion: string;
  configVersion: string;
  dependencies: string[];
  status: 'healthy' | 'degraded' | 'unhealthy';
  injectedScenario?: string;
  logs: LogEntry[];
}

export interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  message: string;
  service: string;
  traceId?: string;
}

export interface ScenarioDefinition {
  id: string;
  name: string;
  description: string;
  severity: Severity;
  affectedServices: string[];
  symptoms: string[];
  expectedRootCause: string;
  inject: (state: Map<string, ServiceState>) => void;
  verify: (state: Map<string, ServiceState>) => boolean;
}

// ─── Initial healthy service definitions ────────────────────────────────────

function createHealthyServiceState(): Map<string, ServiceState> {
  const services = new Map<string, ServiceState>();

  services.set('api-gateway', {
    id: 'api-gateway',
    name: 'API Gateway',
    type: 'gateway',
    criticality: 'CRITICAL',
    isHealthy: true,
    cpu: 32,
    memory: 45,
    latencyP50: 12,
    latencyP95: 45,
    latencyP99: 89,
    requestRate: 1250,
    errorRate: 0.1,
    activeConnections: 450,
    maxConnections: 2000,
    deploymentVersion: '3.2.1',
    configVersion: '1.4.0',
    dependencies: ['auth-service', 'checkout-service'],
    status: 'healthy',
    logs: [],
  });

  services.set('auth-service', {
    id: 'auth-service',
    name: 'Auth Service',
    type: 'service',
    criticality: 'CRITICAL',
    isHealthy: true,
    cpu: 28,
    memory: 38,
    latencyP50: 8,
    latencyP95: 28,
    latencyP99: 52,
    requestRate: 890,
    errorRate: 0.05,
    activeConnections: 120,
    maxConnections: 500,
    deploymentVersion: '2.1.0',
    configVersion: '1.2.0',
    dependencies: ['postgresql'],
    status: 'healthy',
    logs: [],
  });

  services.set('checkout-service', {
    id: 'checkout-service',
    name: 'Checkout Service',
    type: 'service',
    criticality: 'CRITICAL',
    isHealthy: true,
    cpu: 41,
    memory: 52,
    latencyP50: 85,
    latencyP95: 210,
    latencyP99: 380,
    requestRate: 340,
    errorRate: 0.2,
    activeConnections: 45,
    maxConnections: 100,
    deploymentVersion: '4.5.2',
    configVersion: '2.1.0',
    dependencies: ['payment-service', 'inventory-service', 'postgresql'],
    status: 'healthy',
    logs: [],
  });

  services.set('payment-service', {
    id: 'payment-service',
    name: 'Payment Service',
    type: 'service',
    criticality: 'CRITICAL',
    isHealthy: true,
    cpu: 35,
    memory: 44,
    latencyP50: 120,
    latencyP95: 350,
    latencyP99: 620,
    requestRate: 280,
    errorRate: 0.1,
    activeConnections: 38,
    maxConnections: 80,
    deploymentVersion: '1.8.3',
    configVersion: '1.5.2',
    dependencies: ['postgresql'],
    status: 'healthy',
    logs: [],
  });

  services.set('inventory-service', {
    id: 'inventory-service',
    name: 'Inventory Service',
    type: 'service',
    criticality: 'HIGH',
    isHealthy: true,
    cpu: 22,
    memory: 35,
    latencyP50: 45,
    latencyP95: 120,
    latencyP99: 210,
    requestRate: 520,
    errorRate: 0.15,
    activeConnections: 28,
    maxConnections: 100,
    deploymentVersion: '2.3.0',
    configVersion: '1.1.0',
    dependencies: ['postgresql'],
    status: 'healthy',
    logs: [],
  });

  services.set('notification-service', {
    id: 'notification-service',
    name: 'Notification Service',
    type: 'service',
    criticality: 'MEDIUM',
    isHealthy: true,
    cpu: 15,
    memory: 28,
    latencyP50: 200,
    latencyP95: 500,
    latencyP99: 800,
    requestRate: 150,
    errorRate: 0.3,
    activeConnections: 15,
    maxConnections: 50,
    deploymentVersion: '1.2.1',
    configVersion: '1.0.0',
    dependencies: [],
    status: 'healthy',
    logs: [],
  });

  services.set('postgresql', {
    id: 'postgresql',
    name: 'PostgreSQL',
    type: 'database',
    criticality: 'CRITICAL',
    isHealthy: true,
    cpu: 18,
    memory: 62,
    latencyP50: 3,
    latencyP95: 12,
    latencyP99: 25,
    requestRate: 2100,
    errorRate: 0.0,
    activeConnections: 45,
    maxConnections: 100,
    deploymentVersion: '15.4',
    configVersion: '1.0.0',
    dependencies: [],
    status: 'healthy',
    logs: [],
  });

  return services;
}

// ─── Simulator Scenarios ─────────────────────────────────────────────────────

export const SCENARIOS: ScenarioDefinition[] = [
  {
    id: 'db-connection-pool-exhaustion',
    name: 'Database Connection Pool Exhaustion',
    description:
      'Traffic surge causes PostgreSQL connection pool to become exhausted, cascading to checkout and payment services.',
    severity: 'P1',
    affectedServices: ['checkout-service', 'payment-service', 'postgresql'],
    symptoms: [
      'PostgreSQL active connections near max (97/100)',
      'Checkout service latency P95 > 5000ms',
      'Payment service timeout rate 45%',
      'Connection acquisition timeout errors in checkout logs',
      'Error rate spike: checkout 32%, payment 28%',
    ],
    expectedRootCause: 'Database connection pool exhaustion due to traffic surge',
    inject: (state) => {
      // Exhaust DB connections
      const db = state.get('postgresql')!;
      db.activeConnections = 97;
      db.maxConnections = 100;
      db.cpu = 89;
      db.memory = 78;
      db.latencyP50 = 450;
      db.latencyP95 = 2800;
      db.latencyP99 = 8500;
      db.errorRate = 8.5;
      db.status = 'degraded';
      db.isHealthy = false;
      db.injectedScenario = 'db-connection-pool-exhaustion';
      db.logs = generateLogs('postgresql', 'db_pool_exhaustion');

      // Cascade to checkout
      const checkout = state.get('checkout-service')!;
      checkout.latencyP50 = 1850;
      checkout.latencyP95 = 5200;
      checkout.latencyP99 = 12000;
      checkout.errorRate = 32.4;
      checkout.cpu = 78;
      checkout.activeConnections = 98;
      checkout.maxConnections = 100;
      checkout.status = 'unhealthy';
      checkout.isHealthy = false;
      checkout.logs = generateLogs('checkout-service', 'db_pool_exhaustion');

      // Cascade to payment
      const payment = state.get('payment-service')!;
      payment.latencyP50 = 3200;
      payment.latencyP95 = 8900;
      payment.latencyP99 = 15000;
      payment.errorRate = 28.1;
      payment.status = 'degraded';
      payment.isHealthy = false;
      payment.logs = generateLogs('payment-service', 'db_pool_exhaustion');

      // API gateway shows elevated error rate
      const gw = state.get('api-gateway')!;
      gw.errorRate = 12.8;
      gw.latencyP99 = 8500;
      gw.status = 'degraded';
      gw.logs = generateLogs('api-gateway', 'db_pool_exhaustion');
    },
    verify: (state) => {
      const db = state.get('postgresql')!;
      return db.activeConnections < 80 && db.status === 'healthy';
    },
  },
  {
    id: 'deployment-regression',
    name: 'Checkout Service Deployment Regression',
    description:
      'A new deployment of checkout-service v4.6.0 introduced a memory leak causing gradual performance degradation.',
    severity: 'P2',
    affectedServices: ['checkout-service', 'api-gateway'],
    symptoms: [
      'Checkout service memory usage climbing steadily (now 91%)',
      'Latency P99 increased 340% after v4.6.0 deployment',
      'GC pause times increasing (1.2s avg)',
      'Error rate: 4.8% (up from 0.2%)',
      'Deployment timestamp correlates exactly with degradation onset',
    ],
    expectedRootCause: 'Memory leak in checkout-service v4.6.0 introduced by deployment',
    inject: (state) => {
      const checkout = state.get('checkout-service')!;
      checkout.memory = 91;
      checkout.cpu = 67;
      checkout.latencyP50 = 380;
      checkout.latencyP95 = 1200;
      checkout.latencyP99 = 4800;
      checkout.errorRate = 4.8;
      checkout.deploymentVersion = '4.6.0';
      checkout.status = 'degraded';
      checkout.isHealthy = false;
      checkout.injectedScenario = 'deployment-regression';
      checkout.logs = generateLogs('checkout-service', 'deployment_regression');

      const gw = state.get('api-gateway')!;
      gw.errorRate = 2.1;
      gw.latencyP99 = 2400;
      gw.logs = generateLogs('api-gateway', 'deployment_regression');
    },
    verify: (state) => {
      const checkout = state.get('checkout-service')!;
      return checkout.deploymentVersion === '4.5.2' && checkout.errorRate < 1.0;
    },
  },
];

// ─── Log generation helpers ──────────────────────────────────────────────────

function generateLogs(service: string, scenario: string): LogEntry[] {
  const now = new Date();
  const logs: LogEntry[] = [];

  if (scenario === 'db_pool_exhaustion') {
    const errorMessages: Record<string, string[]> = {
      postgresql: [
        'FATAL: remaining connection slots are reserved for non-replication superuser connections',
        'ERROR: max_connections reached (100/100)',
        'WARN: connection pool at 97% capacity',
        'ERROR: could not acquire connection from pool after 30000ms',
      ],
      'checkout-service': [
        'ERROR: HikariPool-1 - Connection is not available, request timed out after 30000ms',
        'ERROR: Unable to acquire JDBC Connection',
        'WARN: DB connection pool exhausted, queuing request',
        'ERROR: Transaction rolled back: connection timeout',
        'ERROR: org.postgresql.util.PSQLException: FATAL: remaining connection slots are reserved',
      ],
      'payment-service': [
        'ERROR: Database connection timeout after 30000ms',
        'WARN: Retry attempt 3/3 for DB operation',
        'ERROR: Payment transaction failed: cannot acquire DB connection',
        'ERROR: Circuit breaker OPEN for database connections',
      ],
      'api-gateway': [
        'WARN: Upstream checkout-service response time 5241ms (threshold: 2000ms)',
        'ERROR: 504 Gateway Timeout from checkout-service',
        'WARN: Error rate threshold exceeded: 12.8% (limit: 5%)',
      ],
    };

    const messages = errorMessages[service] || errorMessages['api-gateway'];
    for (let i = 0; i < 8; i++) {
      logs.push({
        timestamp: new Date(now.getTime() - i * 45000).toISOString(),
        level: i < 3 ? 'ERROR' : 'WARN',
        message: messages[i % messages.length],
        service,
        traceId: `trace-${uuidv4().substring(0, 8)}`,
      });
    }
  } else if (scenario === 'deployment_regression') {
    const errorMessages: Record<string, string[]> = {
      'checkout-service': [
        'WARN: Heap memory usage 91% - approaching threshold',
        'ERROR: OutOfMemoryError: Java heap space',
        'WARN: GC overhead limit exceeded - pause time 1242ms',
        'ERROR: Request processing failed due to memory pressure',
        'WARN: High memory usage detected after deployment v4.6.0',
        'ERROR: Circuit breaker triggered due to high error rate',
      ],
      'api-gateway': [
        'WARN: checkout-service response degraded (avg 1250ms)',
        'ERROR: Request failed: checkout-service upstream timeout',
      ],
    };

    const messages = errorMessages[service] || errorMessages['api-gateway'];
    for (let i = 0; i < 6; i++) {
      logs.push({
        timestamp: new Date(now.getTime() - i * 90000).toISOString(),
        level: i % 2 === 0 ? 'ERROR' : 'WARN',
        message: messages[i % messages.length],
        service,
        traceId: `trace-${uuidv4().substring(0, 8)}`,
      });
    }
  }

  return logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

// ─── Simulator Class ─────────────────────────────────────────────────────────

export class ProductionSimulator {
  private state: Map<string, ServiceState>;
  private activeScenario: string | null = null;

  constructor() {
    this.state = createHealthyServiceState();
    this.initializeServicesInDb();
  }

  private async initializeServicesInDb(): Promise<void> {
    for (const [, svc] of this.state) {
      await prisma.service.upsert({
        where: { id: svc.id },
        update: {
          name: svc.name,
          type: svc.type,
          criticality: svc.criticality,
          dependencies: JSON.stringify(svc.dependencies),
          deploymentVersion: svc.deploymentVersion,
          configVersion: svc.configVersion,
          isHealthy: svc.isHealthy,
          currentState: JSON.stringify(this.getServiceMetrics(svc)),
        },
        create: {
          id: svc.id,
          name: svc.name,
          type: svc.type,
          criticality: svc.criticality,
          dependencies: JSON.stringify(svc.dependencies),
          deploymentVersion: svc.deploymentVersion,
          configVersion: svc.configVersion,
          isHealthy: svc.isHealthy,
          currentState: JSON.stringify(this.getServiceMetrics(svc)),
        },
      });
    }
  }

  getServiceMetrics(svc: ServiceState) {
    return {
      cpu: svc.cpu,
      memory: svc.memory,
      latencyP50: svc.latencyP50,
      latencyP95: svc.latencyP95,
      latencyP99: svc.latencyP99,
      requestRate: svc.requestRate,
      errorRate: svc.errorRate,
      activeConnections: svc.activeConnections,
      maxConnections: svc.maxConnections,
    };
  }

  getAllServices(): ServiceState[] {
    return Array.from(this.state.values());
  }

  getService(id: string): ServiceState | undefined {
    return this.state.get(id);
  }

  getServiceLogs(id: string, limit = 20): LogEntry[] {
    const svc = this.state.get(id);
    if (!svc) return [];
    return svc.logs.slice(0, limit);
  }

  getActiveScenario(): string | null {
    return this.activeScenario;
  }

  reset(): void {
    this.state = createHealthyServiceState();
    this.activeScenario = null;
    this.initializeServicesInDb();
    console.log('[Simulator] Environment reset to healthy state');
  }

  async injectScenario(scenarioId: string): Promise<{ success: boolean; incidentTitle: string; severity: Severity; affectedServices: string[]; symptoms: string[] }> {
    const scenario = SCENARIOS.find((s) => s.id === scenarioId);
    if (!scenario) {
      throw new Error(`Unknown scenario: ${scenarioId}`);
    }

    // Reset first to clean state
    this.state = createHealthyServiceState();

    // Apply scenario state transformations
    scenario.inject(this.state);
    this.activeScenario = scenarioId;

    // Add deployment record if relevant
    if (scenarioId === 'deployment-regression') {
      await prisma.deployment.create({
        data: {
          serviceId: 'checkout-service',
          version: '4.6.0',
          previousVersion: '4.5.2',
          deployedBy: 'ci-pipeline',
          status: 'SUCCESS',
          notes: 'Automated deployment via CI/CD pipeline - added new cart optimization feature',
        },
      });
    }

    if (scenarioId === 'db-connection-pool-exhaustion') {
      await prisma.configurationChange.create({
        data: {
          serviceId: 'postgresql',
          changedBy: 'platform-team',
          key: 'max_connections',
          oldValue: '150',
          newValue: '100',
          reason: 'Cost optimization - reduced connection limit',
        },
      });
    }

    // Sync state to DB
    for (const [id, svc] of this.state) {
      await prisma.service.update({
        where: { id },
        data: {
          isHealthy: svc.isHealthy,
          deploymentVersion: svc.deploymentVersion,
          currentState: JSON.stringify(this.getServiceMetrics(svc)),
        },
      }).catch(() => {}); // Service might not exist yet
    }

    console.log(`[Simulator] Injected scenario: ${scenario.name}`);

    return {
      success: true,
      incidentTitle: scenario.name,
      severity: scenario.severity,
      affectedServices: scenario.affectedServices,
      symptoms: scenario.symptoms,
    };
  }

  async remediate(action: string, serviceId: string): Promise<{ success: boolean; message: string }> {
    const svc = this.state.get(serviceId);
    if (!svc) {
      return { success: false, message: `Service ${serviceId} not found` };
    }

    if (action === 'executeRollback') {
      // Rollback deployment regression
      if (svc.deploymentVersion === '4.6.0') {
        svc.deploymentVersion = '4.5.2';
        svc.memory = 52;
        svc.cpu = 41;
        svc.latencyP50 = 85;
        svc.latencyP95 = 210;
        svc.latencyP99 = 380;
        svc.errorRate = 0.2;
        svc.status = 'healthy';
        svc.isHealthy = true;
        svc.logs = [];
        this.activeScenario = null;

        // Fix API gateway too
        const gw = this.state.get('api-gateway')!;
        gw.errorRate = 0.1;
        gw.latencyP99 = 89;
        gw.logs = [];

        await prisma.deployment.create({
          data: {
            serviceId,
            version: '4.5.2',
            previousVersion: '4.6.0',
            deployedBy: 'sre-team',
            status: 'SUCCESS',
            notes: 'Emergency rollback - deployment regression detected',
          },
        });

        return { success: true, message: `Rolled back ${serviceId} from v4.6.0 to v4.5.2` };
      }
    }

    if (action === 'scaleService' || action === 'clearCache') {
      // Fix connection pool exhaustion
      if (this.activeScenario === 'db-connection-pool-exhaustion') {
        const db = this.state.get('postgresql')!;
        db.activeConnections = 45;
        db.cpu = 18;
        db.memory = 62;
        db.latencyP50 = 3;
        db.latencyP95 = 12;
        db.latencyP99 = 25;
        db.errorRate = 0.0;
        db.status = 'healthy';
        db.isHealthy = true;
        db.logs = [];

        const checkout = this.state.get('checkout-service')!;
        checkout.latencyP50 = 85;
        checkout.latencyP95 = 210;
        checkout.latencyP99 = 380;
        checkout.errorRate = 0.2;
        checkout.activeConnections = 45;
        checkout.cpu = 41;
        checkout.status = 'healthy';
        checkout.isHealthy = true;
        checkout.logs = [];

        const payment = this.state.get('payment-service')!;
        payment.latencyP50 = 120;
        payment.latencyP95 = 350;
        payment.latencyP99 = 620;
        payment.errorRate = 0.1;
        payment.status = 'healthy';
        payment.isHealthy = true;
        payment.logs = [];

        const gw = this.state.get('api-gateway')!;
        gw.errorRate = 0.1;
        gw.latencyP99 = 89;
        gw.logs = [];

        this.activeScenario = null;

        return { success: true, message: 'Connection pool scaled and rebalanced. Services recovering.' };
      }
    }

    if (action === 'restartService') {
      svc.cpu = 20;
      svc.memory = 35;
      svc.latencyP50 = 80;
      svc.latencyP95 = 200;
      svc.latencyP99 = 350;
      svc.errorRate = 0.2;
      svc.activeConnections = 10;
      svc.status = 'healthy';
      svc.isHealthy = true;
      svc.logs = [];

      return { success: true, message: `Service ${serviceId} restarted successfully` };
    }

    return { success: false, message: `No remediation handler for action: ${action}` };
  }
}

// Singleton instance
export const simulator = new ProductionSimulator();
