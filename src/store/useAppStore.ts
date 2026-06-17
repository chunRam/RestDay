import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  DecisionAnswers,
  PlanIntensity,
  PlanItem,
  PlanRecommendation,
  PlanRecommendationBundle,
  generateRecommendationBundleFromAnswers,
  generateRecommendationFromAnswers,
} from '../utils/planGenerator';
import { auth, db } from '../firebase/config';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { Logger } from '../utils/logger';
import { generateGeminiRecommendationBundle } from '../services/geminiRecommendation';

export interface Holiday {
  id: string;
  title: string;
  startDate: string;
  note?: string;
  source?: 'manual' | 'calendar' | 'weekend' | 'test';
}

export interface HolidayReview {
  rating: number;
  memo: string;
  createdAt: string;
}

export interface PastHolidayRecord {
  holiday: Holiday;
  review: HolidayReview | null;
  plans: PlanItem[];
  recommendation: PlanRecommendation | null;
  recommendationsByIntensity: PlanRecommendationBundle | null;
  decisionAnswers: DecisionAnswers | null;
  archivedAt: number;
}

interface AppState {
  currentHoliday: Holiday | null;
  selectedDecision: string | null;
  decisionAnswers: DecisionAnswers | null;
  recommendation: PlanRecommendation | null;
  recommendationsByIntensity: PlanRecommendationBundle | null;
  plans: PlanItem[];
  review: HolidayReview | null;
  pastHolidays: PastHolidayRecord[];
  lastUpdatedAt: number;
  
  // Actions
  loadFromFirestore: () => Promise<void>;
  setHoliday: (holiday: Holiday | null) => void;
  setDecisionAndGeneratePlans: (answers: DecisionAnswers) => Promise<PlanRecommendation>;
  adjustPlanIntensity: (intensity: PlanIntensity, sourceAnswers?: DecisionAnswers) => Promise<void>;
  togglePlanCheck: (planId: string) => void;
  saveReview: (review: Omit<HolidayReview, 'createdAt'>) => void;
  reset: () => void;
  clearLocalData: () => Promise<void>;
  clearAllData: () => Promise<void>;
}

type PersistedAppData = Pick<
  AppState,
  | 'currentHoliday'
  | 'selectedDecision'
  | 'decisionAnswers'
  | 'recommendation'
  | 'recommendationsByIntensity'
  | 'plans'
  | 'review'
  | 'pastHolidays'
  | 'lastUpdatedAt'
>;

const EMPTY_APP_DATA: PersistedAppData = {
  currentHoliday: null,
  selectedDecision: null,
  decisionAnswers: null,
  recommendation: null,
  recommendationsByIntensity: null,
  plans: [],
  review: null,
  pastHolidays: [],
  lastUpdatedAt: 0,
};

const getPersistedAppData = (state: AppState): PersistedAppData => ({
  currentHoliday: state.currentHoliday,
  selectedDecision: state.selectedDecision,
  decisionAnswers: state.decisionAnswers,
  recommendation: state.recommendation,
  recommendationsByIntensity: state.recommendationsByIntensity,
  plans: state.plans,
  review: state.review,
  pastHolidays: state.pastHolidays,
  lastUpdatedAt: state.lastUpdatedAt,
});

function isPersistedAppData(value: unknown): value is PersistedAppData {
  return (
    !!value &&
    typeof value === 'object' &&
    'lastUpdatedAt' in value &&
    typeof (value as { lastUpdatedAt?: unknown }).lastUpdatedAt === 'number'
  );
}

