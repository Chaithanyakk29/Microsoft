/**
 * HindsightMemoryService
 *
 * The single abstraction over the Hindsight SDK.
 * No other part of the application should directly call the Hindsight SDK.
 *
 * Design decisions:
 * - All memory operations are logged to the MemoryOperation table for auditability
 * - Graceful degradation: if Hindsight is unavailable, operations return empty results
 * - Memory is organized by operational context (incidents, services, patterns)
 * - Historical evidence is always clearly labeled to prevent confusion with current state
 */

import { HindsightClient } from '@vectorize-io/hindsight-client';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { prisma } from '../db/client';
import { MemoryResult } from '../types';

// Structured memory content interfaces
export interface IncidentExperience {
  incidentId: string;
  title: string;
  service: string;
  symptoms: string[];
  severity: string;
  time: string;
  rootCause: string;
  impact: string;
  duration?: number;
}

export interface DiagnosticResult {
  incidentId: string;
  hypothesis: string;
  diagnostic: string;
  evidence: string;
  result: 'SUPPORTED' | 'REJECTED' | 'INCONCLUSIVE';
  confidence: number;
}

export interface ActionOutcome {
  incidentId: string;
  action: string;
  parameters: string;
  service: string;
  result: 'SUCCESS' | 'FAILURE' | 'PARTIAL';
  impact: string;
  duration?: number;
}

export interface PostmortemLearning {
  incidentId: string;
  service: string;
  rootCause: string;
  whatWorked: string;
  whatFailed: string;
  prevention: string;
  lessons: string;
}

export interface RecallResult {
  memories: MemoryResult[];
  memoryOperationId: string;
  available: boolean;
  query: string;
}

export interface ReflectResult {
  synthesis: string;
  memoryOperationId: string;
  available: boolean;
  query: string;
}

class HindsightMemoryService {
  private client: HindsightClient | null = null;
  private available = false;
  private bankId: string;

  constructor() {
    this.bankId = config.hindsightBankId;
    if (config.hindsightEnabled && config.hindsightApiKey) {
      try {
        this.client = new HindsightClient({
          baseUrl: config.hindsightBaseUrl,
          apiKey: config.hindsightApiKey,
        });
        this.available = true;
        console.log('[HindsightMemoryService] Initialized with Hindsight Cloud');
      } catch (err) {
        console.warn('[HindsightMemoryService] Failed to initialize client:', err);
        this.available = false;
      }
    } else if (config.hindsightEnabled) {
      // Try without API key (local server)
      try {
        this.client = new HindsightClient({
          baseUrl: config.hindsightBaseUrl,
        });
        this.available = true;
        console.log('[HindsightMemoryService] Initialized with local Hindsight server');
      } catch (err) {
        console.warn('[HindsightMemoryService] Failed to initialize local client:', err);
        this.available = false;
      }
    } else {
      console.log('[HindsightMemoryService] Hindsight disabled by configuration');
    }
  }

  isAvailable(): boolean {
    return this.available && this.client !== null;
  }

  /**
   * Retain a complete incident experience in Hindsight memory.
   * Called after incident resolution to preserve operational knowledge.
   */
  async retainIncidentExperience(experience: IncidentExperience): Promise<string | null> {
    const content = `INCIDENT EXPERIENCE [${experience.time}]
Service: ${experience.service}
Severity: ${experience.severity}
Title: ${experience.title}
Symptoms: ${experience.symptoms.join('; ')}
Root Cause: ${experience.rootCause}
Impact: ${experience.impact}
${experience.duration ? `Duration: ${experience.duration} minutes` : ''}
Incident ID: ${experience.incidentId}`;

    return this.performRetain(content, experience.incidentId, 'incident_experience', {
      service: experience.service,
      severity: experience.severity,
      rootCause: experience.rootCause,
    });
  }

