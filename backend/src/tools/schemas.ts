/**
 * Tool Schema Definitions
 *
 * Strongly typed input schemas for all agent tools.
 * These are passed to the LLM so it knows what tools are available.
 */

import { LLMTool } from '../types';

export const TOOL_DEFINITIONS: LLMTool[] = [
  {
    name: 'getServiceHealth',
    description:
      'Get current health status and key metrics for one or all services. Use "all" for serviceId to get all services.',
    input_schema: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string',
          description: 'Service ID or "all" for all services',
        },
      },
      required: ['serviceId'],
    },
  },
  {
    name: 'getServiceMetrics',
    description: 'Get detailed metrics for a specific service including CPU, memory, latency percentiles, error rate.',
    input_schema: {
      type: 'object',
      properties: {
        serviceId: { type: 'string', description: 'The service ID' },
      },
      required: ['serviceId'],
    },
  },
  {
    name: 'getLogs',
    description: 'Retrieve recent log entries for a service. Look for ERROR and WARN level entries.',
    input_schema: {
      type: 'object',
      properties: {
        serviceId: { type: 'string' },
        limit: { type: 'number', description: 'Max log entries to return (default 20)' },
      },
      required: ['serviceId'],
    },
  },
  {
    name: 'getRecentDeployments',
    description: 'Get recent deployments for one or all services. Essential for deployment regression analysis.',
    input_schema: {
      type: 'object',
      properties: {
        serviceId: { type: 'string', description: 'Service ID or omit for all services' },
      },
      required: [],
    },
  },
  {
    name: 'getRecentConfigChanges',
    description: 'Get recent configuration changes that could be related to the incident.',
    input_schema: {
      type: 'object',
      properties: {
        serviceId: { type: 'string' },
      },
      required: [],
    },
  },
  {
    name: 'getDependencyGraph',
    description:
      'Get the service dependency graph. Shows which services depend on which others and their health.',
    input_schema: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string',
          description: 'Focus on this service and its dependencies. Omit for full graph.',
        },
      },
      required: [],
    },
  },
  {
    name: 'searchRunbooks',
    description: 'Search internal runbooks for relevant procedures matching the current incident type.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query for relevant runbooks' },
        service: { type: 'string', description: 'Optional: filter by service' },
      },
      required: ['query'],
    },
  },
  {
    name: 'searchIncidentMemory',
    description:
      'Search Hindsight persistent memory for similar historical incidents. Returns labeled HISTORICAL evidence. Always use this early in investigation.',
    input_schema: {
      type: 'object',
      properties: {
        service: { type: 'string', description: 'The affected service name' },
        symptoms: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of current symptoms to match against historical incidents',
        },
      },
      required: ['service', 'symptoms'],
    },
  },
  {
    name: 'reflectOnIncidentHistory',
    description:
      'Ask Hindsight to synthesize and reflect on patterns in incident history. Use for higher-order reasoning like "What commonly causes this service to fail?"',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Reflection question about historical patterns, e.g. "What normally causes checkout to fail?"',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'createHypothesis',
    description: 'Create a formal hypothesis about the root cause with supporting and contradicting evidence.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Short name for the hypothesis' },
        description: { type: 'string', description: 'Detailed description of the hypothesis' },
        confidence: {
          type: 'number',
          description: 'Confidence score 0.0-1.0 based on available evidence',
        },
        supportingEvidence: {
          type: 'array',
          items: { type: 'string' },
          description: 'Evidence supporting this hypothesis',
        },
        contradictingEvidence: {
          type: 'array',
          items: { type: 'string' },
          description: 'Evidence contradicting this hypothesis',
        },
        nextDiagnostic: {
          type: 'string',
          description: 'Next diagnostic step to validate or reject this hypothesis',
        },
      },
      required: ['name', 'description', 'confidence', 'supportingEvidence', 'contradictingEvidence'],
    },
  },
  {
    name: 'updateHypothesis',
    description: 'Update hypothesis status and confidence after diagnostic validation.',
    input_schema: {
      type: 'object',
      properties: {
        hypothesisId: { type: 'string' },
        status: {
          type: 'string',
          enum: ['PROPOSED', 'TESTING', 'SUPPORTED', 'REJECTED', 'INCONCLUSIVE'],
        },
        confidence: { type: 'number' },
        supportingEvidence: { type: 'array', items: { type: 'string' } },
        contradictingEvidence: { type: 'array', items: { type: 'string' } },
      },
      required: ['hypothesisId'],
    },
  },
  {
    name: 'createInvestigationNote',
    description: 'Add an investigation note to the incident timeline.',
    input_schema: {
      type: 'object',
      properties: {
        note: { type: 'string', description: 'Investigation note content' },
      },
      required: ['note'],
    },
  },
  {
    name: 'proposeAction',
    description:
      'Propose a remediation action. The policy engine will evaluate risk and determine if approval is needed. Never attempt to bypass this.',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['executeRollback', 'restartService', 'scaleService', 'clearCache'],
          description: 'The specific action to take',
        },
        service: { type: 'string', description: 'Target service ID' },
        parameters: {
          type: 'object',
          description: 'Action-specific parameters',
        },
        reason: {
          type: 'string',
          description: 'Detailed explanation of why this action is needed based on evidence',
        },
        estimatedImpact: {
          type: 'string',
          description: 'Expected impact of this action if successful',
        },
      },
      required: ['action', 'service', 'parameters', 'reason'],
    },
  },
  {
    name: 'verifyServiceHealth',
    description: 'Verify that a service has recovered after remediation.',
    input_schema: {
      type: 'object',
      properties: {
        service: { type: 'string', description: 'Service to verify' },
      },
      required: ['service'],
    },
  },
  {
    name: 'createPostmortem',
    description: 'Create a structured postmortem document after incident resolution.',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        detection: { type: 'string', description: 'How the incident was detected' },
        impact: { type: 'string' },
        timeline: { type: 'array', items: { type: 'string' } },
        rootCause: { type: 'string' },
        contributingFactors: { type: 'array', items: { type: 'string' } },
        investigation: { type: 'string' },
        actionsAttempted: { type: 'array', items: { type: 'string' } },
        whatWorked: { type: 'string' },
        whatFailed: { type: 'string' },
        resolution: { type: 'string' },
        prevention: { type: 'string' },
        observabilityImprovements: { type: 'string' },
        runbookImprovements: { type: 'string' },
        followUpActions: { type: 'array', items: { type: 'string' } },
      },
      required: ['summary', 'rootCause', 'resolution'],
    },
  },
  {
    name: 'retainIncidentLearning',
    description:
      'Retain the incident experience and postmortem learning into Hindsight persistent memory. Call this as the final step after resolution.',
    input_schema: {
      type: 'object',
      properties: {
        rootCause: { type: 'string', description: 'Confirmed root cause' },
        lessons: { type: 'string', description: 'Key lessons learned from this incident' },
      },
      required: ['rootCause', 'lessons'],
    },
  },
];
