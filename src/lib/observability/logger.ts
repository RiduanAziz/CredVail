import crypto from "node:crypto";

export type LogLevel = "info" | "warn" | "error";

const SENSITIVE_KEY_PATTERN = /(privatekey|password|secret|token|kms|authorization|cookie)/i;

export function createCorrelationId(): string {
  return `cor_${crypto.randomUUID()}`;
}

export function redactSensitiveFields(input: unknown): unknown {
  if (input === null || input === undefined) return input;
  if (Array.isArray(input)) {
    return input.map((item) => redactSensitiveFields(item));
  }
  if (typeof input === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        output[key] = "[REDACTED]";
      } else {
        output[key] = redactSensitiveFields(value);
      }
    }
    return output;
  }
  return input;
}

export function formatStructuredLog(
  level: LogLevel,
  event: string,
  context: Record<string, unknown> = {},
  correlationId?: string
): string {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    correlationId: correlationId || createCorrelationId(),
    context: redactSensitiveFields(context),
  };
  return JSON.stringify(payload);
}

export function logStructured(
  level: LogLevel,
  event: string,
  context: Record<string, unknown> = {},
  correlationId?: string
): void {
  const line = formatStructuredLog(level, event, context, correlationId);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else if (process.env.NODE_ENV !== "test") {
    console.info(line);
  }
}

export class MetricsRegistry {
  private static counters = new Map<string, number>();
  private static latencyTotals = new Map<string, { count: number; totalMs: number; maxMs: number }>();

  static reset(): void {
    this.counters.clear();
    this.latencyTotals.clear();
  }

  static incrementCounter(name: string, delta: number = 1): number {
    const next = (this.counters.get(name) || 0) + delta;
    this.counters.set(name, next);
    return next;
  }

  static recordLatencyMs(operation: string, ms: number): void {
    const prev = this.latencyTotals.get(operation) || { count: 0, totalMs: 0, maxMs: 0 };
    const safeMs = Math.max(0, ms);
    this.latencyTotals.set(operation, {
      count: prev.count + 1,
      totalMs: prev.totalMs + safeMs,
      maxMs: Math.max(prev.maxMs, safeMs),
    });
  }

  static getSnapshot(): {
    counters: Record<string, number>;
    latencies: Record<string, { count: number; avgMs: number; maxMs: number }>;
  } {
    const counters: Record<string, number> = {};
    for (const [k, v] of this.counters.entries()) {
      counters[k] = v;
    }

    const latencies: Record<string, { count: number; avgMs: number; maxMs: number }> = {};
    for (const [k, v] of this.latencyTotals.entries()) {
      latencies[k] = {
        count: v.count,
        avgMs: v.count > 0 ? Math.round((v.totalMs / v.count) * 100) / 100 : 0,
        maxMs: v.maxMs,
      };
    }

    return { counters, latencies };
  }
}
