import { create } from 'zustand';
import { FirebaseError } from 'firebase/app';
import { User, createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut, updateProfile } from 'firebase/auth';
import { auth } from '../firebase/config';
import { useAppStore } from './useAppStore';
import { Logger } from '../utils/logger';

interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  loading: boolean;
  authActionLoading: boolean;
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

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  user: null,
  loading: true,
  authActionLoading: false,

  initAuth: () => {
    let previouslyAuthenticated = false;
    onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser && previouslyAuthenticated) {
        await useAppStore.getState().clearLocalData();
      }

      if (firebaseUser) {
        previouslyAuthenticated = true;
      }

      set({ 
        isAuthenticated: !!firebaseUser, 
        user: firebaseUser,
        loading: false 
      });
      if (firebaseUser) {
        await useAppStore.getState().loadFromFirestore();
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
    try {
      await signOut(auth);
      await useAppStore.getState().clearLocalData();
      set({ isAuthenticated: false, user: null });
    } catch (error) {
      Logger.error('Logout error:', error);
    }
  },
}));
