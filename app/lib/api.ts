import type { Challenge, TokenResponse } from './types';
import { clearTokens, readAccessToken, readRefreshToken, saveTokens } from './session';

const API_BASE = (
  process.env.NEXT_PUBLIC_PS_AFFILIATES_API_BASE_URL ||
  (process.env.NODE_ENV === 'development' ? 'http://localhost:8082/api/v1' : '/api/v1')
).replace(/\/+$/, '');

export class SessionChallengeRequiredError extends Error {
  constructor(readonly challenge: Challenge) {
    super('A sua sessão precisa de uma nova verificação de dois fatores.');
  }
}

type RequestOptions = { method?: string; body?: unknown; auth?: boolean; retry?: boolean };
let refreshInFlight: Promise<TokenResponse | null> | null = null;

function refreshSession(refreshToken: string) {
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    }).then(async (response) => {
      if (response.status === 202) {
        const challenge = await response.json() as Challenge;
        clearTokens();
        throw new SessionChallengeRequiredError(challenge);
      }
      if (!response.ok) {
        clearTokens();
        return null;
      }
      const tokens = await response.json() as TokenResponse;
      saveTokens(tokens);
      return tokens;
    }).finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

async function decodeError(response: Response) {
  let message = `${response.status} ${response.statusText}`;
  try {
    const body = await response.json() as { message?: string; code?: string };
    message = body.message || body.code || message;
  } catch {
    // Keep the HTTP status when the server does not return JSON.
  }
  return new Error(message);
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const send = () => {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    const token = options.auth === false ? null : readAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${API_BASE}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  };

  let response = await send();
  if (response.status === 401 && options.auth !== false && options.retry !== false) {
    const refreshToken = readRefreshToken();
    if (refreshToken) {
      const tokens = await refreshSession(refreshToken);
      if (tokens) response = await send();
    }
  }
  if (!response.ok) throw await decodeError(response);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function get<T>(path: string) {
  return request<T>(path);
}

export function post<T = void>(path: string, body?: unknown, auth = true) {
  return request<T>(path, { method: 'POST', body, auth });
}
