import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, shadows } from '../theme/theme';
import { useAppStore } from '../store/useAppStore';
import {
  getRecommendationSourceDescription,
  getRecommendationSourceLabel,
} from '../utils/planGenerator';
import type { PlanIntensity, PlanItem } from '../utils/planGenerator';
import { getHolidayDayDiff } from '../utils/holidayDates';

const QUICK_TIME_SLOTS = ['오전', '점심', '오후', '저녁'];

function createDraftPlan(timeSlot = '점심'): PlanItem {
  return {
    id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timeSlot,
    text: '',
    isDone: false,
  };
}

function normalizeEditablePlans(plans: PlanItem[]) {
  return plans.map((plan) => ({
    timeSlot: plan.timeSlot.trim(),
    text: plan.text.trim(),
  }));
}

function arePlansEquivalent(left: PlanItem[], right: PlanItem[]) {
  return JSON.stringify(normalizeEditablePlans(left)) === JSON.stringify(normalizeEditablePlans(right));
}

function formatCalendarEventPreview(start: string, isAllDay: boolean, title: string) {
  if (isAllDay) {
    return `${start.slice(5, 10).replace('-', '/')} 종일 · ${title}`;
  }

  const date = new Date(start);
  if (Number.isNaN(date.getTime())) {
    return title;
  }

  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')} · ${title}`;
}