  /**
   * Retain a diagnostic result for future hypothesis validation.
   */
  async retainDiagnosticResult(result: DiagnosticResult): Promise<string | null> {
    const content = `DIAGNOSTIC RESULT
Incident: ${result.incidentId}
Hypothesis: ${result.hypothesis}
Diagnostic: ${result.diagnostic}
Evidence: ${result.evidence}
Result: ${result.result}
Confidence: ${(result.confidence * 100).toFixed(0)}%`;

    return this.performRetain(content, result.incidentId, 'diagnostic_result', {
      result: result.result,
      confidence: String(result.confidence),
    });
  }

  /**
   * Retain the outcome of an executed action.
   * Critical for learning which remediations work.
   */
  async retainActionOutcome(outcome: ActionOutcome): Promise<string | null> {
    const content = `ACTION OUTCOME
Incident: ${outcome.incidentId}
Service: ${outcome.service}
Action: ${outcome.action}
Parameters: ${outcome.parameters}
Result: ${outcome.result}
Impact: ${outcome.impact}
${outcome.duration ? `Duration: ${outcome.duration}s` : ''}`;

    return this.performRetain(content, outcome.incidentId, 'action_outcome', {
      action: outcome.action,
      service: outcome.service,
      result: outcome.result,
    });
  }

  /**
   * Retain postmortem learnings - the highest-value operational knowledge.
   */
  async retainPostmortem(learning: PostmortemLearning): Promise<string | null> {
    const content = `POSTMORTEM LEARNING
Incident: ${learning.incidentId}
Service: ${learning.service}
Root Cause: ${learning.rootCause}
What Worked: ${learning.whatWorked}
What Failed: ${learning.whatFailed}
Prevention: ${learning.prevention}
Lessons: ${learning.lessons}`;

    return this.performRetain(content, learning.incidentId, 'postmortem', {
      service: learning.service,
      rootCause: learning.rootCause,
    });
  }

  /**
   * Recall similar historical incidents based on current symptoms and service.
   */
  async recallSimilarIncidents(
    service: string,
    symptoms: string[],
    incidentId?: string,
  ): Promise<RecallResult> {
    const query = `Historical incidents affecting ${service} with symptoms: ${symptoms.join(', ')}`;
    return this.performRecall(query, incidentId);
  }

  /**
   * Recall service-specific operational history.
   */
  async recallServiceHistory(service: string, incidentId?: string): Promise<RecallResult> {
    const query = `Operational history, incidents, failures, and remediations for ${service} service`;
    return this.performRecall(query, incidentId);
  }

  /**
   * Recall relevant remediation knowledge for a given action.
   */
  async recallRelevantRemediation(
    action: string,
    service: string,
    incidentId?: string,
  ): Promise<RecallResult> {
    const query = `Historical outcomes of ${action} on ${service} service - what worked and what failed`;
    return this.performRecall(query, incidentId);
  }

  /**
   * Reflect on overall incident history to synthesize patterns.
   * Uses Hindsight's LLM-backed reflection for higher-order reasoning.
   */
  async reflectOnIncidentHistory(query: string, incidentId?: string): Promise<ReflectResult> {
    return this.performReflect(query, incidentId);
  }

  /**
   * Get a synthesized reliability model for a service.
   */
  async getServiceReliabilityModel(service: string): Promise<ReflectResult> {
    const query = `What are the common failure modes for ${service}? What patterns of degradation occur? Which remediations are most effective? Build a reliability profile based on historical incidents.`;
    return this.performReflect(query);
  }

  /**
   * Get historical failure patterns across all services.
   */
  async getHistoricalFailurePatterns(): Promise<ReflectResult> {
    const query = `What are the most common failure patterns across all services? Which services fail together? What are the leading indicators of major incidents?`;
    return this.performReflect(query);
  }

