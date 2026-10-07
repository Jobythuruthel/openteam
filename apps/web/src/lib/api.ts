export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export type ApiSuccess<T> = { ok: true; status: number; data: T };
export type ApiFailure = {
  ok: false;
  status: number;
  code: string;
  message: string;
  fieldErrors: Record<string, string>;
};
export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

interface ErrorEnvelope {
  error?: { code?: string; message?: string; details?: { field: string; message: string }[] };
}

/** Turns an error envelope into something a form can show. Pure, so it is unit tested. */
export function toFailure(status: number, body: unknown, retryAfter: string | null): ApiFailure {
  const error = (body as ErrorEnvelope | null)?.error;
  const fieldErrors: Record<string, string> = {};
  for (const detail of error?.details ?? []) fieldErrors[detail.field] ??= detail.message;
  let message = error?.message ?? 'Something went wrong. Please try again.';
  if (status === 429) {
    const minutes = Math.max(1, Math.ceil(Number(retryAfter ?? 60) / 60));
    message = `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
  } else if (status >= 500) {
    message = 'The service is having trouble right now. Please try again shortly.';
  }
  return { ok: false, status, code: error?.code ?? 'error', message, fieldErrors };
}

/** Calls the API with the session cookie attached. Never throws: network failures become results. */
export async function api<T>(
  path: string,
  init: { method?: 'GET' | 'POST' | 'DELETE'; body?: unknown } = {},
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/v1${path}`, {
      method: init.method ?? 'GET',
      credentials: 'include',
      headers: init.body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: init.body === undefined ? null : JSON.stringify(init.body),
    });
  } catch {
    return {
      ok: false,
      status: 0,
      code: 'network_error',
      message: 'Could not reach Open Team. Check your connection and try again.',
      fieldErrors: {},
    };
  }
  const body: unknown = response.status === 204 ? null : await response.json().catch(() => null);
  if (response.ok) return { ok: true, status: response.status, data: body as T };
  return toFailure(response.status, body, response.headers.get('Retry-After'));
}

/** Reads `#token=...` from the URL and removes it from history so it is not left in the address bar. */
export function takeTokenFromHash(): string | null {
  if (typeof window === 'undefined') return null;
  const match = /(?:^#|&)token=([A-Za-z0-9_-]+)/.exec(window.location.hash);
  if (match)
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  return match?.[1] ?? null;
}
