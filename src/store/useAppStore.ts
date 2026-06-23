import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  DecisionAnswers,
  PlanIntensity,
  PlanItem,
  PlanRecommendation,
  RecommendationMetadata,
  generateRecommendationFromAnswersWithMetadata,
  normalizeRecommendationMetadata,
} from '../utils/planGenerator';
import { auth, db } from '../firebase/config';
import { doc, getDoc, setDoc, deleteDoc, deleteField } from 'firebase/firestore';
import { Logger } from '../utils/logger';
import { GeminiRecommendationResult, generateGeminiRecommendation } from '../services/geminiRecommendation';
import { buildReviewDeferredUntil, shouldAutoArchiveHoliday } from '../utils/holidayDates';

export interface Holiday {
  id: string;
  title: string;
  startDate: string;
  note?: string;
  source?: 'manual' | 'calendar' | 'weekend' | 'test';
}

export interface CalendarPlanningEvent {
  id: string;
  title: string;
  start: string;
  end: string | null;
  isAllDay: boolean;
  calendarId: string;
  calendarSummary: string;
}

export interface CalendarContext {
  source: 'google';
  syncedAt: number;
  upcomingEvents: CalendarPlanningEvent[];
  planningSummary: string | null;
}

export interface ManualScheduleEntry {
  id: string;
  kind: 'schedule' | 'holiday';
  title: string;
  dateKey: string;
  start: string | null;
  end: string | null;
  isAllDay: boolean;
  note?: string;
  source: 'manual';
}

export interface HolidayReview {
  rating: number;
  memo: string;
  createdAt: string;
}

export interface HolidayReviewDraft {
  rating: number;
  memo: string;
  updatedAt: string;
}

export type HolidayArchiveReason = 'reviewed' | 'skipped' | 'expired' | 'replaced';

export interface PastHolidayRecord {
  recordId: string;
  holiday: Holiday;
  review: HolidayReview | null;
  plans: PlanItem[];
  recommendation: PlanRecommendation | null;
  decisionAnswers: DecisionAnswers | null;
  archivedAt: number;
  archiveReason: HolidayArchiveReason;
  skippedAt?: string | null;
}

interface AppState {
  currentHoliday: Holiday | null;
  calendarContext: CalendarContext | null;
  manualEntries: ManualScheduleEntry[];
  selectedDecision: string | null;
  decisionAnswers: DecisionAnswers | null;
  planGenerationError: string | null;
  recommendation: PlanRecommendation | null;
  generatedPlans: PlanItem[];
  isPlanConfirmed: boolean;
  plans: PlanItem[];
  review: HolidayReview | null;
  reviewDraft: HolidayReviewDraft | null;
  reviewDeferredUntil: string | null;
  pastHolidays: PastHolidayRecord[];
  lastUpdatedAt: number;
  
  // Actions
  loadFromFirestore: (requestedUid?: string) => Promise<void>;
  setHoliday: (holiday: Holiday | null) => void;
  setCalendarContext: (context: CalendarContext | null) => void;
  upsertManualEntry: (entry: ManualScheduleEntry) => void;
  deleteManualEntry: (entryId: string) => void;
  setCurrentHolidayFromEntry: (entryId: string) => void;
  setDecisionAnswersOnly: (answers: DecisionAnswers | null) => void;
  setDecisionAndGeneratePlans: (answers: DecisionAnswers) => Promise<PlanRecommendation>;
  retryPlanGeneration: () => Promise<PlanRecommendation | null>;
  adjustPlanIntensity: (intensity: PlanIntensity, sourceAnswers?: DecisionAnswers) => Promise<void>;
  setPlanConfirmed: (confirmed: boolean) => void;
  setPlans: (plans: PlanItem[]) => void;
  updatePlanItem: (planId: string, updates: Partial<Pick<PlanItem, 'timeSlot' | 'text' | 'isDone'>>) => void;
  addPlanItem: (timeSlot?: string) => void;
  deletePlanItem: (planId: string) => void;
  togglePlanCheck: (planId: string) => void;
  setReviewDraft: (draft: Pick<HolidayReviewDraft, 'rating' | 'memo'> | null) => void;
  saveReview: (review: Omit<HolidayReview, 'createdAt'>) => string | null;
  updatePastHolidayReview: (recordId: string, review: Omit<HolidayReview, 'createdAt'>) => void;
  archiveCurrentHoliday: (reason: HolidayArchiveReason) => string | null;
  deferReview: () => void;
  runHolidayLifecycle: () => void;
  reset: () => void;
  clearLocalData: () => Promise<void>;
  clearAllData: () => Promise<void>;
}

