/**
 * Unified error handling utilities.
 *
 * Provides consistent error message extraction and formatting
 * across the extension, replacing scattered `(err as Error).message`
 * patterns with a single source of truth.
 */

/**
 * Extract a human-readable message from an unknown error value.
 *
 * Handles:
 * - Error instances → .message
 * - String values → used directly
 * - Objects with .message → .message
 * - Everything else → String(value)
 */
export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === "string") {
    return err;
  }
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

/**
 * Format an error with a context prefix for user-facing messages.
 *
 * Example: `formatError("Failed to save", err)` → "Failed to save: disk full"
 */
export function formatError(prefix: string, err: unknown): string {
  const msg = getErrorMessage(err);
  return msg ? `${prefix}: ${msg}` : prefix;
}