const syncToFirestore = async (state: PersistedAppData) => {
  const user = auth.currentUser;
  if (!user) return;
  
  try {
    const userRef = doc(db, 'users', user.uid);
    await setDoc(userRef, {
      currentHoliday: state.currentHoliday,
      selectedDecision: state.selectedDecision,
      decisionAnswers: state.decisionAnswers,
      recommendation: state.recommendation,
      recommendationsByIntensity: state.recommendationsByIntensity,
      plans: state.plans,
      review: state.review,
      pastHolidays: state.pastHolidays,
      updatedAt: state.lastUpdatedAt
    }, { merge: true });
  } catch (e) {
    Logger.error("Failed to sync to Firestore", e);
  }
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...EMPTY_APP_DATA,

      loadFromFirestore: async () => {
        const user = auth.currentUser;
        if (!user) return;
        try {
          const docSnap = await getDoc(doc(db, 'users', user.uid));
          if (docSnap.exists()) {
            const data = docSnap.data();
            const remoteUpdatedAt = typeof data.updatedAt === 'number' ? data.updatedAt : 0;
            const localState = getPersistedAppData(get());

            if (localState.lastUpdatedAt > remoteUpdatedAt) {
              await syncToFirestore(localState);
              return;
            }

            set({
              currentHoliday: data.currentHoliday || null,
              selectedDecision: data.selectedDecision || null,
              decisionAnswers: data.decisionAnswers || null,
              recommendation: data.recommendation || null,
              recommendationsByIntensity: data.recommendationsByIntensity || null,
              plans: data.plans || [],
              review: data.review || null,
              pastHolidays: data.pastHolidays || [],
              lastUpdatedAt: remoteUpdatedAt,
            });
          } else {
            const localState = getPersistedAppData(get());
            if (localState.lastUpdatedAt > 0) {
              await syncToFirestore(localState);
            }
          }
        } catch (e) {
          Logger.error("Failed to load from Firestore", e);
        }
      },

      setHoliday: (holiday) => {
        const current = get();
        let pastHolidays = current.pastHolidays || [];

        // Archive current holiday before resetting (if it exists and has meaningful data)
        if (current.currentHoliday && (current.plans.length > 0 || current.review)) {
          pastHolidays = [...pastHolidays.slice(-19), {
            holiday: current.currentHoliday,
            review: current.review,
            plans: current.plans,
            recommendation: current.recommendation,
            recommendationsByIntensity: current.recommendationsByIntensity,
            decisionAnswers: current.decisionAnswers,
            archivedAt: Date.now(),
          }];
        }

        const nextState = {
          currentHoliday: holiday,
          selectedDecision: null,
          decisionAnswers: null,
          recommendation: null,
          recommendationsByIntensity: null,
          plans: [],
          review: null,
          pastHolidays,
          lastUpdatedAt: Date.now(),
        };

        set(nextState);
        syncToFirestore(nextState);
      },

      setDecisionAndGeneratePlans: async (answers) => {
        const aiRecommendations = await generateGeminiRecommendationBundle(answers, get().currentHoliday);
        const recommendationsByIntensity =
          aiRecommendations ?? generateRecommendationBundleFromAnswers(answers);
        const recommendation =
          recommendationsByIntensity[answers.intensity] ?? generateRecommendationFromAnswers(answers);
        const nextState = {
          currentHoliday: get().currentHoliday,
          selectedDecision: recommendation.direction,
          decisionAnswers: answers,
          recommendation,
          recommendationsByIntensity,
          plans: recommendation.plans,
          review: null,
          pastHolidays: get().pastHolidays,
          lastUpdatedAt: Date.now(),
        };

        set(nextState);
        syncToFirestore(nextState);
        return recommendation;
      },

      adjustPlanIntensity: async (intensity, sourceAnswers) => {
        const answers = sourceAnswers ?? get().decisionAnswers;
        if (!answers) return;

        const adjustedAnswers = { ...answers, intensity };
        const recommendationsByIntensity =
          get().recommendationsByIntensity ?? generateRecommendationBundleFromAnswers(adjustedAnswers);
        const recommendation = recommendationsByIntensity[intensity];
        const nextState = {
          currentHoliday: get().currentHoliday,
          selectedDecision: recommendation.direction,
          decisionAnswers: adjustedAnswers,
          recommendation,
          recommendationsByIntensity,
          plans: recommendation.plans,
          review: null,
          pastHolidays: get().pastHolidays,
          lastUpdatedAt: Date.now(),
        };

        set(nextState);
        syncToFirestore(nextState);
      },

      togglePlanCheck: (planId) => {
        set((state) => {
          const newPlans = state.plans.map(p =>
            p.id === planId ? { ...p, isDone: !p.isDone } : p
          );
          const nextState = {
            currentHoliday: state.currentHoliday,
            selectedDecision: state.selectedDecision,
            decisionAnswers: state.decisionAnswers,
            recommendation: state.recommendation,
            recommendationsByIntensity: state.recommendationsByIntensity,
            plans: newPlans,
            review: state.review,
            pastHolidays: state.pastHolidays,
            lastUpdatedAt: Date.now(),
          };
          syncToFirestore(nextState);
          return { plans: newPlans, lastUpdatedAt: nextState.lastUpdatedAt };
        });
      },

      saveReview: (review) => {
        const nextReview = {
          ...review,
          createdAt: new Date().toISOString(),
        };

        const nextState = {
          currentHoliday: get().currentHoliday,
          selectedDecision: get().selectedDecision,
          decisionAnswers: get().decisionAnswers,
          recommendation: get().recommendation,
          recommendationsByIntensity: get().recommendationsByIntensity,
          plans: get().plans,
          review: nextReview,
          pastHolidays: get().pastHolidays,
          lastUpdatedAt: Date.now(),
        };

        set({ review: nextReview, lastUpdatedAt: nextState.lastUpdatedAt });
        syncToFirestore(nextState);
      },

      reset: () => {
        const nextState = {
          currentHoliday: null,
          selectedDecision: null,
          decisionAnswers: null,
          recommendation: null,
          recommendationsByIntensity: null,
          plans: [],
          review: null,
          pastHolidays: get().pastHolidays,
          lastUpdatedAt: Date.now(),
        };

        set(nextState);
        syncToFirestore(nextState);
      },

      clearLocalData: async () => {
        set(EMPTY_APP_DATA);
        await AsyncStorage.removeItem('restday-app-state');
      },

      clearAllData: async () => {
        const user = auth.currentUser;
        if (user) {
          try {
            await deleteDoc(doc(db, 'users', user.uid));
          } catch (e) {
            Logger.error("Failed to delete user document from Firestore", e);
          }
        }

        const nextState = {
          currentHoliday: null,
          selectedDecision: null,
          decisionAnswers: null,
          recommendation: null,
          recommendationsByIntensity: null,
          plans: [],
          review: null,
          pastHolidays: [],
          lastUpdatedAt: 0,
        };

        set(nextState);
      },
    }),
    {
      name: 'restday-app-state',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => getPersistedAppData(state),
      merge: (persistedState, currentState) => {
        if (!isPersistedAppData(persistedState)) {
          return currentState;
        }

        return persistedState.lastUpdatedAt > currentState.lastUpdatedAt
          ? { ...currentState, ...persistedState }
          : currentState;
      },
    }
  )
);