export default function PlanPreviewView() {
  const navigation = useNavigation<any>();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1080;
  const [isRetryingPlan, setIsRetryingPlan] = useState(false);
  const [isAdjustingIntensity, setIsAdjustingIntensity] = useState(false);
  const [adjustmentError, setAdjustmentError] = useState<string | null>(null);
  const {
    currentHoliday,
    calendarContext,
    decisionAnswers,
    recommendation,
    generatedPlans,
    isPlanConfirmed,
    plans,
    adjustPlanIntensity,
    retryPlanGeneration,
    setPlanConfirmed,
    setPlans,
  } = useAppStore();
  const [draftPlans, setDraftPlans] = useState<PlanItem[]>(plans);

  const plansSnapshot = useMemo(() => JSON.stringify(plans), [plans]);
  const draftPlansSnapshot = useMemo(() => JSON.stringify(draftPlans), [draftPlans]);
  const daysDiff = currentHoliday ? getHolidayDayDiff(currentHoliday.startDate) : 0;
  const isTodayHoliday = !!currentHoliday && daysDiff === 0;
  const recommendationSourceLabel = recommendation
    ? getRecommendationSourceLabel(recommendation.source)
    : null;
  const recommendationSourceDescription = getRecommendationSourceDescription(recommendation);
  const hasManualEdits = !arePlansEquivalent(generatedPlans, draftPlans);
  const totalPlanCount = draftPlans.length;

  useEffect(() => {
    setDraftPlans(plans);
  }, [plansSnapshot]);

  useEffect(() => {
    if (draftPlansSnapshot === plansSnapshot) return;

    const timerId = setTimeout(() => {
      setPlans(draftPlans);
    }, 250);

    return () => clearTimeout(timerId);
  }, [draftPlans, draftPlansSnapshot, plansSnapshot, setPlans]);

  const handleAdjustIntensity = async (intensity: PlanIntensity) => {
    if (!decisionAnswers) return;
    if (decisionAnswers.intensity === intensity) return;
    if (isAdjustingIntensity) return;

    setAdjustmentError(null);
    setIsAdjustingIntensity(true);
    try {
      await adjustPlanIntensity(intensity, decisionAnswers);
    } catch (error) {
      console.warn('Failed to adjust plan intensity:', error);
      setAdjustmentError('계획 강도를 바꾸지 못했습니다. 기존 초안은 그대로 두었어요.');
    } finally {
      setIsAdjustingIntensity(false);
    }
  };

  const handleRetryPlan = async () => {
    if (isRetryingPlan) return;

    try {
      setIsRetryingPlan(true);
      const nextRecommendation = await retryPlanGeneration();
      if (!nextRecommendation) {
        Alert.alert('다시 시도할 답변이 없어요', '상태 체크를 다시 진행한 뒤 계획을 만들어주세요.');
      }
    } catch (error) {
      console.warn('Failed to retry plan generation:', error);
      Alert.alert('다시 만들지 못했어요', '잠시 후 다시 시도하거나 상태 체크를 다시 진행해주세요.');
    } finally {
      setIsRetryingPlan(false);
    }
  };

  const handleDraftPlanChange = (planId: string, field: 'timeSlot' | 'text', value: string) => {
    setDraftPlans((currentPlans) =>
      currentPlans.map((plan) => (plan.id === planId ? { ...plan, [field]: value } : plan))
    );
  };

  const handleAddPlan = (timeSlot = '점심') => {
    setDraftPlans((currentPlans) => [...currentPlans, createDraftPlan(timeSlot)]);
  };

  const handleDeletePlan = (planId: string) => {
    setDraftPlans((currentPlans) => currentPlans.filter((plan) => plan.id !== planId));
  };

  const handleConfirmPlan = () => {
    if (draftPlans.length === 0) {
      Alert.alert('계획이 비어 있어요', '최소 한 개 이상의 계획 항목을 남겨주세요.');
      return;
    }

    if (draftPlans.some((plan) => !plan.timeSlot.trim() || !plan.text.trim())) {
      Alert.alert('빈 항목이 있어요', '시간대와 내용을 모두 입력한 뒤 확정해주세요.');
      return;
    }

    setPlans(draftPlans);
    setPlanConfirmed(true);

    if (isTodayHoliday) {
      navigation.navigate('Execution');
      return;
    }

    navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
  };

  const handlePrimaryAction = () => {
    if (!isPlanConfirmed) {
      handleConfirmPlan();
      return;
    }

    if (isTodayHoliday) {
      navigation.navigate('Execution');
      return;
    }

    navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
  };

  if (!currentHoliday || !decisionAnswers || !recommendation) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
        <View style={[styles.emptyWrap, styles.centered]}>
          <Text style={styles.emptyTitle}>확인할 계획이 없어요</Text>
          <Text style={styles.emptyBody}>휴일을 정하고 상태 체크를 마친 뒤 계획 화면으로 들어올 수 있어요.</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Home' }] })}>
            <Text style={styles.primaryButtonText}>홈으로 돌아가기</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>계획 확인</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={[styles.contentInner, isDesktop && styles.contentDesktop]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.mainColumn, isDesktop && styles.mainColumnDesktop]}>
          <View style={styles.heroCard}>
            <View style={styles.heroBadgeRow}>
              {recommendationSourceLabel ? (
                <View style={styles.heroBadge}>
                  <Text style={styles.heroBadgeText}>{recommendationSourceLabel}</Text>
                </View>
              ) : null}
              <View style={styles.heroBadge}>
                <Text style={styles.heroBadgeText}>{isPlanConfirmed ? '확정된 계획' : '확정 전 초안'}</Text>
              </View>
              {calendarContext ? (
                <View style={styles.heroBadge}>
                  <Text style={styles.heroBadgeText}>캘린더 반영됨</Text>
                </View>
              ) : null}
              {hasManualEdits ? (
                <View style={styles.heroBadge}>
                  <Text style={styles.heroBadgeText}>직접 수정 중</Text>
                </View>
              ) : null}
            </View>

            <Text style={styles.heroTitle}>{recommendation.direction}</Text>
            <Text style={styles.heroBody}>{recommendation.reason}</Text>
            {recommendationSourceDescription ? (
              <Text style={styles.heroMeta}>{recommendationSourceDescription}</Text>
            ) : null}
          </View>

          <View style={styles.adjustCard}>
            <Text style={styles.sectionTitle}>계획 강도 조절</Text>
            <Text style={styles.sectionBody}>휴일의 밀도를 바꾸고 싶다면 초안을 다시 맞춰볼 수 있어요.</Text>
            <View style={styles.adjustBar}>
              <TouchableOpacity
                style={[
                  styles.adjustBtn,
                  decisionAnswers.intensity === 'light' && styles.adjustBtnSelected,
                  isAdjustingIntensity && styles.adjustBtnDisabled,
                ]}
                onPress={() => handleAdjustIntensity('light')}
                disabled={isAdjustingIntensity}
              >
                <Text style={styles.adjustBtnText}>더 가볍게</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.adjustBtn,
                  decisionAnswers.intensity === 'balanced' && styles.adjustBtnSelected,
                  isAdjustingIntensity && styles.adjustBtnDisabled,
                ]}
                onPress={() => handleAdjustIntensity('balanced')}
                disabled={isAdjustingIntensity}
              >
                <Text style={styles.adjustBtnText}>적당히</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.adjustBtn,
                  decisionAnswers.intensity === 'full' && styles.adjustBtnSelected,
                  isAdjustingIntensity && styles.adjustBtnDisabled,
                ]}
                onPress={() => handleAdjustIntensity('full')}
                disabled={isAdjustingIntensity}
              >
                <Text style={styles.adjustBtnText}>더 알차게</Text>
              </TouchableOpacity>
            </View>
            {adjustmentError ? <Text style={styles.adjustmentError}>{adjustmentError}</Text> : null}
          </View>

          <View style={styles.editorCard}>
            <View style={styles.editorHeader}>
              <View>
                <Text style={styles.sectionTitle}>시간대별 계획</Text>
                <Text style={styles.sectionBody}>확정 전에 시간대와 내용을 내 휴일에 맞게 다듬을 수 있어요.</Text>
              </View>
              <View style={styles.planCountPill}>
                <Text style={styles.planCountPillText}>{totalPlanCount}개 항목</Text>
              </View>
            </View>

            <View style={styles.timeline}>
              <View style={styles.timelineLine} />
              {draftPlans.map((plan) => (
                <View key={plan.id} style={styles.timelineItem}>
                  <View style={styles.timelineDot} />
                  <View style={styles.timelineContentBox}>
                    <View style={styles.planHeaderRow}>
                      <TextInput
                        style={styles.timelineTimeInput}
                        value={plan.timeSlot}
                        onChangeText={(value) => handleDraftPlanChange(plan.id, 'timeSlot', value)}
                        placeholder="예: 오전 10시~11시"
                        placeholderTextColor={colors.textSecondary}
                      />
                      <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeletePlan(plan.id)}>
                        <Text style={styles.deleteBtnText}>삭제</Text>
                      </TouchableOpacity>
                    </View>
                    <TextInput
                      style={styles.timelineContentInput}
                      value={plan.text}
                      onChangeText={(value) => handleDraftPlanChange(plan.id, 'text', value)}
                      placeholder="이 시간대에 할 일을 직접 적어보세요"
                      placeholderTextColor={colors.textSecondary}
                      multiline
                    />
                  </View>
                </View>
              ))}
            </View>
          </View>
        </View>

        <View style={[styles.sideColumn, isDesktop && styles.sideColumnDesktop]}>
          <View style={styles.sideCard}>
            <Text style={styles.sideCardTitle}>빠르게 항목 추가</Text>
            <Text style={styles.sideCardBody}>오전, 점심, 오후, 저녁 슬롯을 바로 넣고 세부 내용만 채울 수 있어요.</Text>
            <View style={styles.quickSlotRow}>
              {QUICK_TIME_SLOTS.map((slot) => (
                <TouchableOpacity key={slot} style={styles.quickSlotChip} onPress={() => handleAddPlan(slot)}>
                  <Text style={styles.quickSlotChipText}>{slot}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.addCustomBtn} onPress={() => handleAddPlan('')}>
              <Text style={styles.addCustomBtnText}>직접 시간대 추가</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.sideCard}>
            <Text style={styles.sideCardTitle}>Google Calendar 반영</Text>
            <Text style={styles.sideCardBody}>
              {calendarContext?.planningSummary ?? '아직 연결된 일정 요약이 없습니다.'}
            </Text>
            {calendarContext?.upcomingEvents.slice(0, 3).map((event) => (
              <Text key={event.id} style={styles.calendarPreviewText}>
                {formatCalendarEventPreview(event.start, event.isAllDay, event.title)}
              </Text>
            ))}
          </View>

          <View style={styles.sideCard}>
            <Text style={styles.sideCardTitle}>확정 기준</Text>
            <Text style={styles.sideCardBody}>시간대와 내용이 모두 채워진 항목이 하나 이상 있으면 확정할 수 있어요.</Text>
            {calendarContext ? (
              <Text style={styles.calendarHintText}>고정 일정이 있는 시간대는 전후 30분 정도 여유가 남도록 초안을 조정해두었습니다.</Text>
            ) : null}
          </View>
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.primaryButton, (isAdjustingIntensity || isRetryingPlan) && styles.primaryButtonDisabled]}
          activeOpacity={0.85}
          onPress={handlePrimaryAction}
          disabled={isAdjustingIntensity || isRetryingPlan}
        >
          <Text style={styles.primaryButtonText}>
            {!isPlanConfirmed ? '계획 확정하기' : isTodayHoliday ? '오늘 계획 체크하기' : '홈으로 돌아가기'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} activeOpacity={0.8} onPress={() => navigation.navigate('Decision')}>
          <Text style={styles.secondaryButtonText}>답변 다시 조정하기</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tertiaryButton}
          activeOpacity={0.8}
          onPress={handleRetryPlan}
          disabled={isRetryingPlan}
        >
          <Text style={styles.tertiaryButtonText}>
            {isRetryingPlan ? '초안 다시 만드는 중...' : '추천 초안 다시 만들기'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 20 : 0,
    paddingBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  backBtn: { padding: 8, marginLeft: -8 },
  backBtnText: { fontSize: 24, color: colors.textPrimary },
  headerTitle: { fontSize: 17, fontWeight: '600', color: colors.textPrimary },
  content: { flex: 1 },
  contentInner: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 24,
    gap: 18,
  },
  contentDesktop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  mainColumn: {
    gap: 18,
  },
  mainColumnDesktop: {
    flex: 3,
  },
  sideColumn: {
    gap: 16,
  },
  sideColumnDesktop: {
    flex: 2,
  },
  heroCard: {
    backgroundColor: '#FFF7E8',
    borderRadius: 24,
    padding: 24,
    ...shadows.md,
  },
  heroBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  heroBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
  heroBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  heroTitle: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 10,
    letterSpacing: -0.6,
  },
  heroBody: {
    fontSize: 16,
    lineHeight: 24,
    color: '#52525B',
  },
  heroMeta: {
    marginTop: 14,
    fontSize: 13,
    lineHeight: 19,
    color: '#687076',
  },
  adjustCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 24,
    ...shadows.sm,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
    letterSpacing: -0.4,
  },
  sectionBody: {
    fontSize: 14,
    lineHeight: 21,
    color: '#52525B',
  },
  adjustBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 18,
  },
  adjustBtn: {
    flexGrow: 1,
    minWidth: 96,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: colors.badgeBg,
    alignItems: 'center',
  },
  adjustBtnSelected: {
    backgroundColor: colors.primaryAction,
  },
  adjustBtnDisabled: {
    opacity: 0.6,
  },
  adjustBtnText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  adjustmentError: {
    marginTop: 14,
    fontSize: 13,
    color: '#B42318',
    fontWeight: '600',
  },
  editorCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 24,
    ...shadows.md,
  },
  editorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    marginBottom: 18,
  },
  planCountPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.badgeBg,
  },
  planCountPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  timeline: {
    position: 'relative',
    gap: 14,
  },
  timelineLine: {
    position: 'absolute',
    left: 10,
    top: 8,
    bottom: 8,
    width: 2,
    backgroundColor: colors.border,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  timelineDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primaryAction,
    marginTop: 10,
  },
  timelineContentBox: {
    flex: 1,
    backgroundColor: '#FBFBFC',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  planHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  timelineTimeInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    paddingVertical: 0,
  },
  deleteBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#FEE4E2',
  },
  deleteBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B42318',
  },
  timelineContentInput: {
    minHeight: 64,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textPrimary,
    textAlignVertical: 'top',
    paddingVertical: 0,
  },
  sideCard: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 20,
    ...shadows.sm,
  },
  sideCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
    letterSpacing: -0.4,
  },
  sideCardBody: {
    fontSize: 14,
    lineHeight: 21,
    color: '#52525B',
  },
  calendarPreviewText: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    color: '#166534',
    fontWeight: '600',
  },
  calendarHintText: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 18,
    color: '#475467',
  },
  quickSlotRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 16,
  },
  quickSlotChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.badgeBg,
  },
  quickSlotChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  addCustomBtn: {
    marginTop: 14,
    paddingVertical: 14,
    borderRadius: 18,
    alignItems: 'center',
    backgroundColor: '#EEF2E8',
  },
  addCustomBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  bottomBar: {
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 0 : 24,
    paddingTop: 16,
    backgroundColor: 'rgba(248,249,250,0.95)',
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
    gap: 10,
  },
  primaryButton: {
    backgroundColor: colors.primaryAction,
    paddingVertical: 18,
    borderRadius: 20,
    alignItems: 'center',
    ...shadows.sm,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: colors.primaryActionText,
    fontSize: 17,
    fontWeight: '700',
  },
  secondaryButton: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  tertiaryButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  tertiaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#7A271A',
  },
  emptyWrap: {
    flex: 1,
    paddingHorizontal: 24,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  emptyBody: {
    fontSize: 16,
    lineHeight: 24,
    color: '#52525B',
    textAlign: 'center',
    marginBottom: 24,
  },
});