  /**
   * Get proven remediation knowledge for a specific symptom.
   */
  async getProvenRemediationKnowledge(symptom: string, service?: string): Promise<ReflectResult> {
    const query = `What remediations have been proven effective for "${symptom}"${service ? ` on ${service}` : ''}? What should be tried first vs last?`;
    return this.performReflect(query);
  }

  // ─── Private implementation methods ─────────────────────────────────────────

  private async performRetain(
    content: string,
    incidentId: string | undefined,
    type: string,
    metadata: Record<string, string> = {},
  ): Promise<string | null> {
    const memoryOpId = uuidv4();
    const startTime = Date.now();

    if (!this.isAvailable() || !this.client) {
      await this.logMemoryOp({
        id: memoryOpId,
        type: 'retain',
        bankId: this.bankId,
        content,
        incidentId,
        duration: 0,
        success: false,
        error: 'Hindsight not available',
      });
      return null;
    }

    try {
      // Enrich content with metadata as structured text
      const enrichedContent = `${content}
Type: ${type}
Tags: ${Object.entries(metadata)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ')}`;

      await this.client.retain(this.bankId, enrichedContent);

      const duration = Date.now() - startTime;
      await this.logMemoryOp({
        id: memoryOpId,
        type: 'retain',
        bankId: this.bankId,
        content: content.substring(0, 500),
        incidentId,
        duration,
        success: true,
      });

      console.log(`[Hindsight] Retained memory (${type}) in ${duration}ms`);
      return memoryOpId;
    } catch (err) {
      const duration = Date.now() - startTime;
      const error = err instanceof Error ? err.message : String(err);
      console.error(`[Hindsight] Retain failed:`, error);

      await this.logMemoryOp({
        id: memoryOpId,
        type: 'retain',
        bankId: this.bankId,
        content: content.substring(0, 500),
        incidentId,
        duration,
        success: false,
        error,
      });

      // Mark as unavailable on repeated failures
      this.available = false;
      return null;
    }
  }

  private async performRecall(query: string, incidentId?: string): Promise<RecallResult> {
    const memoryOpId = uuidv4();
    const startTime = Date.now();

    if (!this.isAvailable() || !this.client) {
      await this.logMemoryOp({
        id: memoryOpId,
        type: 'recall',
        bankId: this.bankId,
        query,
        incidentId,
        duration: 0,
        success: false,
        error: 'Hindsight not available',
      });

      return {
        memories: [],
        memoryOperationId: memoryOpId,
        available: false,
        query,
      };
    }

    try {
      const result = await this.client.recall(this.bankId, query);
      const duration = Date.now() - startTime;

      // Parse Hindsight result - it returns a string or structured data
      const memories: MemoryResult[] = this.parseRecallResult(result);

      await this.logMemoryOp({
        id: memoryOpId,
        type: 'recall',
        bankId: this.bankId,
        query,
        result: JSON.stringify(memories).substring(0, 1000),
        incidentId,
        duration,
        success: true,
      });

      console.log(`[Hindsight] Recalled ${memories.length} memories for: "${query}" in ${duration}ms`);

      return {
        memories,
        memoryOperationId: memoryOpId,
        available: true,
        query,
      };
    } catch (err) {
      const duration = Date.now() - startTime;
      const error = err instanceof Error ? err.message : String(err);
      console.error(`[Hindsight] Recall failed:`, error);

      await this.logMemoryOp({
        id: memoryOpId,
        type: 'recall',
        bankId: this.bankId,
        query,
        incidentId,
        duration,
        success: false,
        error,
      });

      return {
        memories: [],
        memoryOperationId: memoryOpId,
        available: false,
        query,
      };
    }
  }

