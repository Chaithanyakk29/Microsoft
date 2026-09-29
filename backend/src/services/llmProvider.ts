/**
 * LLM Provider Abstraction
 *
 * Supports Anthropic Claude, OpenAI, and a mock provider for testing.
 * Provider is selected via LLM_PROVIDER env variable.
 * All providers implement the same interface with structured tool calling.
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { config } from '../config';
import { LLMTool, LLMToolCall } from '../types';

export interface LLMMessage {
  role: 'user' | 'assistant';
  content:
    | string
    | Array<{
        type: string;
        tool_use_id?: string;
        content?: string | { type: string; text?: string; input?: unknown; id?: string; name?: string }[];
        id?: string;
        name?: string;
        input?: unknown;
        text?: string;
      }>;
}

export interface LLMResponse {
  content: string;
  toolCalls: LLMToolCall[];
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'error';
  usage?: { inputTokens: number; outputTokens: number };
}

export interface LLMCallOptions {
  systemPrompt: string;
  messages: LLMMessage[];
  tools: LLMTool[];
  maxTokens?: number;
  temperature?: number;
}

export interface LLMProvider {
  call(options: LLMCallOptions): Promise<LLMResponse>;
  name: string;
}

// ─── Anthropic Provider ──────────────────────────────────────────────────────

class AnthropicProvider implements LLMProvider {
  name = 'anthropic';
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: config.llmApiKey });
  }

  async call(options: LLMCallOptions): Promise<LLMResponse> {
    const { systemPrompt, messages, tools, maxTokens = 4096 } = options;

    const anthropicTools: Anthropic.Tool[] = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema as Anthropic.Tool['input_schema'],
    }));

    const anthropicMessages: Anthropic.MessageParam[] = messages.map((m) => ({
      role: m.role,
      content:
        typeof m.content === 'string'
          ? m.content
          : (m.content as Anthropic.ContentBlock[]),
    }));

    const response = await this.client.messages.create({
      model: config.llmModel,
      max_tokens: maxTokens,
      system: systemPrompt,
      tools: anthropicTools,
      messages: anthropicMessages,
    });

    const toolCalls: LLMToolCall[] = [];
    let textContent = '';

    for (const block of response.content) {
      if (block.type === 'text') {
        textContent += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          type: 'tool_use',
          name: block.name,
          input: block.input as Record<string, unknown>,
        });
      }
    }

    return {
      content: textContent,
      toolCalls,
      stopReason:
        response.stop_reason === 'tool_use'
          ? 'tool_use'
          : response.stop_reason === 'end_turn'
          ? 'end_turn'
          : 'max_tokens',
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}

// ─── OpenAI Provider ─────────────────────────────────────────────────────────

class OpenAIProvider implements LLMProvider {
  name = 'openai';
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({ apiKey: config.llmApiKey });
  }

  async call(options: LLMCallOptions): Promise<LLMResponse> {
    const { systemPrompt, messages, tools, maxTokens = 4096 } = options;

    const openaiTools: OpenAI.Chat.ChatCompletionTool[] = tools.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }));

    const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      })),
    ];

    const response = await this.client.chat.completions.create({
      model: config.llmModel,
      max_tokens: maxTokens,
      tools: openaiTools,
      messages: openaiMessages,
      tool_choice: 'auto',
    });

    const choice = response.choices[0];
    const toolCalls: LLMToolCall[] = (choice.message.tool_calls || []).map((tc) => ({
      id: tc.id,
      type: 'tool_use' as const,
      name: tc.function.name,
      input: JSON.parse(tc.function.arguments) as Record<string, unknown>,
    }));

    return {
      content: choice.message.content || '',
      toolCalls,
      stopReason: choice.finish_reason === 'tool_calls' ? 'tool_use' : 'end_turn',
      usage: {
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0,
      },
    };
  }
}

// ─── Mock Provider (for testing/demo without API keys) ────────────────────────

class MockProvider implements LLMProvider {
  name = 'mock';

  async call(options: LLMCallOptions): Promise<LLMResponse> {
    const { messages, tools } = options;
    const lastMessage = messages[messages.length - 1];
    const lastContent =
      typeof lastMessage?.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage?.content);

    // Simulate agent behavior deterministically based on message content
    await new Promise((r) => setTimeout(r, 500)); // Simulate API latency

    // First call: gather context
    if (lastContent.includes('investigate') || lastContent.includes('DETECTED')) {
      return {
        content: 'Starting investigation. Let me gather current system context and check memory.',
        toolCalls: [
          {
            id: 'tc-1',
            type: 'tool_use',
            name: 'getServiceHealth',
            input: { serviceId: 'all' },
          },
        ],
        stopReason: 'tool_use',
      };
    }

    // Hypothesis formation
    if (lastContent.includes('errorRate') || lastContent.includes('connections')) {
      return {
        content: 'Based on the metrics, I have identified key anomalies. Let me check historical memory.',
        toolCalls: [
          {
            id: 'tc-2',
            type: 'tool_use',
            name: 'searchIncidentMemory',
            input: {
              service: 'checkout-service',
              symptoms: ['connection pool', 'timeout', 'high error rate'],
            },
          },
        ],
        stopReason: 'tool_use',
      };
    }

    // Find the tool that creates a hypothesis
    const hypothesisTool = tools.find((t) => t.name === 'createHypothesis');
    if (hypothesisTool && !lastContent.includes('hypothesis')) {
      return {
        content: 'Memory retrieved. Forming hypotheses based on evidence.',
        toolCalls: [
          {
            id: 'tc-3',
            type: 'tool_use',
            name: 'createHypothesis',
            input: {
              name: 'Database Connection Pool Exhaustion',
              description:
                'The PostgreSQL connection pool is exhausted due to traffic surge, cascading to checkout and payment services.',
              confidence: 0.87,
              supportingEvidence: [
                'PostgreSQL activeConnections: 97/100',
                'Checkout error rate: 32%',
                'Connection timeout errors in logs',
              ],
              contradictingEvidence: ['No recent DB configuration change'],
              nextDiagnostic: 'Inspect connection acquisition latency and queue depth',
            },
          },
        ],
        stopReason: 'tool_use',
      };
    }

    // Propose action
    if (lastContent.includes('hypothesis') || lastContent.includes('PROPOSED')) {
      return {
        content: 'Hypothesis supported by evidence. Proposing remediation action.',
        toolCalls: [
          {
            id: 'tc-4',
            type: 'tool_use',
            name: 'proposeAction',
            input: {
              action: 'scaleService',
              service: 'postgresql',
              parameters: { targetConnections: 150, immediate: true },
              reason:
                'Connection pool at 97% capacity. Scaling to 150 will immediately relieve pressure on checkout and payment services.',
              estimatedImpact: 'Should reduce checkout error rate from 32% to <1% within 2 minutes.',
            },
          },
        ],
        stopReason: 'tool_use',
      };
    }

    // Default: complete investigation
    return {
      content:
        'Investigation complete. Root cause identified as database connection pool exhaustion. Remediation has been proposed and awaiting approval.',
      toolCalls: [],
      stopReason: 'end_turn',
    };
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createLLMProvider(): LLMProvider {
  if (!config.llmApiKey && config.llmProvider !== 'mock') {
    console.warn('[LLM] No API key configured - using mock provider');
    return new MockProvider();
  }

  switch (config.llmProvider) {
    case 'anthropic':
      return new AnthropicProvider();
    case 'openai':
      return new OpenAIProvider();
    case 'mock':
      return new MockProvider();
    default:
      console.warn(`[LLM] Unknown provider "${config.llmProvider}" - using mock`);
      return new MockProvider();
  }
}

export const llmProvider = createLLMProvider();
