import type { TokenResponse } from './types';

const ACCESS_TOKEN_KEY = 'ps_affiliates_admin_access_token';
const REFRESH_TOKEN_KEY = 'ps_affiliates_admin_refresh_token';

export function hasTokens() {
  return Boolean(window.localStorage.getItem(ACCESS_TOKEN_KEY) && window.localStorage.getItem(REFRESH_TOKEN_KEY));
}

export function readAccessToken() {
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function readRefreshToken() {
  return window.localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function saveTokens(tokens: TokenResponse) {
  window.localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access_token);
  window.localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
}

export function clearTokens() {
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
}
