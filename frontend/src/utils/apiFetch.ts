/**
 * Application-wide HTTP helper: {@link fetchWithTimeout} (15s) + optional timeout toast.
 */
import { FETCH_WITH_TIMEOUT_MS, fetchWithTimeout } from './fetchWithTimeout';
import type { ToastType } from '../components/ui/Toast';

const TIMEOUT_MESSAGE = 'Server took too long. Try again.';

/** Module-level toast sink mounted once via {@link registerGlobalApiToast} */
let toastSink: ((message: string, type: ToastType) => void) | null = null;

/**
 * Registers the global toast handler from the app shell (typically once).
 * Pass `null` on teardown (e.g. tests / strict mode cleanup).
 */
export function registerGlobalApiToast(
  handler: ((message: string, type: ToastType) => void) | null,
): void {
  toastSink = handler;
}

/** True when {@link fetchWithTimeout} aborted due to the default timeout (not user abort). */
export function isRequestTimeout(err: unknown): boolean {
  return err instanceof Error && err.message.startsWith('Request timed out');
}

/**
 * Drop-in replacement for `fetch`:
 * — 15s timeout (same as {@link FETCH_WITH_TIMEOUT_MS})
 * — on timeout, shows `"Server took too long. Try again."` via {@link registerGlobalApiToast}
 * — rethrows the error so callers can still branch on failures
 */
export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  // Normalize the input to a string URL
  let url = typeof input === 'string' ? input : (input instanceof URL ? input.toString() : input.url);

  // If we are in production (Vercel), replace localhost with our real backend
  const apiBase = import.meta.env.VITE_API_BASE_URL;
  if (apiBase && url.includes('localhost:8000')) {
    // Ensure apiBase doesn't have a trailing slash for consistency
    const cleanBase = apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase;
    url = url.replace(/https?:\/\/localhost:8000/i, cleanBase);
  }

  try {
    return await fetchWithTimeout(url, init);
  } catch (err) {
    if (isRequestTimeout(err)) {
      toastSink?.(TIMEOUT_MESSAGE, 'error');
    }
    throw err;
  }
}

/** Re-export for consumers that configure timeouts centrally */
export { FETCH_WITH_TIMEOUT_MS, fetchWithTimeout };
