import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';

const log = logger('llm');

let client = null;

function getClient() {
  if (!env.llm.enabled) return null;
  if (!client) {
    client = new Anthropic({
      apiKey: env.llm.apiKey,
      baseURL: env.llm.baseUrl,
      // The TS/JS SDK takes timeout in milliseconds.
      timeout: env.llm.timeoutMs,
      // The SDK retries 408/409/429/5xx itself; our own attempt loop sits on
      // top of it and also covers schema-validation failures.
      maxRetries: 1,
    });
  }
  return client;
}

/** Thrown when the LLM is not configured at all. Callers fall back silently. */
export class LlmDisabledError extends Error {
  constructor() {
    super('LLM is not configured (ANTHROPIC_API_KEY is unset)');
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

/** Errors worth trying again: transient network/server/rate-limit conditions. */
function isRetryable(err) {
  if (err instanceof Anthropic.RateLimitError) return true;
  if (err instanceof Anthropic.APIConnectionError) return true;
  if (err instanceof Anthropic.APIConnectionTimeoutError) return true;
  if (err instanceof Anthropic.InternalServerError) return true;
  if (err instanceof Anthropic.APIError) return err.status >= 500 || err.status === 429;
  // Undici/fetch aborts and socket errors.
  return ['AbortError', 'TimeoutError', 'FetchError'].includes(err?.name);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Run a structured-output completion and return data validated against `schema`.
 *
 * Two things make this safe to depend on:
 *
 *  1. **Structured outputs.** `output_config.format` constrains generation to
 *     the Zod schema, so we never hand-parse JSON out of prose and never have
 *     to cope with a stray markdown fence. `parsed_output` is either
 *     schema-valid or null.
 *  2. **It throws rather than guesses.** Every caller has a deterministic
 *     fallback; a wrong-but-plausible summary is worse than a missing one in a
 *     clinical setting, so we never fabricate on failure.
 *
 * @param {object} opts
 * @param {string} opts.system      system prompt
 * @param {string} opts.user        user message
 * @param {import('zod').ZodType} opts.schema
 * @param {string} opts.purpose     label for logs
 */
export async function completeStructured({ system, user, schema, purpose, maxTokens }) {
  const api = getClient();
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

      // A refusal is a valid HTTP 200. Treat it as a hard failure — do not retry,
      // the model will refuse again — and let the caller fall back.
      if (response.stop_reason === 'refusal') {
        throw new LlmFailureError(
          `Model declined the request (${response.stop_details?.category ?? 'unspecified'})`,
          { attempts: attempt }
        );
      }

      if (!response.parsed_output) {
        throw new Error('Model returned no schema-valid output');
      }

      log.info('completion ok', {
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
      log.warn('completion failed', {
        purpose,
        attempt,
        retryable,
        error: err?.message,
        status: err?.status,
      });

      if (!retryable || attempt === env.llm.maxAttempts) break;
      // Exponential backoff with jitter, same shape as the job queue's.
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
  client = null;
}
