/**
 * Self-healing data guards. Server functions can resolve with an unexpected
 * shape (e.g. an auth response body while sign-in is bypassed); these keep the
 * UI rendering instead of crashing the route with `x.map is not a function`.
 */
export function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function asRecord<T extends object>(value: unknown): Partial<T> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Partial<T>) : {};
}

/**
 * Accepts a server-function result only when it carries the expected keys.
 * Under bypassed sign-in, protected functions can resolve with an auth
 * payload instead of the real DTO — this turns that into a clean message.
 */
export function expectShape<T>(value: unknown, keys: Array<keyof T & string>): T | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  return keys.every((k) => v[k] !== undefined) ? (value as T) : null;
}
