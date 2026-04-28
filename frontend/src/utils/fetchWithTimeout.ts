/** Default timeout (ms) for {@link fetchWithTimeout}. */
export const FETCH_WITH_TIMEOUT_MS = 15_000;

/**
 * `fetch` with an AbortController-driven timeout. Honors `init.signal` (caller abort)
 * in addition to the timeout. On timeout, throws an `Error` with a clear message;
 * `AbortError` is preserved for caller-initiated abort.
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const timeoutMs = FETCH_WITH_TIMEOUT_MS;
  const timeoutController = new AbortController();
  let didTimeout = false;

  const timer = setTimeout(() => {
    didTimeout = true;
    timeoutController.abort();
  }, timeoutMs);

  const { signal: userSignal, ...rest } = init ?? {};
  const combined = new AbortController();

  const abortCombined = () => {
    combined.abort();
  };

  timeoutController.signal.addEventListener('abort', abortCombined);
  if (userSignal) {
    if (userSignal.aborted) {
      clearTimeout(timer);
      timeoutController.signal.removeEventListener('abort', abortCombined);
      throw new DOMException('The operation was aborted.', 'AbortError');
    }
    userSignal.addEventListener('abort', abortCombined);
  }

  try {
    const response = await fetch(input, {
      ...rest,
      signal: combined.signal,
    });
    return response;
  } catch (err) {
    if (didTimeout) {
      throw new Error(`Request timed out after ${timeoutMs / 1000}s`, { cause: err });
    }
    throw err;
  } finally {
    clearTimeout(timer);
    timeoutController.signal.removeEventListener('abort', abortCombined);
    userSignal?.removeEventListener('abort', abortCombined);
  }
}
