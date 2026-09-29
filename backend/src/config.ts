import dotenv from 'dotenv';
import path from 'path';

dotenv.config(); // loads .env in cwd
dotenv.config({ path: path.resolve(__dirname, '../.env') }); // backend/.env
dotenv.config({ path: path.resolve(__dirname, '../../.env') }); // root .env

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // LLM Configuration
  llmProvider: (process.env.LLM_PROVIDER || 'anthropic') as 'anthropic' | 'openai' | 'mock',
  llmModel: process.env.LLM_MODEL || 'claude-3-5-sonnet-20241022',
  llmApiKey: process.env.LLM_API_KEY || '',

  // Hindsight Configuration
  hindsightBaseUrl: process.env.HINDSIGHT_BASE_URL || 'http://localhost:8888',
  hindsightApiKey: process.env.HINDSIGHT_API_KEY || '',
  hindsightEnabled: process.env.HINDSIGHT_ENABLED !== 'false',
  hindsightBankId: process.env.HINDSIGHT_BANK_ID || 'recall-ops-incidents',

  // Database
  databaseUrl: process.env.DATABASE_URL || 'file:./dev.db',

  // Security
  jwtSecret: process.env.JWT_SECRET || 'recall-ops-dev-secret-change-in-prod',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',

  // Agent
  agentMaxIterations: parseInt(process.env.AGENT_MAX_ITERATIONS || '15', 10),
  agentTimeoutMs: parseInt(process.env.AGENT_TIMEOUT_MS || '300000', 10),

  // Demo mode
  demoMode: process.env.DEMO_MODE === 'true',
} as const;

export type Config = typeof config;
