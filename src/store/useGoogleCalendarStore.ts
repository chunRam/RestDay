import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AuthSession from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { getGoogleClientId } from '../utils/googleAuth';
import { Logger } from '../utils/logger';

export type GoogleCalendarSession = {
  accessToken: string | null;
  refreshToken: string | null;
  expiresIn: number | null;
  issuedAt: number | null;
  accountEmail: string | null;
  accountName: string | null;
  accountPhotoUrl: string | null;
  connectedAt: number | null;
  forceAccountSelectionOnNextConnect: boolean;
};

export interface GoogleCalendarDisconnectResult {
  revokedAccessToken: boolean;
  revokedRefreshToken: boolean;
  revokeErrorMessage: string | null;
}

export type GoogleCalendarSessionSnapshot = Pick<GoogleCalendarSession, 'accessToken' | 'refreshToken'>;

interface GoogleCalendarStore extends GoogleCalendarSession {
  isConnected: boolean;
  setSession: (session: GoogleCalendarSession) => void;
  clearSession: (options?: { forceAccountSelectionOnNextConnect?: boolean }) => void;
  clearLocalSession: (options?: { forceAccountSelectionOnNextConnect?: boolean }) => Promise<void>;
  markAccountSelectionRequired: () => void;
  disconnect: () => Promise<GoogleCalendarDisconnectResult>;
}

const GOOGLE_CALENDAR_STORAGE_KEY = 'restday-google-calendar-session';

const EMPTY_GOOGLE_CALENDAR_SESSION: GoogleCalendarSession = {
  accessToken: null,
  refreshToken: null,
  expiresIn: null,
  issuedAt: null,
  accountEmail: null,
  accountName: null,
  accountPhotoUrl: null,
  connectedAt: null,
  forceAccountSelectionOnNextConnect: false,
};

async function revokeToken(token: string | null) {
  if (!token) {
    return false;
  }

  return AuthSession.revokeAsync(
    {
      token,
      clientId: getGoogleClientId() ?? undefined,
    },
    Google.discovery
  );
}

export function isGoogleCalendarAccessTokenFresh(
  session: Pick<GoogleCalendarSession, 'accessToken' | 'expiresIn' | 'issuedAt'>,
  now = Date.now()
) {
  if (!session.accessToken) {
    return false;
  }

  if (typeof session.expiresIn !== 'number' || typeof session.issuedAt !== 'number') {
    return true;
  }

  const expiresAt = (session.issuedAt + session.expiresIn) * 1000;
  return now < expiresAt - 60_000;
}

function getSessionSnapshot(session: Pick<GoogleCalendarSession, 'accessToken' | 'refreshToken'>): GoogleCalendarSessionSnapshot {
  return {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
  };
}

export async function revokeGoogleCalendarSessionSnapshot(
  snapshot: GoogleCalendarSessionSnapshot
): Promise<GoogleCalendarDisconnectResult> {
  const revokeErrors: string[] = [];
  let revokedRefreshToken = false;
  let revokedAccessToken = false;

  if (snapshot.refreshToken && snapshot.refreshToken !== snapshot.accessToken) {
    try {
      await revokeToken(snapshot.refreshToken);
      revokedRefreshToken = true;
    } catch (error) {
      Logger.warn('Failed to revoke Google Calendar refresh token:', error);
      revokeErrors.push(error instanceof Error ? error.message : 'refresh token 해제 실패');
    }
  }

  if (snapshot.accessToken) {
    try {
      await revokeToken(snapshot.accessToken);
      revokedAccessToken = true;
    } catch (error) {
      Logger.warn('Failed to revoke Google Calendar access token:', error);
      revokeErrors.push(error instanceof Error ? error.message : 'access token 해제 실패');
    }
  }

  return {
    revokedAccessToken,
    revokedRefreshToken,
    revokeErrorMessage: revokeErrors.length > 0 ? revokeErrors.join('; ') : null,
  };
}

export const useGoogleCalendarStore = create<GoogleCalendarStore>()(
  persist(
    (set, get) => ({
      ...EMPTY_GOOGLE_CALENDAR_SESSION,
      isConnected: false,

      setSession: (session) => {
        set({
          ...session,
          isConnected: !!session.accessToken,
        });
      },

      clearSession: (options) => {
        set({
          ...EMPTY_GOOGLE_CALENDAR_SESSION,
          isConnected: false,
          forceAccountSelectionOnNextConnect: options?.forceAccountSelectionOnNextConnect ?? false,
        });
      },

      clearLocalSession: async (options) => {
        get().clearSession(options);
        await AsyncStorage.removeItem(GOOGLE_CALENDAR_STORAGE_KEY);
      },

      markAccountSelectionRequired: () => {
        set({ forceAccountSelectionOnNextConnect: true });
      },

      disconnect: async () => {
        const snapshot = getSessionSnapshot(get());

        try {
          return await revokeGoogleCalendarSessionSnapshot(snapshot);
        } finally {
          await get().clearLocalSession({ forceAccountSelectionOnNextConnect: true });
        }
      },
    }),
    {
      name: GOOGLE_CALENDAR_STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

export async function disconnectGoogleCalendarSession() {
  return useGoogleCalendarStore.getState().disconnect();
}

export async function clearLocalGoogleCalendarSession(options?: { forceAccountSelectionOnNextConnect?: boolean }) {
  await useGoogleCalendarStore.getState().clearLocalSession(options);
}

export function getGoogleCalendarSessionSnapshot() {
  return getSessionSnapshot(useGoogleCalendarStore.getState());
}
