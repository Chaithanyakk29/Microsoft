/**
 * Database Seed
 *
 * Seeds the database with:
 * - Demo user accounts
 * - 15+ realistic historical incidents with full details
 * - Service deployments history
 * - Runbooks for common incident types
 * - Historical postmortems
 *
 * These incidents serve as the baseline knowledge that Hindsight memory learns from.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // ─── Users ─────────────────────────────────────────────────────────────────

  await prisma.user.upsert({
    where: { id: 'admin-1' },
    update: {},
    create: {
      id: 'admin-1',
      username: 'admin',
      email: 'admin@recall-ops.io',
      role: 'ADMIN',
    },
  });

  await prisma.user.upsert({
    where: { id: 'commander-1' },
    update: {},
    create: {
      id: 'commander-1',
      username: 'incident-commander',
      email: 'commander@recall-ops.io',
      role: 'INCIDENT_COMMANDER',
    },
  });

  await prisma.user.upsert({
    where: { id: 'responder-1' },
    update: {},
    create: {
      id: 'responder-1',
      username: 'sre-responder',
      email: 'sre@recall-ops.io',
      role: 'RESPONDER',
    },
  });

  // ─── Services ──────────────────────────────────────────────────────────────

  const services = [
    { id: 'api-gateway', name: 'API Gateway', type: 'gateway', criticality: 'CRITICAL', deps: ['auth-service', 'checkout-service'] },
    { id: 'auth-service', name: 'Auth Service', type: 'service', criticality: 'CRITICAL', deps: ['postgresql'] },
    { id: 'checkout-service', name: 'Checkout Service', type: 'service', criticality: 'CRITICAL', deps: ['payment-service', 'inventory-service', 'postgresql'] },
    { id: 'payment-service', name: 'Payment Service', type: 'service', criticality: 'CRITICAL', deps: ['postgresql'] },
    { id: 'inventory-service', name: 'Inventory Service', type: 'service', criticality: 'HIGH', deps: ['postgresql'] },
    { id: 'notification-service', name: 'Notification Service', type: 'service', criticality: 'MEDIUM', deps: [] },
    { id: 'postgresql', name: 'PostgreSQL', type: 'database', criticality: 'CRITICAL', deps: [] },
  ];

  for (const svc of services) {
    await prisma.service.upsert({
      where: { id: svc.id },
      update: {},
      create: {
        id: svc.id,
        name: svc.name,
        type: svc.type,
        criticality: svc.criticality,
        dependencies: JSON.stringify(svc.deps),
        deploymentVersion: '3.0.0',
        configVersion: '1.0.0',
        isHealthy: true,
        currentState: JSON.stringify({ cpu: 30, memory: 50, errorRate: 0.1, latencyP99: 200 }),
      },
    });
  }

  // ─── Runbooks ──────────────────────────────────────────────────────────────

  const runbooks = [
    {
      title: 'Database Connection Pool Exhaustion Response',
      service: 'postgresql',
      incidentType: 'Resource Exhaustion',
      symptoms: JSON.stringify(['Connection timeout', 'Pool at capacity', 'Error rate spike', 'High latency']),
      diagnostics: JSON.stringify([
        'Check active_connections vs max_connections',
        'Identify long-running queries blocking connections',
        'Review connection pool settings in application config',
        'Check for connection leaks in recent deployments',
      ]),
      mitigation: `1. Scale connection pool limit if PostgreSQL has capacity
2. Kill long-running idle connections: SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle' AND query_start < now() - interval '10 minutes';
3. If caused by traffic surge: scale upstream services to distribute load
4. Temporarily reduce connection pool size in non-critical services
5. Enable PgBouncer connection pooling if not already active`,
      verification: 'Verify active_connections < 80% of max_connections, error rate returns to < 1%, latency P99 < 500ms',
      escalation: 'If connection pool cannot be restored within 15 minutes, escalate to Database Team',
      owner: 'platform-team',
      content: 'Full runbook for handling PostgreSQL connection pool exhaustion scenarios.',
      tags: JSON.stringify(['database', 'postgresql', 'connection-pool', 'P1']),
    },
    {
      title: 'Deployment Regression Response Procedure',
      service: 'checkout-service',
      incidentType: 'Deployment Regression',
      symptoms: JSON.stringify(['Error rate increase after deployment', 'Latency degradation', 'Memory/CPU spike', 'Correlation with deploy timestamp']),
      diagnostics: JSON.stringify([
        'Compare error rate before and after deployment timestamp',
        'Check memory and CPU trend since deployment',
        'Review deployment changelog for high-risk changes',
        'Check if rollback would restore previous behavior',
      ]),
      mitigation: `1. Validate deployment correlation: check if incident timestamp aligns with deployment
2. If confirmed: initiate rollback to previous stable version
3. Command: kubectl rollout undo deployment/checkout-service
4. Wait 2-3 minutes for rollback to complete
5. Verify service metrics return to baseline`,
      verification: 'Error rate < 1%, latency P99 within 20% of pre-deployment baseline, no memory leak indicators',
      escalation: 'If rollback fails or does not resolve the issue, escalate to checkout engineering team',
      owner: 'checkout-team',
      content: 'Procedure for identifying and recovering from deployment regressions in any service.',
      tags: JSON.stringify(['deployment', 'rollback', 'regression', 'P2']),
    },
    {
      title: 'High Error Rate - Checkout Service',
      service: 'checkout-service',
      incidentType: 'Availability',
      symptoms: JSON.stringify(['Error rate > 5%', 'Customer checkout failures', 'Revenue impact', 'Alert: error_rate_threshold']),
      diagnostics: JSON.stringify([
        'Check upstream dependency health (payment, inventory, postgresql)',
        'Review recent deployments in last 2 hours',
        'Check database connection pool utilization',
        'Inspect error logs for exception types',
      ]),
      mitigation: `1. Identify root cause from diagnostic steps
2. For dependency failure: check if downstream service can be isolated
3. For resource exhaustion: scale resources or shed load
4. For deployment regression: rollback to last known good version
5. Update incident status and communicate to stakeholders`,
      verification: 'Error rate returns below 1%, P99 latency < 1000ms, checkout success rate > 99%',
      escalation: 'Revenue-impacting P1 incidents: escalate to CTO within 30 minutes',
      owner: 'checkout-team',
      content: 'General response playbook for checkout service availability incidents.',
      tags: JSON.stringify(['checkout', 'availability', 'P1', 'revenue']),
    },
  ];

  for (const rb of runbooks) {
    const existing = await prisma.runbook.findFirst({ where: { title: rb.title } });
    if (!existing) {
      await prisma.runbook.create({ data: rb });
    }
  }

  // ─── Historical Incidents (15 realistic entries) ───────────────────────────

  const historicalIncidents = [
    {
      title: 'Database Connection Pool Exhaustion - Black Friday 2024',
      description: 'PostgreSQL connection pool exhausted during Black Friday traffic surge. All checkout and payment operations timed out.',
      severity: 'P1',
      affectedServices: ['checkout-service', 'payment-service', 'postgresql'],
      symptoms: ['PostgreSQL connections at 100/100', 'Checkout timeout rate 67%', 'Revenue loss $45K/min'],
      rootCause: 'Database connection pool exhaustion due to 3x normal traffic surge without pre-scaling',
      impact: '28 minutes of checkout degradation. Estimated revenue impact: $1.26M',
      resolvedAt: new Date('2024-11-29T15:28:00Z'),
      detectedAt: new Date('2024-11-29T15:00:00Z'),
    },
    {
      title: 'Checkout Service Memory Leak - v4.3.0',
      description: 'Memory leak in v4.3.0 caused gradual performance degradation over 6 hours before critical failure.',
      severity: 'P2',
      affectedServices: ['checkout-service'],
      symptoms: ['Memory usage climbing 2% per hour', 'GC pause times increasing', 'P99 latency degradation'],
      rootCause: 'Memory leak in cart session management code introduced in v4.3.0 due to unclosed event listeners',
      impact: 'Gradual checkout degradation over 6 hours. ~8% error rate at peak.',
      resolvedAt: new Date('2024-10-15T22:45:00Z'),
      detectedAt: new Date('2024-10-15T16:00:00Z'),
    },
    {
      title: 'Payment Service Database Deadlock',
      description: 'Deadlock in payment transactions caused payment failures for 12 minutes.',
      severity: 'P1',
      affectedServices: ['payment-service', 'postgresql'],
      symptoms: ['Deadlock errors in payment logs', 'Transaction failure rate 45%', 'DB lock contention high'],
      rootCause: 'Database deadlock caused by missing index on payment_transactions table causing table scans during concurrent writes',
      impact: '12 minutes of payment failures. Estimated 340 failed transactions.',
      resolvedAt: new Date('2024-09-03T11:12:00Z'),
      detectedAt: new Date('2024-09-03T11:00:00Z'),
    },
    {
      title: 'Auth Service Certificate Expiry',
      description: 'TLS certificate expired causing all authentication requests to fail.',
      severity: 'P1',
      affectedServices: ['auth-service', 'api-gateway'],
      symptoms: ['SSL handshake failures', 'All auth requests returning 503', 'Certificate expiry errors'],
      rootCause: 'SSL certificate expiry not caught by monitoring. Certificate expired at 23:59 UTC.',
      impact: '34 minutes of complete authentication failure. All user-facing operations unavailable.',
      resolvedAt: new Date('2024-08-22T00:33:00Z'),
      detectedAt: new Date('2024-08-21T23:59:00Z'),
    },
    {
      title: 'Inventory Service Cache Stampede',
      description: 'Cache stampede after Redis restart caused database overload.',
      severity: 'P2',
      affectedServices: ['inventory-service', 'postgresql'],
      symptoms: ['Cache miss rate 100%', 'Database CPU 95%', 'Inventory queries timing out'],
      rootCause: 'Redis cache restart caused full cache flush. Stampede of DB reads without throttling.',
      impact: '18 minutes of inventory lookup degradation. Checkout success rate reduced to 60%.',
      resolvedAt: new Date('2024-07-11T14:48:00Z'),
      detectedAt: new Date('2024-07-11T14:30:00Z'),
    },
    {
      title: 'API Gateway Configuration Error',
      description: 'Incorrect routing configuration deployed causing 40% of requests to return 404.',
      severity: 'P1',
      affectedServices: ['api-gateway'],
      symptoms: ['40% of requests returning 404', 'Specific endpoint categories affected', 'Config change in audit log'],
      rootCause: 'Misconfigured routing rules in API Gateway config v1.3.1. Path rewrite regex error.',
      impact: '8 minutes of partial outage. Multiple customer journeys broken.',
      resolvedAt: new Date('2024-06-20T09:08:00Z'),
      detectedAt: new Date('2024-06-20T09:00:00Z'),
    },
    {
      title: 'Checkout Deployment Regression v4.2.1',
      description: 'Deployment v4.2.1 introduced slow regex causing CPU spike and latency increase.',
      severity: 'P2',
      affectedServices: ['checkout-service'],
      symptoms: ['CPU usage 89%', 'Request processing time 3x normal', 'Correlates with v4.2.1 deploy'],
      rootCause: 'ReDoS vulnerability in input validation regex introduced in v4.2.1 causing exponential backtracking',
      impact: '45 minutes of degraded performance. P99 latency > 8000ms.',
      resolvedAt: new Date('2024-05-14T16:45:00Z'),
      detectedAt: new Date('2024-05-14T16:00:00Z'),
    },
    {
      title: 'PostgreSQL Disk Space Critical',
      description: 'PostgreSQL disk usage reached 95% causing query failures.',
      severity: 'P2',
      affectedServices: ['postgresql', 'checkout-service', 'payment-service'],
      symptoms: ['Write operations failing', 'Disk usage 95%+', 'Checkpoint errors in PostgreSQL logs'],
      rootCause: 'WAL log accumulation due to stalled replication slot consuming disk space over 3 days',
      impact: '22 minutes of write failure across all services dependent on PostgreSQL.',
      resolvedAt: new Date('2024-04-08T03:22:00Z'),
      detectedAt: new Date('2024-04-08T03:00:00Z'),
    },
    {
      title: 'Payment Service Vendor API Timeout',
      description: 'Stripe API intermittent timeouts causing payment failures without circuit breaker.',
      severity: 'P2',
      affectedServices: ['payment-service'],
      symptoms: ['Payment timeout rate 15%', 'Stripe API response time > 10s', 'No circuit breaker protection'],
      rootCause: 'Stripe API experiencing regional degradation. Payment service lacked circuit breaker causing cascading timeouts.',
      impact: '52 minutes of elevated payment failure rate. Approximately 890 failed transactions.',
      resolvedAt: new Date('2024-03-22T18:52:00Z'),
      detectedAt: new Date('2024-03-22T18:00:00Z'),
    },
    {
      title: 'Traffic Surge - Database Connection Exhaustion v2',
      description: 'Second occurrence of connection pool exhaustion. Identical root cause to Black Friday incident.',
      severity: 'P1',
      affectedServices: ['checkout-service', 'postgresql'],
      symptoms: ['DB connections at max', 'Checkout failures 28%', 'Same pattern as incident-BF-2024'],
      rootCause: 'Connection pool exhaustion - IDENTICAL to Black Friday 2024 incident. Mitigation from that incident was not implemented.',
      impact: '15 minutes of checkout degradation. Previous postmortem action items were not completed.',
      resolvedAt: new Date('2024-02-14T20:15:00Z'),
      detectedAt: new Date('2024-02-14T20:00:00Z'),
    },
    {
      title: 'Auth Service Memory Spike - v2.0.9',
      description: 'JWT token cache growing unbounded causing OOM kills.',
      severity: 'P2',
      affectedServices: ['auth-service'],
      symptoms: ['Memory usage 95%+', 'OOM kills in logs', 'Auth latency increasing'],
      rootCause: 'JWT blacklist cache had no eviction policy. Deployed in v2.0.9. Cache grew unbounded over 3 days.',
      impact: '35 minutes of auth service degradation. Multiple OOM restarts.',
      resolvedAt: new Date('2024-01-30T11:35:00Z'),
      detectedAt: new Date('2024-01-30T11:00:00Z'),
    },
    {
      title: 'Notification Service Message Queue Backup',
      description: 'Message queue backed up to 2M messages causing delayed order confirmations.',
      severity: 'P3',
      affectedServices: ['notification-service'],
      symptoms: ['Queue depth 2M messages', 'Notification delay 45+ minutes', 'Consumer lag increasing'],
      rootCause: 'Consumer group rebalancing storm after deployment caused extended pause in message processing',
      impact: 'Order confirmation emails delayed by up to 2 hours for ~50,000 customers.',
      resolvedAt: new Date('2024-01-12T15:30:00Z'),
      detectedAt: new Date('2024-01-12T13:00:00Z'),
    },
    {
      title: 'Checkout Service v4.5.1 Rollback Success',
      description: 'Rapid rollback of v4.5.1 after deployment caused 3x error rate increase.',
      severity: 'P2',
      affectedServices: ['checkout-service'],
      symptoms: ['Error rate 3x after v4.5.1 deploy', 'Checkout success rate dropped to 85%'],
      rootCause: 'Database schema migration in v4.5.1 was not backward compatible with existing stored procedures.',
      impact: '7 minutes of degraded service. Rollback completed in 4 minutes.',
      resolvedAt: new Date('2023-12-05T14:07:00Z'),
      detectedAt: new Date('2023-12-05T14:00:00Z'),
    },
    {
      title: 'PostgreSQL Query Performance Regression',
      description: 'Missing index after schema change caused full table scans on high-frequency query.',
      severity: 'P3',
      affectedServices: ['postgresql', 'inventory-service'],
      symptoms: ['Inventory queries 10x slower', 'DB CPU elevated', 'Missing index detected in EXPLAIN'],
      rootCause: 'Schema migration dropped and recreated table without recreating performance indexes.',
      impact: '3 hours of inventory lookup degradation. Checkout affected due to slow inventory validation.',
      resolvedAt: new Date('2023-11-18T17:00:00Z'),
      detectedAt: new Date('2023-11-18T14:00:00Z'),
    },
    {
      title: 'Connection Pool Exhaustion - Cyber Monday',
      description: 'Third instance of connection pool exhaustion. Confirmed pattern of traffic surge causing DB exhaustion.',
      severity: 'P1',
      affectedServices: ['checkout-service', 'payment-service', 'postgresql'],
      symptoms: ['Identical to Black Friday 2024 incident', 'DB connections 99/100', 'Checkout error rate 41%'],
      rootCause: 'Recurring pattern: traffic surge → connection pool exhaustion → checkout/payment cascade. Root cause from Black Friday never fully fixed.',
      impact: '22 minutes of checkout outage. $890K estimated revenue impact.',
      resolvedAt: new Date('2023-11-27T14:22:00Z'),
      detectedAt: new Date('2023-11-27T14:00:00Z'),
    },
  ];

  for (const inc of historicalIncidents) {
    const incidentId = `hist-${inc.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 30)}`;

    const existing = await prisma.incident.findUnique({ where: { id: incidentId } });
    if (existing) continue;

    const incident = await prisma.incident.create({
      data: {
        id: incidentId,
        title: inc.title,
        description: inc.description,
        severity: inc.severity,
        status: 'LEARNING_RETAINED',
        detectedAt: inc.detectedAt,
        resolvedAt: inc.resolvedAt,
        acknowledgedAt: new Date(inc.detectedAt.getTime() + 2 * 60 * 1000),
        affectedServices: JSON.stringify(inc.affectedServices),
        symptoms: JSON.stringify(inc.symptoms),
        rootCause: inc.rootCause,
        impact: inc.impact,
        autonomyMode: 'APPROVAL_REQUIRED',
        learningStatus: 'RETAINED',
      },
    });

    // Create postmortem for each
    await prisma.postmortem.create({
      data: {
        incidentId: incident.id,
        summary: `${inc.title}: ${inc.rootCause}`,
        detection: 'Automated monitoring alert triggered based on error rate threshold',
        impact: inc.impact,
        timeline: JSON.stringify([
          `${inc.detectedAt.toISOString()}: Incident detected`,
          `${new Date(inc.detectedAt.getTime() + 120000).toISOString()}: Acknowledged by on-call SRE`,
          `${inc.resolvedAt.toISOString()}: Incident resolved`,
        ]),
        rootCause: inc.rootCause,
        contributingFactors: JSON.stringify(['Insufficient monitoring', 'Missing runbook execution']),
        investigation: `Agent investigated using hypothesis-driven approach. Root cause identified: ${inc.rootCause}`,
        actionsAttempted: JSON.stringify(['Investigated metrics', 'Checked logs', 'Applied remediation']),
        whatWorked: 'Hypothesis-driven investigation quickly identified root cause. Rollback/scale action was effective.',
        whatFailed: 'Initial detection was delayed. Manual intervention required.',
        resolution: `Resolved by ${inc.resolvedAt.toISOString()}. Root cause: ${inc.rootCause}`,
        prevention: 'Implement automated scaling policies. Add pre-flight checks to deployment pipeline. Update runbooks.',
        observabilityImprovements: 'Add connection pool metrics dashboard. Alert on 80% threshold not 100%.',
        runbookImprovements: 'Update runbook with specific commands for this scenario.',
        followUpActions: JSON.stringify([
          'Implement connection pool scaling automation',
          'Add deployment regression detection',
          'Update monitoring thresholds',
        ]),
        status: 'RETAINED',
        retainedToMemory: true,
      },
    });

    // Create some events
    await prisma.incidentEvent.createMany({
      data: [
        { incidentId: incident.id, type: 'DETECTED', message: `Incident detected: ${inc.title}`, actor: 'monitoring', timestamp: inc.detectedAt },
        { incidentId: incident.id, type: 'RESOLVED', message: 'Incident resolved', actor: 'sre-team', timestamp: inc.resolvedAt },
        { incidentId: incident.id, type: 'LEARNING_RETAINED', message: 'Learning retained to Hindsight memory', actor: 'agent', timestamp: inc.resolvedAt },
      ],
    });
  }

  // ─── Add deployment history ────────────────────────────────────────────────

  const deployments = [
    { serviceId: 'checkout-service', version: '4.5.2', previousVersion: '4.5.1', deployedBy: 'ci-pipeline', status: 'SUCCESS', notes: 'Bug fixes and performance improvements' },
    { serviceId: 'checkout-service', version: '4.5.1', previousVersion: '4.5.0', deployedBy: 'ci-pipeline', status: 'ROLLED_BACK', notes: 'Schema migration compatibility issue' },
    { serviceId: 'payment-service', version: '1.8.3', previousVersion: '1.8.2', deployedBy: 'ci-pipeline', status: 'SUCCESS', notes: 'Circuit breaker improvements' },
    { serviceId: 'auth-service', version: '2.1.0', previousVersion: '2.0.9', deployedBy: 'ci-pipeline', status: 'SUCCESS', notes: 'JWT cache eviction policy fix' },
    { serviceId: 'api-gateway', version: '3.2.1', previousVersion: '3.2.0', deployedBy: 'platform-team', status: 'SUCCESS', notes: 'Routing improvements' },
  ];

  for (const dep of deployments) {
    const existing = await prisma.deployment.findFirst({
      where: { serviceId: dep.serviceId, version: dep.version },
    });
    if (!existing) {
      await prisma.deployment.create({
        data: {
          ...dep,
          deployedAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
        },
      });
    }
  }

  console.log('Database seeded successfully!');
  console.log('- 3 users created');
  console.log('- 7 services created');
  console.log('- 3 runbooks created');
  console.log('- 15 historical incidents created');
  console.log('- 15 postmortems created');
  console.log('- Deployment history seeded');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
