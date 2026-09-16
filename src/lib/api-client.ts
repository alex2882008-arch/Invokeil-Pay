'use client'

/**
 * Client-side fetch wrapper with uniform error handling.
 * - 401 → session expired: hard-reload so PanelApp re-runs the auth gate
 *   and shows the login screen (no crash, no stale panel).
 * - Non-OK → throws ApiError with the server's message.
 * - Network failure → throws ApiError(0).
 */
export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function fetchApi<T = unknown>(input: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(input, init)
  } catch {
    throw new ApiError(0, 'Network error — check your connection')
  }

  if (res.status === 401) {
    // Session expired or revoked. A full reload re-runs the auth gate and
    // lands the user on the login screen instead of a broken panel.
    if (typeof window !== 'undefined') window.location.reload()
    throw new ApiError(401, 'Session expired')
  }

  const data: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const msg =
      data && typeof data === 'object' && 'error' in data
        ? String((data as { error: unknown }).error)
        : `Request failed (${res.status})`
    throw new ApiError(res.status, msg)
  }
  return data as T
}
