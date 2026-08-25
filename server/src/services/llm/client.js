import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';

const log = logger('llm');

let anthropicClient = null;

function getAnthropicClient() {
  if (env.llm.provider !== 'anthropic') return null;
  if (!anthropicClient) {
    anthropicClient = new Anthropic({
      apiKey: env.llm.apiKey,
      baseURL: env.llm.baseUrl,
      timeout: env.llm.timeoutMs,
      maxRetries: 1,
    });
  }
  return anthropicClient;
}

/** Thrown when the LLM is not configured at all. Callers fall back silently. */
export class LlmDisabledError extends Error {
  constructor() {
    super('LLM is not configured (ANTHROPIC_API_KEY / GROQ_API_KEY is unset)');
    this.name = 'LlmDisabledError';
    this.disabled = true;
  }
}

export class LlmFailureError extends Error {
  constructor(message, { attempts, cause } = {}) {
    super(message);
    this.name = 'LlmFailureError';
    this.attempts = attempts;
    this.cause = cause;
  }
}

function isRetryable(err) {
  if (err instanceof Anthropic.RateLimitError) return true;
  if (err instanceof Anthropic.APIConnectionError) return true;
  if (err instanceof Anthropic.APIConnectionTimeoutError) return true;
  if (err instanceof Anthropic.InternalServerError) return true;
  if (err instanceof Anthropic.APIError) return err.status >= 500 || err.status === 429;
  return ['AbortError', 'TimeoutError', 'FetchError'].includes(err?.name);
}

function cleanJson(str) {
  let cleaned = String(str || '').trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
  return cleaned.trim();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const GROQ_CANDIDATE_MODELS = [
  env.llm.groqModel,
  'openai/gpt-oss-120b',
  'qwen/qwen3.6-27b',
  'llama-3.3-70b-versatile',
  'llama-3.1-70b-versatile',
  'llama3-70b-8192',
].filter(Boolean);

/**
 * Execute structured output completion using Anthropic or Groq based on configured keys.
 */
export async function completeStructured({ system, user, schema, purpose, maxTokens }) {
  if (!env.llm.enabled) throw new LlmDisabledError();

  const provider = env.llm.provider;

  // 1. Groq Completion
  if (provider === 'groq') {
    let lastError;

    // Deduplicate candidate models
    const candidateModels = [...new Set(GROQ_CANDIDATE_MODELS)];

    for (const modelName of candidateModels) {
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const startedAt = Date.now();
        try {
          const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${env.llm.groqApiKey}`,
            },
            body: JSON.stringify({
              model: modelName,
              temperature: 0.1,
              max_tokens: maxTokens ?? env.llm.maxTokens,
              response_format: { type: 'json_object' },
              messages: [
                {
                  role: 'system',
                  content: `${system}\n\nIMPORTANT: Return ONLY a valid JSON object matching the required schema. Do NOT include markdown fences.`,
                },
                { role: 'user', content: user },
              ],
            }),
            signal: AbortSignal.timeout(env.llm.timeoutMs),
          });

          if (!response.ok) {
            const errBody = await response.text();
            if (response.status === 404) {
              // Model not found on this API key, try next candidate model
              lastError = new Error(`Groq model ${modelName} 404: ${errBody}`);
              break;
            }
            throw new Error(`Groq API returned ${response.status}: ${errBody}`);
          }

          const json = await response.json();
          const rawContent = json.choices?.[0]?.message?.content;
          if (!rawContent) throw new Error('Groq returned empty completion content');

          const parsedJson = JSON.parse(cleanJson(rawContent));
          const validated = schema.parse(parsedJson);

          log.info('Groq completion ok', {
            purpose,
            attempt,
            ms: Date.now() - startedAt,
            model: modelName,
            tokens: json.usage?.total_tokens,
          });

          return { data: validated, model: modelName, attempts: attempt };
        } catch (err) {
          lastError = err;
          log.warn('Groq completion attempt failed', {
            purpose,
            model: modelName,
            attempt,
            error: err?.message,
          });

          if (attempt === 2) break;
          await sleep(500);
        }
      }
    }

    throw new LlmFailureError(`Groq call failed for ${purpose}: ${lastError?.message ?? 'unknown error'}`, {
      attempts: env.llm.maxAttempts,
      cause: lastError,
    });
  }

  // 2. Anthropic Completion
  const api = getAnthropicClient();
  if (!api) throw new LlmDisabledError();

  let lastError;
  for (let attempt = 1; attempt <= env.llm.maxAttempts; attempt += 1) {
    const startedAt = Date.now();
    try {
      const response = await api.messages.parse({
        model: env.llm.model,
        max_tokens: maxTokens ?? env.llm.maxTokens,
        system,
        messages: [{ role: 'user', content: user }],
        output_config: { format: zodOutputFormat(schema) },
      });

      if (response.stop_reason === 'refusal') {
        throw new LlmFailureError(
          `Model declined request (${response.stop_details?.category ?? 'unspecified'})`,
          { attempts: attempt }
        );
      }

      if (!response.parsed_output) {
        throw new Error('Model returned no schema-valid output');
      }

      log.info('Anthropic completion ok', {
        purpose,
        attempt,
        ms: Date.now() - startedAt,
        model: env.llm.model,
        inputTokens: response.usage?.input_tokens,
        outputTokens: response.usage?.output_tokens,
      });

      return { data: response.parsed_output, model: env.llm.model, attempts: attempt };
    } catch (err) {
      lastError = err;
      if (err instanceof LlmFailureError) throw err;

      const retryable = isRetryable(err);
      log.warn('Anthropic completion failed', {
        purpose,
        attempt,
        retryable,
        error: err?.message,
        status: err?.status,
      });

      if (!retryable || attempt === env.llm.maxAttempts) break;
      const delay = 500 * 2 ** (attempt - 1);
      await sleep(delay / 2 + Math.random() * (delay / 2));
    }
  }

  throw new LlmFailureError(`LLM call failed for ${purpose}: ${lastError?.message ?? 'unknown error'}`, {
    attempts: env.llm.maxAttempts,
    cause: lastError,
  });
}

/** Test seam. */
export function resetClient() {
  anthropicClient = null;
}