type PersistedAppData = Pick<
  AppState,
  | 'currentHoliday'
  | 'calendarContext'
  | 'manualEntries'
  | 'selectedDecision'
  | 'decisionAnswers'
  | 'planGenerationError'
  | 'recommendation'
  | 'generatedPlans'
  | 'isPlanConfirmed'
  | 'plans'
  | 'review'
  | 'reviewDraft'
  | 'reviewDeferredUntil'
  | 'pastHolidays'
  | 'lastUpdatedAt'
>;

const EMPTY_APP_DATA: PersistedAppData = {
  currentHoliday: null,
  calendarContext: null,
  manualEntries: [],
  selectedDecision: null,
  decisionAnswers: null,
  planGenerationError: null,
  recommendation: null,
  generatedPlans: [],
  isPlanConfirmed: false,
  plans: [],
  review: null,
  reviewDraft: null,
  reviewDeferredUntil: null,
  pastHolidays: [],
  lastUpdatedAt: 0,
};

const getPersistedAppData = (state: AppState): PersistedAppData => ({
  currentHoliday: state.currentHoliday,
  calendarContext: state.calendarContext,
  manualEntries: state.manualEntries,
  selectedDecision: state.selectedDecision,
  decisionAnswers: state.decisionAnswers,
  planGenerationError: state.planGenerationError,
  recommendation: state.recommendation,
  generatedPlans: state.generatedPlans,
  isPlanConfirmed: state.isPlanConfirmed,
  plans: state.plans,
  review: state.review,
  reviewDraft: state.reviewDraft,
  reviewDeferredUntil: state.reviewDeferredUntil,
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

function isArchiveReason(value: unknown): value is HolidayArchiveReason {
  return value === 'reviewed' || value === 'skipped' || value === 'expired' || value === 'replaced';
}

function normalizeCalendarPlanningEvent(event: Partial<CalendarPlanningEvent>): CalendarPlanningEvent | null {
  if (
    typeof event.id !== 'string' ||
    typeof event.title !== 'string' ||
    typeof event.start !== 'string' ||
    typeof event.calendarId !== 'string' ||
    typeof event.calendarSummary !== 'string'
  ) {
    return null;
  }

  return {
    id: event.id,
    title: event.title,
    start: event.start,
    end: typeof event.end === 'string' ? event.end : null,
    isAllDay: !!event.isAllDay,
    calendarId: event.calendarId,
    calendarSummary: event.calendarSummary,
  };
}

function normalizeCalendarContext(context: unknown): CalendarContext | null {
  if (!context || typeof context !== 'object') return null;

  const candidate = context as Partial<CalendarContext>;
  if (
    candidate.source !== 'google' ||
    typeof candidate.syncedAt !== 'number' ||
    !Array.isArray(candidate.upcomingEvents)
  ) {
    return null;
  }

  const upcomingEvents = candidate.upcomingEvents
    .map((event) => normalizeCalendarPlanningEvent(event))
    .filter((event): event is CalendarPlanningEvent => !!event);

  return {
    source: 'google',
    syncedAt: candidate.syncedAt,
    upcomingEvents,
    planningSummary: typeof candidate.planningSummary === 'string' ? candidate.planningSummary : null,
  };
}

function normalizeManualScheduleEntry(entry: Partial<ManualScheduleEntry>): ManualScheduleEntry | null {
  if (
    typeof entry.id !== 'string' ||
    (entry.kind !== 'schedule' && entry.kind !== 'holiday') ||
    typeof entry.title !== 'string' ||
    typeof entry.dateKey !== 'string'
  ) {
    return null;
  }

  return {
    id: entry.id,
    kind: entry.kind,
    title: entry.title,
    dateKey: entry.dateKey,
    start: typeof entry.start === 'string' ? entry.start : null,
    end: typeof entry.end === 'string' ? entry.end : null,
    isAllDay: !!entry.isAllDay,
    note: typeof entry.note === 'string' ? entry.note : '',
    source: 'manual',
  };
}

function normalizeManualScheduleEntries(entries: ManualScheduleEntry[] | unknown): ManualScheduleEntry[] {
  if (!Array.isArray(entries)) return [];
  return entries
    .filter((entry): entry is Partial<ManualScheduleEntry> => !!entry && typeof entry === 'object')
    .map((entry) => normalizeManualScheduleEntry(entry))
    .filter((entry): entry is ManualScheduleEntry => !!entry);
}

function normalizePastHolidayRecord(record: Partial<PastHolidayRecord>): PastHolidayRecord {
  const archivedAt = typeof record.archivedAt === 'number' ? record.archivedAt : Date.now();
  const holidayId = typeof record.holiday?.id === 'string' ? record.holiday.id : 'holiday';

  return {
    recordId: typeof record.recordId === 'string' && record.recordId.length > 0
      ? record.recordId
      : `${holidayId}-${archivedAt}`,
    holiday: record.holiday as Holiday,
    review: record.review ?? null,
    plans: Array.isArray(record.plans) ? record.plans : [],
    recommendation: record.recommendation ? normalizeRecommendationMetadata(record.recommendation) : null,
    decisionAnswers: record.decisionAnswers ?? null,
    archivedAt,
    archiveReason: isArchiveReason(record.archiveReason) ? record.archiveReason : 'replaced',
    skippedAt: typeof record.skippedAt === 'string' ? record.skippedAt : null,
  };
}

function normalizePastHolidayRecords(records: PastHolidayRecord[] | unknown): PastHolidayRecord[] {
  if (!Array.isArray(records)) return [];
  return records
    .filter((record): record is Partial<PastHolidayRecord> => !!record && typeof record === 'object')
    .map(normalizePastHolidayRecord);
}

function buildArchivedRecord(
  state: PersistedAppData,
  reason: HolidayArchiveReason,
  reviewOverride?: HolidayReview | null
): PastHolidayRecord | null {
  if (!state.currentHoliday) return null;

  const hasMeaningfulData = state.plans.length > 0 || !!state.review || !!state.decisionAnswers;
  if (reason === 'replaced' && !hasMeaningfulData) {
    return null;
  }

  const archivedAt = Date.now();

  return normalizePastHolidayRecord({
    recordId: `${state.currentHoliday.id}-${archivedAt}`,
    holiday: state.currentHoliday,
    review: reviewOverride ?? state.review,
    plans: state.plans,
    recommendation: state.recommendation,
    decisionAnswers: state.decisionAnswers,
    archivedAt,
    archiveReason: reason,
    skippedAt: reason === 'skipped' ? new Date(archivedAt).toISOString() : null,
  });
}

function appendPastHolidayRecord(
  existingRecords: PastHolidayRecord[],
  record: PastHolidayRecord | null
) {
  const normalizedRecords = normalizePastHolidayRecords(existingRecords);
  if (!record) return normalizedRecords;
  return [...normalizedRecords.slice(-19), record];
}

function normalizeRecommendationText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function getRecommendationSimilarityScore(
  current: PlanRecommendation | null,
  next: PlanRecommendation | null
) {
  if (!current || !next) return 0;

  let score = 0;
  if (normalizeRecommendationText(current.direction) === normalizeRecommendationText(next.direction)) {
    score += 3;
  }
  if (normalizeRecommendationText(current.reason) === normalizeRecommendationText(next.reason)) {
    score += 2;
  }

  const matchedPlans = current.plans.reduce((count, plan, index) => {
    const nextPlan = next.plans[index];
    if (!nextPlan) return count;

    return (
      count +
      Number(
        normalizeRecommendationText(plan.timeSlot) === normalizeRecommendationText(nextPlan.timeSlot) &&
          normalizeRecommendationText(plan.text) === normalizeRecommendationText(nextPlan.text)
      )
    );
  }, 0);

  return score + matchedPlans * 2;
}

function shouldRetryRecommendationChange(
  current: PlanRecommendation | null,
  next: PlanRecommendation | null
) {
  if (!current || !next) return false;

  const similarityScore = getRecommendationSimilarityScore(current, next);
  return similarityScore >= 7;
}

function isSameDecisionAnswers(
  current: DecisionAnswers | null,
  next: DecisionAnswers | null
) {
  if (!current || !next) return false;

  return (
    current.energy === next.energy &&
    current.desiredMood === next.desiredMood &&
    current.socialMode === next.socialMode &&
    current.mustDo.trim() === next.mustDo.trim() &&
    current.intensity === next.intensity
  );
}

function buildRecommendationFromGeneration(
  answers: DecisionAnswers,
  holiday: Holiday | null,
  calendarContext: CalendarContext | null,
  geminiResult: GeminiRecommendationResult,
  usedRetry: boolean
) {
  if (geminiResult.success && geminiResult.recommendation) {
    return normalizeRecommendationMetadata({
      ...geminiResult.recommendation,
      retryCount: usedRetry ? 1 : 0,
    });
  }

  const fallbackMetadata: RecommendationMetadata = {
    source: usedRetry ? 'gemini_retry_then_rule_based' : 'rule_based',
    model: usedRetry ? geminiResult.model : 'rule-based',
    failureReason: geminiResult.failureReason,
    httpStatus: geminiResult.httpStatus,
    retryCount: usedRetry ? 1 : 0,
  };

  Logger.warn('Using rule-based recommendation fallback.', fallbackMetadata);
  return generateRecommendationFromAnswersWithMetadata(answers, fallbackMetadata, holiday, calendarContext);
}

const syncToFirestore = async (state: PersistedAppData, requestedUid?: string) => {
  const targetUid = requestedUid ?? auth.currentUser?.uid;
  if (!targetUid) return;
  if (requestedUid && auth.currentUser?.uid !== requestedUid) return;
  
  try {
    const userRef = doc(db, 'users', targetUid);
    await setDoc(userRef, {
      currentHoliday: state.currentHoliday,
      calendarContext: state.calendarContext,
      manualEntries: state.manualEntries,
      selectedDecision: state.selectedDecision,
      decisionAnswers: state.decisionAnswers,
      planGenerationError: state.planGenerationError,
      recommendation: state.recommendation,
      generatedPlans: state.generatedPlans,
      isPlanConfirmed: state.isPlanConfirmed,
      recommendationsByIntensity: deleteField(),
      plans: state.plans,
      review: state.review,
      reviewDraft: state.reviewDraft,
      reviewDeferredUntil: state.reviewDeferredUntil,
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

      loadFromFirestore: async (requestedUid) => {
        const activeUid = requestedUid ?? auth.currentUser?.uid;
        if (!activeUid) return;

        try {
          const docSnap = await getDoc(doc(db, 'users', activeUid));

          if (auth.currentUser?.uid !== activeUid) {
            return;
          }

          if (docSnap.exists()) {
            const data = docSnap.data();
            const remoteUpdatedAt = typeof data.updatedAt === 'number' ? data.updatedAt : 0;
            const localState = getPersistedAppData(get());

            if (localState.lastUpdatedAt > remoteUpdatedAt) {
              await syncToFirestore(localState, activeUid);
              return;
            }

            set({
              currentHoliday: data.currentHoliday || null,
              calendarContext: normalizeCalendarContext(data.calendarContext),
              manualEntries: normalizeManualScheduleEntries(data.manualEntries),
              selectedDecision: data.selectedDecision || null,
              decisionAnswers: data.decisionAnswers || null,
              planGenerationError: data.planGenerationError || null,
              recommendation: data.recommendation ? normalizeRecommendationMetadata(data.recommendation) : null,
              generatedPlans: Array.isArray(data.generatedPlans)
                ? data.generatedPlans
                : Array.isArray(data.plans)
                  ? data.plans
                  : [],
              isPlanConfirmed: !!data.isPlanConfirmed,
              plans: data.plans || [],
              review: data.review || null,
              reviewDraft: data.reviewDraft || null,
              reviewDeferredUntil: data.reviewDeferredUntil || null,
              pastHolidays: normalizePastHolidayRecords(data.pastHolidays),
              lastUpdatedAt: remoteUpdatedAt,
            });
          } else {
            const localState = getPersistedAppData(get());
            if (localState.lastUpdatedAt > 0) {
              await syncToFirestore(localState, activeUid);
            }
          }
        } catch (e) {
          Logger.error("Failed to load from Firestore", e);
        }
      },

      setHoliday: (holiday) => {
        const current = get();
        const archivedRecord = buildArchivedRecord(current, 'replaced');

        const nextState = {
          currentHoliday: holiday,
          calendarContext: current.calendarContext,
          manualEntries: current.manualEntries,
          selectedDecision: null,
          decisionAnswers: null,
          planGenerationError: null,
          recommendation: null,
          generatedPlans: [],
          isPlanConfirmed: false,
          plans: [],
          review: null,
          reviewDraft: null,
          reviewDeferredUntil: null,
          pastHolidays: appendPastHolidayRecord(current.pastHolidays, archivedRecord),
          lastUpdatedAt: Date.now(),
        };

        set(nextState);
        syncToFirestore(nextState);
      },

      setCalendarContext: (calendarContext) => {
        const nextState = {
          ...getPersistedAppData(get()),
          calendarContext,
          lastUpdatedAt: Date.now(),
        };

        set({
          calendarContext,
          lastUpdatedAt: nextState.lastUpdatedAt,
        });
        syncToFirestore(nextState);
      },

      upsertManualEntry: (entry) => {
        const normalizedEntry = normalizeManualScheduleEntry(entry);
        if (!normalizedEntry) {
          return;
        }

        set((state) => {
          const existingIndex = state.manualEntries.findIndex((currentEntry) => currentEntry.id === normalizedEntry.id);
          const manualEntries =
            existingIndex >= 0
              ? state.manualEntries.map((currentEntry) =>
                  currentEntry.id === normalizedEntry.id ? normalizedEntry : currentEntry
                )
              : [...state.manualEntries, normalizedEntry];

          const currentHoliday =
            normalizedEntry.kind === 'holiday' && state.currentHoliday?.id === normalizedEntry.id
              ? {
                  ...state.currentHoliday,
                  title: normalizedEntry.title,
                  startDate: normalizedEntry.dateKey,
                  note: normalizedEntry.note,
                  source: 'manual' as const,
                }
              : state.currentHoliday;

          const nextState = {
            ...getPersistedAppData(state),
            manualEntries,
            currentHoliday,
            lastUpdatedAt: Date.now(),
          };

          syncToFirestore(nextState);
          return {
            manualEntries,
            currentHoliday,
            lastUpdatedAt: nextState.lastUpdatedAt,
          };
        });
      },

      deleteManualEntry: (entryId) => {
        set((state) => {
          const manualEntries = state.manualEntries.filter((entry) => entry.id !== entryId);
          const isDeletingCurrentHoliday = state.currentHoliday?.id === entryId && state.currentHoliday.source === 'manual';

          const nextState = {
            ...getPersistedAppData(state),
            manualEntries,
            currentHoliday: isDeletingCurrentHoliday ? null : state.currentHoliday,
            selectedDecision: isDeletingCurrentHoliday ? null : state.selectedDecision,
            decisionAnswers: isDeletingCurrentHoliday ? null : state.decisionAnswers,
            planGenerationError: isDeletingCurrentHoliday ? null : state.planGenerationError,
            recommendation: isDeletingCurrentHoliday ? null : state.recommendation,
            generatedPlans: isDeletingCurrentHoliday ? [] : state.generatedPlans,
            isPlanConfirmed: isDeletingCurrentHoliday ? false : state.isPlanConfirmed,
            plans: isDeletingCurrentHoliday ? [] : state.plans,
            review: isDeletingCurrentHoliday ? null : state.review,
            reviewDraft: isDeletingCurrentHoliday ? null : state.reviewDraft,
            reviewDeferredUntil: isDeletingCurrentHoliday ? null : state.reviewDeferredUntil,
            lastUpdatedAt: Date.now(),
          };

          syncToFirestore(nextState);
          return nextState;
        });
      },

      setCurrentHolidayFromEntry: (entryId) => {
        const entry = get().manualEntries.find((currentEntry) => currentEntry.id === entryId);
        if (!entry || entry.kind !== 'holiday') {
          return;
        }

        const nextHoliday: Holiday = {
          id: entry.id,
          title: entry.title,
          startDate: entry.dateKey,
          note: entry.note,
          source: 'manual',
        };

        if (get().currentHoliday?.id === entry.id) {
          const nextState = {
            ...getPersistedAppData(get()),
            currentHoliday: nextHoliday,
            lastUpdatedAt: Date.now(),
          };

          set({
            currentHoliday: nextHoliday,
            lastUpdatedAt: nextState.lastUpdatedAt,
          });
          syncToFirestore(nextState);
          return;
        }

        get().setHoliday(nextHoliday);
      },

      setDecisionAnswersOnly: (answers) => {
        const state = get();
        const nextState = {
          currentHoliday: state.currentHoliday,
          calendarContext: state.calendarContext,
          manualEntries: state.manualEntries,
          selectedDecision: state.selectedDecision,
          decisionAnswers: answers,
          planGenerationError: null,
          recommendation: state.recommendation,
          generatedPlans: state.generatedPlans,
          isPlanConfirmed: state.isPlanConfirmed,
          plans: state.plans,
          review: state.review,
          reviewDraft: state.reviewDraft,
          reviewDeferredUntil: state.reviewDeferredUntil,
          pastHolidays: state.pastHolidays,
          lastUpdatedAt: Date.now(),
        };

        set(nextState);
        syncToFirestore(nextState);
      },

      setDecisionAndGeneratePlans: async (answers) => {
        const state = get();
        try {
          const previousRecommendation = state.recommendation;
          const previousIntensity = state.decisionAnswers?.intensity;
          let geminiResult = await generateGeminiRecommendation(answers, state.currentHoliday, state.calendarContext, {
            previousIntensity: state.decisionAnswers?.intensity,
            previousRecommendation: state.recommendation,
          });

          if (
            !isSameDecisionAnswers(state.decisionAnswers, answers) &&
            shouldRetryRecommendationChange(previousRecommendation, geminiResult.recommendation)
          ) {
            Logger.warn('Gemini returned the same recommendation after answers changed; retrying.');
            geminiResult = await generateGeminiRecommendation(answers, state.currentHoliday, state.calendarContext, {
              previousIntensity,
              previousRecommendation,
              forceDistinctFromPrevious: true,
            });
          }

          const recommendation = buildRecommendationFromGeneration(
            answers,
            state.currentHoliday,
            state.calendarContext,
            geminiResult,
            shouldRetryRecommendationChange(previousRecommendation, geminiResult.recommendation)
          );
          const nextState = {
            currentHoliday: state.currentHoliday,
            calendarContext: state.calendarContext,
            manualEntries: state.manualEntries,
            selectedDecision: recommendation.direction,
            decisionAnswers: answers,
            planGenerationError: null,
            recommendation,
            generatedPlans: recommendation.plans,
            isPlanConfirmed: false,
            plans: recommendation.plans,
            review: null,
            reviewDraft: null,
            reviewDeferredUntil: null,
            pastHolidays: state.pastHolidays,
            lastUpdatedAt: Date.now(),
          };

          set(nextState);
          syncToFirestore(nextState);
          return recommendation;
        } catch (error) {
          const nextState = {
            currentHoliday: state.currentHoliday,
            calendarContext: state.calendarContext,
            manualEntries: state.manualEntries,
            selectedDecision: null,
            decisionAnswers: answers,
            planGenerationError: '계획 생성이 중간에 멈췄어요. 네트워크 상태를 확인한 뒤 다시 시도해주세요.',
            recommendation: null,
            generatedPlans: [],
            isPlanConfirmed: false,
            plans: [],
            review: null,
            reviewDraft: null,
            reviewDeferredUntil: null,
            pastHolidays: state.pastHolidays,
            lastUpdatedAt: Date.now(),
          };

          set(nextState);
          syncToFirestore(nextState);
          throw error;
        }
      },

      retryPlanGeneration: async () => {
        const answers = get().decisionAnswers;
        if (!answers) return null;
        return get().setDecisionAndGeneratePlans(answers);
      },

      adjustPlanIntensity: async (intensity, sourceAnswers) => {
        const state = get();
        const answers = sourceAnswers ?? state.decisionAnswers;
        if (!answers) return;

        const adjustedAnswers = { ...answers, intensity };
        const previousRecommendation = state.recommendation;
        let geminiResult = await generateGeminiRecommendation(
          adjustedAnswers,
          state.currentHoliday,
          state.calendarContext,
          {
            previousIntensity: answers.intensity,
            previousRecommendation: state.recommendation,
          }
        );

        const shouldRetry = shouldRetryRecommendationChange(previousRecommendation, geminiResult.recommendation);

        if (shouldRetry) {
          Logger.warn('Gemini returned the same recommendation for a different intensity; retrying.');
          geminiResult = await generateGeminiRecommendation(
            adjustedAnswers,
            state.currentHoliday,
            state.calendarContext,
            {
              previousIntensity: answers.intensity,
              previousRecommendation,
              forceDistinctFromPrevious: true,
            }
          );
        }

        const recommendation = buildRecommendationFromGeneration(
          adjustedAnswers,
          state.currentHoliday,
          state.calendarContext,
          geminiResult,
          shouldRetry
        );
        const nextState = {
          currentHoliday: state.currentHoliday,
          calendarContext: state.calendarContext,
          manualEntries: state.manualEntries,
          selectedDecision: recommendation.direction,
          decisionAnswers: adjustedAnswers,
          planGenerationError: null,
          recommendation,
          generatedPlans: recommendation.plans,
          isPlanConfirmed: false,
          plans: recommendation.plans,
          review: null,
          reviewDraft: null,
          reviewDeferredUntil: null,
          pastHolidays: state.pastHolidays,
          lastUpdatedAt: Date.now(),
        };

        set(nextState);
        syncToFirestore(nextState);
      },

      setPlanConfirmed: (confirmed) => {
        const nextState = {
          ...getPersistedAppData(get()),
          isPlanConfirmed: confirmed,
          lastUpdatedAt: Date.now(),
        };

        set({
          isPlanConfirmed: confirmed,
          lastUpdatedAt: nextState.lastUpdatedAt,
        });
        syncToFirestore(nextState);
      },

      setPlans: (plans) => {
        const nextState = {
          ...getPersistedAppData(get()),
          plans,
          isPlanConfirmed: false,
          lastUpdatedAt: Date.now(),
        };

        set({ plans, isPlanConfirmed: false, lastUpdatedAt: nextState.lastUpdatedAt });
        syncToFirestore(nextState);
      },

      updatePlanItem: (planId, updates) => {
        set((state) => {
          const plans = state.plans.map((plan) =>
            plan.id === planId
              ? {
                  ...plan,
                  ...updates,
                  timeSlot: typeof updates.timeSlot === 'string' ? updates.timeSlot : plan.timeSlot,
                  text: typeof updates.text === 'string' ? updates.text : plan.text,
                }
              : plan
          );
          const nextState = {
            ...getPersistedAppData(state),
            plans,
            isPlanConfirmed: false,
            lastUpdatedAt: Date.now(),
          };
          syncToFirestore(nextState);
          return { plans, isPlanConfirmed: false, lastUpdatedAt: nextState.lastUpdatedAt };
        });
      },

      addPlanItem: (timeSlot = '점심') => {
        set((state) => {
          const plans = [
            ...state.plans,
            {
              id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              timeSlot,
              text: '',
              isDone: false,
            },
          ];
          const nextState = {
            ...getPersistedAppData(state),
            plans,
            isPlanConfirmed: false,
            lastUpdatedAt: Date.now(),
          };
          syncToFirestore(nextState);
          return { plans, isPlanConfirmed: false, lastUpdatedAt: nextState.lastUpdatedAt };
        });
      },

      deletePlanItem: (planId) => {
        set((state) => {
          const plans = state.plans.filter((plan) => plan.id !== planId);
          const nextState = {
            ...getPersistedAppData(state),
            plans,
            isPlanConfirmed: false,
            lastUpdatedAt: Date.now(),
          };
          syncToFirestore(nextState);
          return { plans, isPlanConfirmed: false, lastUpdatedAt: nextState.lastUpdatedAt };
        });
      },

      togglePlanCheck: (planId) => {
        set((state) => {
          const newPlans = state.plans.map(p =>
            p.id === planId ? { ...p, isDone: !p.isDone } : p
          );
          const nextState = {
            currentHoliday: state.currentHoliday,
            calendarContext: state.calendarContext,
            manualEntries: state.manualEntries,
            selectedDecision: state.selectedDecision,
            decisionAnswers: state.decisionAnswers,
            planGenerationError: state.planGenerationError,
            recommendation: state.recommendation,
            generatedPlans: state.generatedPlans,
            isPlanConfirmed: state.isPlanConfirmed,
            plans: newPlans,
            review: state.review,
            reviewDraft: state.reviewDraft,
            reviewDeferredUntil: state.reviewDeferredUntil,
            pastHolidays: state.pastHolidays,
            lastUpdatedAt: Date.now(),
          };
          syncToFirestore(nextState);
          return { plans: newPlans, lastUpdatedAt: nextState.lastUpdatedAt };
        });
      },

      setReviewDraft: (draft) => {
        set({
          reviewDraft: draft
            ? {
                ...draft,
                updatedAt: new Date().toISOString(),
              }
            : null,
        });
      },

      saveReview: (review) => {
        const current = get();
        if (!current.currentHoliday) return null;

        const nextReview = {
          ...review,
          createdAt: new Date().toISOString(),
        };
        const archivedRecord = buildArchivedRecord(current, 'reviewed', nextReview);

        const nextState = {
          currentHoliday: null,
          calendarContext: current.calendarContext,
          manualEntries: current.manualEntries,
          selectedDecision: null,
          decisionAnswers: null,
          planGenerationError: null,
          recommendation: null,
          generatedPlans: [],
          isPlanConfirmed: false,
          plans: [],
          review: null,
          reviewDraft: null,
          reviewDeferredUntil: null,
          pastHolidays: appendPastHolidayRecord(current.pastHolidays, archivedRecord),
          lastUpdatedAt: Date.now(),
        };

        set(nextState);
        syncToFirestore(nextState);
        return archivedRecord?.recordId ?? null;
      },

      updatePastHolidayReview: (recordId, review) => {
        const nowIso = new Date().toISOString();
        const pastHolidays = normalizePastHolidayRecords(get().pastHolidays).map((record) =>
          record.recordId === recordId
            ? {
                ...record,
                review: {
                  ...review,
                  createdAt: record.review?.createdAt ?? nowIso,
                },
              }
            : record
        );

        const nextState = {
          ...getPersistedAppData(get()),
          pastHolidays,
          lastUpdatedAt: Date.now(),
        };

        set({ pastHolidays, lastUpdatedAt: nextState.lastUpdatedAt });
        syncToFirestore(nextState);
      },

      archiveCurrentHoliday: (reason) => {
        const current = get();
        if (!current.currentHoliday) return null;

        const archivedRecord = buildArchivedRecord(current, reason);
        const nextState = {
          currentHoliday: null,
          calendarContext: current.calendarContext,
          manualEntries: current.manualEntries,
          selectedDecision: null,
          decisionAnswers: null,
          planGenerationError: null,
          recommendation: null,
          generatedPlans: [],
          isPlanConfirmed: false,
          plans: [],
          review: null,
          reviewDraft: null,
          reviewDeferredUntil: null,
          pastHolidays: appendPastHolidayRecord(current.pastHolidays, archivedRecord),
          lastUpdatedAt: Date.now(),
        };

        set(nextState);
        syncToFirestore(nextState);
        return archivedRecord?.recordId ?? null;
      },

      deferReview: () => {
        const nextState = {
          ...getPersistedAppData(get()),
          reviewDeferredUntil: buildReviewDeferredUntil(),
          lastUpdatedAt: Date.now(),
        };

        set({
          reviewDeferredUntil: nextState.reviewDeferredUntil,
          lastUpdatedAt: nextState.lastUpdatedAt,
        });
        syncToFirestore(nextState);
      },

      runHolidayLifecycle: () => {
        const state = get();
        if (!state.currentHoliday || state.review) return;
        if (shouldAutoArchiveHoliday(state.currentHoliday.startDate)) {
          get().archiveCurrentHoliday('expired');
        }
      },

      reset: () => {
        const nextState = {
          currentHoliday: null,
          calendarContext: get().calendarContext,
          manualEntries: get().manualEntries,
          selectedDecision: null,
          decisionAnswers: null,
          planGenerationError: null,
          recommendation: null,
          generatedPlans: [],
          isPlanConfirmed: false,
          plans: [],
          review: null,
          reviewDraft: null,
          reviewDeferredUntil: null,
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
          calendarContext: null,
          manualEntries: [],
          selectedDecision: null,
          decisionAnswers: null,
          planGenerationError: null,
          recommendation: null,
          generatedPlans: [],
          isPlanConfirmed: false,
          plans: [],
          review: null,
          reviewDraft: null,
          reviewDeferredUntil: null,
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
          ? {
              ...currentState,
              ...persistedState,
              calendarContext: normalizeCalendarContext(persistedState.calendarContext),
              manualEntries: normalizeManualScheduleEntries(persistedState.manualEntries),
              recommendation: persistedState.recommendation
                ? normalizeRecommendationMetadata(persistedState.recommendation)
                : null,
              generatedPlans: Array.isArray(persistedState.generatedPlans)
                ? persistedState.generatedPlans
                : [],
              isPlanConfirmed: !!persistedState.isPlanConfirmed,
              pastHolidays: normalizePastHolidayRecords(persistedState.pastHolidays),
            }
          : currentState;
      },
    }
  )
);
