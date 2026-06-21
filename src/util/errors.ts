/**
 * Extract a human-readable message from anything thrown or emitted as an error.
 * Provider SDKs sometimes surface plain objects (not Error instances); without
 * this, `String(obj)` yields the useless "[object Object]".
 */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message || err.name;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>;
    if (typeof o.message === "string" && o.message) return o.message;
    if (typeof o.error === "string" && o.error) return o.error;
    if (o.error && typeof o.error === "object") {
      const inner = o.error as Record<string, unknown>;
      if (typeof inner.message === "string" && inner.message) return inner.message;
    }
    if (typeof o.responseBody === "string" && o.responseBody) return o.responseBody;
    if (typeof o.statusText === "string" && o.statusText) return o.statusText;
    try {
      const json = JSON.stringify(o);
      if (json && json !== "{}") return json;
    } catch {
      // fall through
    }
  }
  return String(err);
}
