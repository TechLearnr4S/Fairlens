/**
 * Backend audit routes may return `{ success, data, error }`.
 * Inner payloads match the legacy shapes; unwrap keeps callers unchanged.
 */
export function unwrapAuditBody<T = unknown>(raw: unknown): T {
  if (
    raw !== null &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    Object.prototype.hasOwnProperty.call(raw, 'success') &&
    Object.prototype.hasOwnProperty.call(raw, 'data')
  ) {
    const envelope = raw as { success: boolean; data: unknown; error?: unknown };
    if (!envelope.success) {
      const msg =
        typeof envelope.error === 'string'
          ? envelope.error
          : envelope.error != null
            ? String(envelope.error)
            : 'Request failed';
      throw new Error(msg);
    }
    return envelope.data as T;
  }
  return raw as T;
}
