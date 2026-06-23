import * as AuthSession from 'expo-auth-session';
import { Platform } from 'react-native';

export const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
export const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';
export const googleAndroidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? '';
export const googleWebRedirectUri = process.env.EXPO_PUBLIC_GOOGLE_WEB_REDIRECT_URI ?? '';
export const baseGoogleScopes = ['profile', 'email'];
export const calendarScope = 'https://www.googleapis.com/auth/calendar.readonly';
const PENDING_GOOGLE_AUTH_MODE_KEY = 'restday-pending-google-auth-mode';

export type PendingGoogleAuthMode = 'login' | 'calendar';

export type GoogleWebAuthCallback = {
  accessToken: string | null;
  error: string | null;
  errorDescription: string | null;
  expiresIn: number | null;
  idToken: string | null;
  rawCallbackUrl: string;
  scope: string | null;
  state: string | null;
};

function normalizeRedirectUri(uri: string) {
  return uri.replace(/\/+$/, '');
}

function isLocalhostOrigin(origin: string) {
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' || hostname === '[::1]';
  } catch {
    return false;
  }
}

export function getGoogleClientId() {
  if (Platform.OS === 'web') {
    return googleWebClientId || null;
  }

  if (Platform.OS === 'ios') {
    return googleIosClientId || googleWebClientId || null;
  }

  if (Platform.OS === 'android') {
    return googleAndroidClientId || googleWebClientId || null;
  }

  return googleWebClientId || null;
}

export function getMissingGoogleClientIdMessage() {
  if (Platform.OS === 'web' && !googleWebClientId) {
    return '웹 Google OAuth 클라이언트 ID가 필요합니다.';
  }

  if (Platform.OS === 'ios' && !googleIosClientId && !googleWebClientId) {
    return 'iOS Google OAuth 클라이언트 ID가 필요합니다.';
  }

  if (Platform.OS === 'android' && !googleAndroidClientId && !googleWebClientId) {
    return 'Android Google OAuth 클라이언트 ID가 필요합니다.';
  }

  return null;
}

export function getGoogleRedirectUri() {
  if (Platform.OS !== 'web') {
    return undefined;
  }

  if (typeof window !== 'undefined' && window.location.origin) {
    const browserOrigin = normalizeRedirectUri(window.location.origin);

    if (isLocalhostOrigin(browserOrigin)) {
      const pathname = window.location.pathname === '/' ? '' : window.location.pathname.replace(/\/+$/, '');
      return `${browserOrigin}${pathname}`;
    }
  }

  if (googleWebRedirectUri) {
    return normalizeRedirectUri(googleWebRedirectUri);
  }

  const redirectUri = AuthSession.makeRedirectUri();
  if (redirectUri) {
    return normalizeRedirectUri(redirectUri);
  }

  return undefined;
}

export function setPendingGoogleAuthMode(mode: PendingGoogleAuthMode) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(PENDING_GOOGLE_AUTH_MODE_KEY, mode);
}

export function getPendingGoogleAuthMode(): PendingGoogleAuthMode | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return null;
  }

  const value = window.localStorage.getItem(PENDING_GOOGLE_AUTH_MODE_KEY);
  return value === 'login' || value === 'calendar' ? value : null;
}

export function clearPendingGoogleAuthMode() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(PENDING_GOOGLE_AUTH_MODE_KEY);
}

export function getGoogleWebAuthCallbackFromCurrentUrl(): GoogleWebAuthCallback | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return null;
  }

  const rawHash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
  const rawSearch = window.location.search.startsWith('?') ? window.location.search.slice(1) : window.location.search;
  const rawParams = rawHash || rawSearch;

  if (!rawParams) {
    return null;
  }

  const params = new URLSearchParams(rawParams);
  const accessToken = params.get('access_token');
  const idToken = params.get('id_token');
  const error = params.get('error');

  if (!accessToken && !idToken && !error) {
    return null;
  }

  const expiresInValue = params.get('expires_in');
  const expiresIn = expiresInValue ? Number(expiresInValue) : null;

  return {
    accessToken,
    error,
    errorDescription: params.get('error_description'),
    expiresIn: Number.isFinite(expiresIn) ? expiresIn : null,
    idToken,
    rawCallbackUrl: window.location.href,
    scope: params.get('scope'),
    state: params.get('state'),
  };
}

export function clearGoogleWebAuthCallbackFromCurrentUrl() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return;
  }

  const cleanedUrl = `${window.location.origin}${window.location.pathname}`;
  window.history.replaceState(null, document.title, cleanedUrl);
}

export function clearGoogleWebAuthTransientState() {
  clearPendingGoogleAuthMode();
  clearGoogleWebAuthCallbackFromCurrentUrl();
}
