/**
 * Tiny structured logger — emits a single JSON line per record so Vercel's log
 * pipeline (and any subsequent ingest into Datadog/Logflare/Sentry) can index
 * fields without regex.
 *
 * No dependency. No ENV requirement. console.* still works alongside this.
 *
 * Usage:
 *   import { logError, logInfo } from "@/lib/observability/log";
 *
 *   try { ... } catch (err) {
 *     logError({ route: "stripe.webhook", event: "checkout.session.completed",
 *                userId, err });
 *   }
 *
 * Field conventions (kept short — they go on every line):
 *   route   — dot-path of the call site, e.g. "stripe.webhook" or
 *             "cron.daily.user". Required.
 *   event   — sub-event within a route. Optional.
 *   userId  — Supabase auth user id when available. Optional.
 *   err     — Error | string | unknown — flattened to message + name + stack.
 *   ...rest — any additional context fields (invoiceId, stripeEventId, etc.).
 */

type LogLevel = "info" | "warn" | "error";

type LogFields = {
  route: string;
  event?: string;
  userId?: string | null;
  err?: unknown;
  [key: string]: unknown;
};

function flattenError(err: unknown): {
  message: string;
  name?: string;
  stack?: string;
} | null {
  if (err == null) return null;
  if (err instanceof Error) {
    return {
      message: err.message,
      name: err.name,
      // Trim stack to keep log lines under most ingestion limits.
      stack: err.stack ? err.stack.split("\n").slice(0, 8).join("\n") : undefined,
    };
  }
  if (typeof err === "string") return { message: err };
  try {
    return { message: JSON.stringify(err) };
  } catch {
    return { message: String(err) };
  }
}

function emit(level: LogLevel, fields: LogFields): void {
  const { err, ...rest } = fields;
  const flat = flattenError(err);
  const record: Record<string, unknown> = {
    level,
    ts: new Date().toISOString(),
    ...rest,
  };
  if (flat) record.err = flat;
  // Single JSON line — Vercel ingests stdout/stderr verbatim.
  const line = JSON.stringify(record);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export function logInfo(fields: LogFields): void {
  emit("info", fields);
}

export function logWarn(fields: LogFields): void {
  emit("warn", fields);
}

export function logError(fields: LogFields): void {
  emit("error", fields);
}
