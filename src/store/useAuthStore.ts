import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { create } from 'zustand';
import { FirebaseError } from 'firebase/app';
import {
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { auth } from '../firebase/config';
import { useAppStore } from './useAppStore';
import {
  clearLocalGoogleCalendarSession,
  getGoogleCalendarSessionSnapshot,
  revokeGoogleCalendarSessionSnapshot,
} from './useGoogleCalendarStore';
import { clearGoogleWebAuthTransientState } from '../utils/googleAuth';
import { Logger } from '../utils/logger';

let authUnsubscribe: (() => void) | null = null;

interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  loading: boolean;
  authActionLoading: boolean;
  logoutInFlight: boolean;
  logoutError: string | null;
  initAuth: () => void;
  signupWithEmail: (email: string, password: string, displayName?: string) => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

function getEmailAuthErrorMessage(error: unknown) {
  if (!(error instanceof FirebaseError)) {
    return '인증 처리 중 문제가 발생했습니다.';
  }

  switch (error.code) {
    case 'auth/email-already-in-use':
      return '이미 가입된 이메일입니다. 기존 계정으로 로그인해주세요.';
    case 'auth/invalid-email':
      return '이메일 형식을 확인해주세요.';
    case 'auth/weak-password':
      return '비밀번호는 6자 이상으로 입력해주세요.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return '이메일 또는 비밀번호가 올바르지 않습니다.';
    case 'auth/too-many-requests':
      return '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.';
    case 'auth/operation-not-allowed':
      return 'Firebase 콘솔에서 이메일/비밀번호 로그인을 활성화해야 합니다.';
    default:
      return `인증 오류: ${error.code}`;
  }
}

function getLogoutErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    return `로그아웃에 실패했습니다. (${error.code})`;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return '로그아웃 중 문제가 발생했습니다.';
}

function dismissActiveAuthSession() {
  try {
    AuthSession.dismiss();
  } catch (error) {
    Logger.warn('Failed to dismiss active AuthSession:', error);
  }

  try {
    WebBrowser.dismissAuthSession();
  } catch (error) {
    Logger.warn('Failed to dismiss active WebBrowser auth session:', error);
  }
}

async function purgeLocalSessionState() {
  dismissActiveAuthSession();
  clearGoogleWebAuthTransientState();
  await Promise.all([
    useAppStore.getState().clearLocalData(),
    clearLocalGoogleCalendarSession({ forceAccountSelectionOnNextConnect: true }),
  ]);
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false,
  user: null,
  loading: true,
  authActionLoading: false,
  logoutInFlight: false,
  logoutError: null,

  initAuth: () => {
    if (authUnsubscribe) {
      return;
    }

    let authStateVersion = 0;

    authUnsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      const currentVersion = ++authStateVersion;

      set({
        isAuthenticated: !!firebaseUser,
        user: firebaseUser,
        loading: false,
        logoutError: firebaseUser ? null : get().logoutError,
      });

      if (firebaseUser) {
        await useAppStore.getState().loadFromFirestore(firebaseUser.uid);

        if (authStateVersion !== currentVersion || auth.currentUser?.uid !== firebaseUser.uid) {
          return;
        }

        return;
      }

      if (get().logoutInFlight) {
        set({
          isAuthenticated: false,
          user: null,
          loading: false,
          authActionLoading: false,
        });
        return;
      }

      try {
        await purgeLocalSessionState();
      } catch (error) {
        Logger.warn('Failed to purge local session state after auth loss:', error);
      } finally {
        set({
          isAuthenticated: false,
          user: null,
          loading: false,
          authActionLoading: false,
          logoutInFlight: false,
          logoutError: null,
        });
      }
    });
  },

  signupWithEmail: async (email, password, displayName) => {
    set({ authActionLoading: true });
    try {
      const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const trimmedName = displayName?.trim();

      if (trimmedName) {
        await updateProfile(credential.user, { displayName: trimmedName });
      }
    } catch (error) {
      Logger.error('Email signup error:', error);
      throw new Error(getEmailAuthErrorMessage(error));
    } finally {
      set({ authActionLoading: false });
    }
  },

  loginWithEmail: async (email, password) => {
    set({ authActionLoading: true });
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (error) {
      Logger.error('Email login error:', error);
      throw new Error(getEmailAuthErrorMessage(error));
    } finally {
      set({ authActionLoading: false });
    }
  },

  logout: async () => {
    if (get().logoutInFlight) {
      return;
    }

    const sessionSnapshot = getGoogleCalendarSessionSnapshot();

    set({
      logoutInFlight: true,
      logoutError: null,
    });

    try {
      dismissActiveAuthSession();
      clearGoogleWebAuthTransientState();

      await signOut(auth);

      set({
        isAuthenticated: false,
        user: null,
        loading: false,
        authActionLoading: false,
      });

      await purgeLocalSessionState();

      void revokeGoogleCalendarSessionSnapshot(sessionSnapshot)
        .then((result) => {
          if (result.revokeErrorMessage) {
            Logger.warn('Google Calendar token revoke warning after logout:', result.revokeErrorMessage);
          }
        })
        .catch((error) => {
          Logger.warn('Google Calendar token revoke failed after logout:', error);
        });
    } catch (error) {
      Logger.error('Logout error:', error);
      const message = getLogoutErrorMessage(error);
      set({
        logoutError: message,
      });
      throw new Error(message);
    } finally {
      set({
        logoutInFlight: false,
      });
    }
  },
}));