  private async performReflect(query: string, incidentId?: string): Promise<ReflectResult> {
    const memoryOpId = uuidv4();
    const startTime = Date.now();

    if (!this.isAvailable() || !this.client) {
      await this.logMemoryOp({
        id: memoryOpId,
        type: 'reflect',
        bankId: this.bankId,
        query,
        incidentId,
        duration: 0,
        success: false,
        error: 'Hindsight not available',
      });

      return {
        synthesis: '',
        memoryOperationId: memoryOpId,
        available: false,
        query,
      };
    }

    try {
      const result = await this.client.reflect(this.bankId, query);
      const duration = Date.now() - startTime;

      const synthesis = typeof result === 'string'
        ? result
        : (result as Record<string, unknown>)['text'] as string
          || JSON.stringify(result);

      await this.logMemoryOp({
        id: memoryOpId,
        type: 'reflect',
        bankId: this.bankId,
        query,
        result: synthesis.substring(0, 1000),
        incidentId,
        duration,
        success: true,
      });

      console.log(`[Hindsight] Reflected on: "${query}" in ${duration}ms`);

      return {
        synthesis,
        memoryOperationId: memoryOpId,
        available: true,
        query,
      };
    } catch (err) {
      const duration = Date.now() - startTime;
      const error = err instanceof Error ? err.message : String(err);
      console.error(`[Hindsight] Reflect failed:`, error);

      await this.logMemoryOp({
        id: memoryOpId,
        type: 'reflect',
        bankId: this.bankId,
        query,
        incidentId,
        duration,
        success: false,
        error,
      });

      return {
        synthesis: '',
        memoryOperationId: memoryOpId,
        available: false,
        query,
      };
    }
  }

  private parseRecallResult(result: unknown): MemoryResult[] {
    if (!result) return [];

    // Hindsight v0.10.x RecallResponse has a `results` array of RecallResult objects
    if (typeof result === 'object' && result !== null) {
      const obj = result as Record<string, unknown>;

      // Standard RecallResponse shape: { results: RecallResult[] }
      if (obj['results'] && Array.isArray(obj['results'])) {
        return (obj['results'] as Array<{ id: string; text: string; type?: string; score?: number }>)
          .filter((r) => r.text && r.text.trim().length > 0)
          .map((r) => ({
            id: r.id,
            content: r.text,
            source: 'hindsight_recall' as const,
            relevanceScore: r.score ?? 0.8,
            metadata: r.type ? { type: r.type } : undefined,
          }));
      }

      // Legacy formats
      if (obj['memories'] && Array.isArray(obj['memories'])) {
        return (obj['memories'] as Array<{ content?: string; text?: string; score?: number }>).map((m) => ({
          content: m.content ?? m.text ?? JSON.stringify(m),
          source: 'hindsight_recall' as const,
          relevanceScore: m.score ?? 0.7,
        }));
      }
      if (obj['result']) {
        return [{ content: String(obj['result']), source: 'hindsight_recall', relevanceScore: 0.8 }];
      }
    }

    if (typeof result === 'string' && result.trim().length > 0) {
      return [{ content: result, source: 'hindsight_recall', relevanceScore: 1.0 }];
    }

    if (Array.isArray(result)) {
      return (result as Array<{ text?: string; content?: string }>).map((item) => ({
        content: item.text ?? item.content ?? JSON.stringify(item),
        source: 'hindsight_recall' as const,
        relevanceScore: 0.8,
      }));
    }

    return [];
  }

  private async logMemoryOp(op: {
    id: string;
    type: string;
    bankId: string;
    query?: string;
    content?: string;
    result?: string;
    incidentId?: string;
    duration: number;
    success: boolean;
    error?: string;
  }): Promise<void> {
    try {
      await prisma.memoryOperation.create({
        data: {
          id: op.id,
          type: op.type,
          bankId: op.bankId,
          query: op.query,
          content: op.content,
          result: op.result,
          incidentId: op.incidentId,
          duration: op.duration,
          success: op.success,
          error: op.error,
        },
      });
    } catch (err) {
      // Don't let logging failure propagate
      console.error('[HindsightMemoryService] Failed to log memory op:', err);
    }
  }
}

// Singleton instance
export const hindsightMemory = new HindsightMemoryService();
export default hindsightMemory;
