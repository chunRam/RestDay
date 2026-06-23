import React, { useEffect, useMemo } from 'react';
import {
  Alert,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, shadows } from '../theme/theme';
import { useAppStore } from '../store/useAppStore';
import { useGoogleCalendarAuth } from '../hooks/useGoogleCalendarAuth';
import { getHolidayDayDiff } from '../utils/holidayDates';
import { buildAgendaItems, buildHomeCommandState, type AgendaItem } from '../utils/homeDashboard';

function formatHolidayDate(startDate: string) {
  return startDate.slice(0, 10).replace(/-/g, '.');
}

function getDDayText(startDate: string) {
  const daysDiff = getHolidayDayDiff(startDate);
  if (daysDiff === 0) return 'D-Day';
  return daysDiff > 0 ? `D-${daysDiff}` : `D+${Math.abs(daysDiff)}`;
}

function formatAgendaDate(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return dateKey;
  }

  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function formatAgendaTime(item: Pick<AgendaItem, 'start' | 'isAllDay'>) {
  if (item.isAllDay || !item.start) {
    return '종일';
  }

  const date = new Date(item.start);
  if (Number.isNaN(date.getTime())) {
    return '시간 미정';
  }

  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function getSourceLabel(item: AgendaItem) {
  if (item.source === 'google') return 'Google';
  if (item.source === 'weekend') return '자동 제안';
  if (item.source === 'calendar') return '캘린더';
  return '직접 작성';
}

function getKindLabel(item: AgendaItem) {
  return item.kind === 'holiday' ? '휴일' : '일정';
}

function showAlert(title: string, message: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}\n\n${message}`);
    return;
  }

  Alert.alert(title, message);
}

function confirmDelete(title: string, message: string, onConfirm: () => void) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    if (window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
    return;
  }

  Alert.alert(title, message, [
    { text: '취소', style: 'cancel' },
    { text: '삭제', style: 'destructive', onPress: onConfirm },
  ]);
}

export default function HomeView() {
  const navigation = useNavigation<any>();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1100;
  const {
    currentHoliday,
    calendarContext,
    manualEntries,
    decisionAnswers,
    planGenerationError,
    plans,
    isPlanConfirmed,
    pastHolidays,
    reviewDeferredUntil,
    runHolidayLifecycle,
    retryPlanGeneration,
    togglePlanCheck,
    deleteManualEntry,
    setCurrentHolidayFromEntry,
  } = useAppStore();
  const {
    promptAsync: syncCalendar,
    loading: isCalendarLoading,
    isReady: isCalendarReady,
    isCalendarConnected,
    statusMessage: calendarStatusMessage,
    errorMessage: calendarErrorMessage,
  } = useGoogleCalendarAuth();

  useEffect(() => {
    runHolidayLifecycle();
  }, [runHolidayLifecycle]);

  const command = useMemo(
    () =>
      buildHomeCommandState({
        currentHoliday,
        decisionAnswers,
        planGenerationError,
        plans,
        isPlanConfirmed,
        reviewDeferredUntil,
      }),
    [currentHoliday, decisionAnswers, planGenerationError, plans, isPlanConfirmed, reviewDeferredUntil]
  );

  const agendaItems = useMemo(
    () => buildAgendaItems({ calendarContext, currentHoliday, manualEntries }),
    [calendarContext, currentHoliday, manualEntries]
  );

  const topPlans = plans.slice(0, 3);
  const doneCount = plans.filter((plan) => plan.isDone).length;
  const progressPercent = plans.length > 0 ? Math.round((doneCount / plans.length) * 100) : 0;
  const hasPlans = plans.length > 0;
  const nextHolidayText = currentHoliday ? getDDayText(currentHoliday.startDate) : '대기 중';
  const currentHolidaySubtitle = currentHoliday
    ? `${formatHolidayDate(currentHoliday.startDate)} · ${currentHoliday.title}`
    : '아직 준비 중인 휴일이 없습니다.';
  const calendarButtonDisabled = (!isCalendarConnected && !isCalendarReady) || isCalendarLoading;
  const planControlAction = !currentHoliday
    ? { label: '휴일 정하러 가기', route: 'Register', params: { initialKind: 'holiday', selectAsCurrentHoliday: true } }
    : hasPlans
      ? { label: '전체 체크 화면 열기', route: 'Execution', params: undefined }
      : { label: '상태 체크로 이동', route: 'Decision', params: undefined };

  const handlePrimaryAction = async () => {
    if (command.key === 'register') {
      navigation.navigate('Register', {
        initialKind: 'holiday',
        selectAsCurrentHoliday: true,
      });
      return;
    }

    if (command.key === 'decision') {
      navigation.navigate('Decision');
      return;
    }

    if (command.key === 'plan-preview') {
      navigation.navigate('PlanPreview');
      return;
    }

    if (command.key === 'execution') {
      navigation.navigate('Execution');
      return;
    }

    if (command.key === 'review') {
      navigation.navigate(hasPlans ? 'Execution' : 'Review');
      return;
    }

    try {
      const nextRecommendation = await retryPlanGeneration();
      if (!nextRecommendation) {
        showAlert('다시 만들 수 없어요', '상태 체크 답변이 없어서 계획을 다시 만들 수 없습니다.');
        return;
      }

      navigation.navigate('PlanPreview');
    } catch (error) {
      console.warn('Failed to retry plan generation:', error);
      showAlert('계획을 다시 만들지 못했어요', '잠시 후 다시 시도해주세요.');
    }
  };

  const handleDeleteEntry = (entryId: string, title: string) => {
    confirmDelete('이 항목을 삭제할까요?', `"${title}" 항목을 홈 피드에서 제거합니다.`, () => {
      deleteManualEntry(entryId);
    });
  };

  const renderAgendaCard = (item: AgendaItem, index: number) => {
    const previousDateKey = index > 0 ? agendaItems[index - 1].dateKey : null;
    const showDateHeader = previousDateKey !== item.dateKey;
    const isManual = item.source === 'manual';
    const canSelectAsCurrentHoliday = item.kind === 'holiday' && !item.isCurrentHoliday && isManual;

    return (
      <View key={item.id}>
        {showDateHeader ? <Text style={styles.dateHeader}>{formatAgendaDate(item.dateKey)}</Text> : null}
        <View style={[styles.feedCard, item.kind === 'holiday' && styles.feedCardHoliday]}>
          <View style={styles.feedCardTop}>
            <View style={styles.feedBadges}>
              <View style={styles.feedBadge}>
                <Text style={styles.feedBadgeText}>{getKindLabel(item)}</Text>
              </View>
              <View style={styles.feedBadge}>
                <Text style={styles.feedBadgeText}>{getSourceLabel(item)}</Text>
              </View>
              {item.isCurrentHoliday ? (
                <View style={[styles.feedBadge, styles.feedBadgeStrong]}>
                  <Text style={styles.feedBadgeStrongText}>현재 준비 중</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.feedTimeText}>{formatAgendaTime(item)}</Text>
          </View>

          <Text style={styles.feedTitle}>{item.title}</Text>
          <Text style={styles.feedBody}>
            {item.kind === 'holiday'
              ? item.note?.trim() || '이번 휴일 준비 대상으로 둘 수 있습니다.'
              : item.note?.trim() || item.calendarSummary || '휴일 전후에 고려할 일정입니다.'}
          </Text>

          {isManual ? (
            <View style={styles.feedActions}>
              {canSelectAsCurrentHoliday ? (
                <TouchableOpacity
                  style={styles.feedActionPill}
                  activeOpacity={0.8}
                  onPress={() => setCurrentHolidayFromEntry(item.id)}
                >
                  <Text style={styles.feedActionPillText}>이 휴일 준비</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={styles.feedActionPill}
                activeOpacity={0.8}
                onPress={() =>
                  navigation.navigate('Register', {
                    editingEntryId: item.id,
                    initialKind: item.kind,
                    selectAsCurrentHoliday: item.isCurrentHoliday,
                  })
                }
              >
                <Text style={styles.feedActionPillText}>수정</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.feedActionPill}
                activeOpacity={0.8}
                onPress={() => handleDeleteEntry(item.id, item.title)}
              >
                <Text style={styles.feedActionPillText}>삭제</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      <View style={styles.header}>
        <Text style={styles.logo}>RestDay</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerButton} onPress={() => navigation.navigate('History')}>
            <Text style={styles.headerButtonText}>기록</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton} onPress={() => navigation.navigate('Settings')}>
            <Text style={styles.headerButtonText}>설정</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentInner}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroLabelWrap}>
              <Text style={styles.heroLabel}>Calm Command</Text>
              <Text style={styles.heroMeta}>{currentHolidaySubtitle}</Text>
            </View>
            <View style={styles.heroDDayPill}>
              <Text style={styles.heroDDayText}>{currentHoliday ? nextHolidayText : '휴일 없음'}</Text>
            </View>
          </View>

          <Text style={styles.heroTitle}>{command.title}</Text>
          <Text style={styles.heroBody}>{command.description}</Text>

          <View style={styles.heroSummaryRow}>
            <View style={styles.heroSummaryCard}>
              <Text style={styles.heroSummaryLabel}>준비할 휴일</Text>
              <Text style={styles.heroSummaryValue}>{currentHoliday ? currentHoliday.title : '먼저 정하기'}</Text>
            </View>
            <View style={styles.heroSummaryCard}>
              <Text style={styles.heroSummaryLabel}>남은 시간</Text>
              <Text style={styles.heroSummaryValue}>{currentHoliday ? nextHolidayText : '대기 중'}</Text>
            </View>
            <View style={styles.heroSummaryCard}>
              <Text style={styles.heroSummaryLabel}>다음 행동</Text>
              <Text style={styles.heroSummaryValue}>{command.buttonText}</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.heroPrimaryButton} activeOpacity={0.85} onPress={handlePrimaryAction}>
            <Text style={styles.heroPrimaryButtonText}>{command.buttonText}</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.dashboardGrid, isDesktop && styles.dashboardGridDesktop]}>
          <View style={[styles.sectionCard, isDesktop && styles.feedColumn]}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionEyebrow}>Schedule and Holiday Feed</Text>
                <Text style={styles.sectionTitle}>다가오는 14일 일정과 휴일</Text>
              </View>
              <View style={styles.sectionActions}>
                <TouchableOpacity
                  style={[styles.actionChip, calendarButtonDisabled && styles.actionChipDisabled]}
                  activeOpacity={0.8}
                  onPress={() => syncCalendar()}
                  disabled={calendarButtonDisabled}
                >
                  <Text style={styles.actionChipText}>
                    {isCalendarLoading ? '불러오는 중...' : isCalendarConnected ? '다시 동기화' : '일정 불러오기'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionChip}
                  activeOpacity={0.8}
                  onPress={() => navigation.navigate('Register', { initialKind: 'schedule' })}
                >
                  <Text style={styles.actionChipText}>일정 추가</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionChip}
                  activeOpacity={0.8}
                  onPress={() =>
                    navigation.navigate('Register', {
                      initialKind: 'holiday',
                      selectAsCurrentHoliday: true,
                    })
                  }
                >
                  <Text style={styles.actionChipText}>휴일 추가</Text>
                </TouchableOpacity>
              </View>
            </View>

            {calendarStatusMessage ? <Text style={styles.sectionMessage}>{calendarStatusMessage}</Text> : null}
            {calendarErrorMessage ? <Text style={styles.sectionError}>{calendarErrorMessage}</Text> : null}

            {agendaItems.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>아직 확인할 일정이 없어요</Text>
                <Text style={styles.emptyBody}>
                  휴일이나 일정을 직접 추가하거나 Google Calendar 일정을 불러오면 홈 피드가 채워집니다.
                </Text>
              </View>
            ) : (
              agendaItems.map(renderAgendaCard)
            )}
          </View>

          <View style={[styles.sectionCard, isDesktop && styles.planColumn]}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionEyebrow}>Plan Control</Text>
                <Text style={styles.sectionTitle}>다가오는 휴일 계획 관리</Text>
              </View>
              {decisionAnswers && hasPlans ? (
                <TouchableOpacity
                  style={styles.actionChip}
                  activeOpacity={0.8}
                  onPress={() => navigation.navigate('PlanPreview')}
                >
                  <Text style={styles.actionChipText}>{isPlanConfirmed ? '계획 수정' : '계획 확인'}</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={styles.planSummaryCard}>
              <View style={styles.planSummaryRow}>
                <View style={styles.planSummaryMetric}>
                  <Text style={styles.planSummaryLabel}>상태</Text>
                  <Text style={styles.planSummaryValue}>
                    {!currentHoliday
                      ? '휴일 대기'
                      : !decisionAnswers
                        ? '질문 전'
                        : !hasPlans
                          ? '초안 생성 전'
                          : isPlanConfirmed
                            ? '확정 완료'
                            : '초안 확인 필요'}
                  </Text>
                </View>
                <View style={styles.planSummaryMetric}>
                  <Text style={styles.planSummaryLabel}>진행률</Text>
                  <Text style={styles.planSummaryValue}>{hasPlans ? `${progressPercent}%` : '0%'}</Text>
                </View>
              </View>
              <Text style={styles.planSummaryBody}>
                {!currentHoliday
                  ? '휴일을 먼저 정하면 계획 생성과 체크 흐름이 시작됩니다.'
                  : hasPlans
                    ? `${doneCount}/${plans.length}개 체크됨. 홈에서는 빠른 체크만 하고, 수정은 계획 화면에서 이어가세요.`
                    : '계획이 아직 없어요. 상태 체크를 마치면 홈에서 바로 관리할 수 있습니다.'}
              </Text>
            </View>

            {topPlans.length > 0 ? (
              topPlans.map((plan) => (
                <TouchableOpacity
                  key={plan.id}
                  style={[styles.planItemCard, plan.isDone && styles.planItemCardDone]}
                  activeOpacity={0.8}
                  onPress={() => togglePlanCheck(plan.id)}
                >
                  <View style={[styles.planCheck, plan.isDone && styles.planCheckDone]}>
                    {plan.isDone ? <Text style={styles.planCheckMark}>✓</Text> : null}
                  </View>
                  <View style={styles.planItemContent}>
                    <Text style={styles.planItemSlot}>{plan.timeSlot}</Text>
                    <Text style={[styles.planItemText, plan.isDone && styles.planItemTextDone]}>
                      {plan.text}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            ) : (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>아직 체크할 계획이 없어요</Text>
                <Text style={styles.emptyBody}>
                  홈 hero의 다음 행동을 따라가면 이 영역에 휴일 계획 요약과 빠른 체크가 나타납니다.
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.secondaryButton}
              activeOpacity={0.8}
              onPress={() => navigation.navigate(planControlAction.route, planControlAction.params)}
            >
              <Text style={styles.secondaryButtonText}>{planControlAction.label}</Text>
            </TouchableOpacity>

            <View style={styles.historyCard}>
              <Text style={styles.historyLabel}>기록</Text>
              <Text style={styles.historyValue}>{pastHolidays.length}개의 휴일 기록</Text>
              <Text style={styles.historyBody}>
                지난 휴일 계획과 회고는 홈의 보조 정보로 남기고, 상세 확인은 기록 화면에서 이어갑니다.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 20 : 0,
    paddingBottom: 12,
  },
  logo: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 10,
  },
  headerButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.surface,
  },
  headerButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  content: {
    flex: 1,
  },
  contentInner: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 28,
    gap: 18,
  },
  heroCard: {
    backgroundColor: '#EEF2E8',
    borderRadius: 30,
    padding: 24,
    ...shadows.md,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 18,
  },
  heroLabelWrap: {
    flex: 1,
    gap: 6,
  },
  heroLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#5B6252',
  },
  heroMeta: {
    fontSize: 14,
    lineHeight: 20,
    color: '#52525B',
  },
  heroDDayPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
  heroDDayText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  heroTitle: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.8,
    marginBottom: 10,
  },
  heroBody: {
    fontSize: 15,
    lineHeight: 22,
    color: '#52525B',
    marginBottom: 18,
  },
  heroSummaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 18,
  },
  heroSummaryCard: {
    flexGrow: 1,
    minWidth: 96,
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderRadius: 20,
    padding: 16,
  },
  heroSummaryLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#687076',
    marginBottom: 6,
  },
  heroSummaryValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  heroPrimaryButton: {
    backgroundColor: colors.primaryAction,
    borderRadius: 20,
    paddingVertical: 18,
    alignItems: 'center',
    ...shadows.sm,
  },
  heroPrimaryButtonText: {
    color: colors.primaryActionText,
    fontSize: 17,
    fontWeight: '700',
  },
  dashboardGrid: {
    gap: 18,
  },
  dashboardGridDesktop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  feedColumn: {
    flex: 1.2,
  },
  planColumn: {
    flex: 0.9,
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: 26,
    padding: 20,
    ...shadows.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  sectionEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    color: '#687076',
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.4,
  },
  sectionActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 8,
  },
  actionChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.badgeBg,
  },
  actionChipDisabled: {
    opacity: 0.45,
  },
  actionChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  sectionMessage: {
    fontSize: 13,
    lineHeight: 19,
    color: '#4B5563',
    marginBottom: 12,
  },
  sectionError: {
    fontSize: 13,
    lineHeight: 19,
    color: '#B42318',
    marginBottom: 12,
  },
  dateHeader: {
    marginTop: 8,
    marginBottom: 10,
    fontSize: 13,
    fontWeight: '700',
    color: '#687076',
  },
  feedCard: {
    borderRadius: 22,
    padding: 18,
    backgroundColor: '#F8F9FA',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.03)',
  },
  feedCardHoliday: {
    backgroundColor: '#F4F5EE',
  },
  feedCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  feedBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    flex: 1,
  },
  feedBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
  },
  feedBadgeStrong: {
    backgroundColor: colors.primaryAction,
  },
  feedBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4B5563',
  },
  feedBadgeStrongText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primaryActionText,
  },
  feedTimeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#687076',
  },
  feedTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  feedBody: {
    fontSize: 14,
    lineHeight: 21,
    color: '#52525B',
  },
  feedActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  feedActionPill: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
  },
  feedActionPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  planSummaryCard: {
    padding: 18,
    borderRadius: 22,
    backgroundColor: '#F4F5EE',
    marginBottom: 14,
  },
  planSummaryRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 10,
  },
  planSummaryMetric: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderRadius: 18,
    padding: 14,
  },
  planSummaryLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#687076',
    marginBottom: 6,
  },
  planSummaryValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  planSummaryBody: {
    fontSize: 14,
    lineHeight: 21,
    color: '#52525B',
  },
  planItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 20,
    padding: 16,
    marginBottom: 10,
  },
  planItemCardDone: {
    opacity: 0.6,
  },
  planCheck: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  planCheckDone: {
    borderColor: colors.primaryAction,
    backgroundColor: colors.primaryAction,
  },
  planCheckMark: {
    color: colors.primaryActionText,
    fontWeight: '700',
  },
  planItemContent: {
    flex: 1,
  },
  planItemSlot: {
    fontSize: 12,
    fontWeight: '700',
    color: '#687076',
    marginBottom: 4,
  },
  planItemText: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  planItemTextDone: {
    textDecorationLine: 'line-through',
    color: '#687076',
  },
  secondaryButton: {
    marginTop: 6,
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center',
    backgroundColor: colors.badgeBg,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  historyCard: {
    marginTop: 16,
    padding: 18,
    borderRadius: 22,
    backgroundColor: '#F8F9FA',
  },
  historyLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#687076',
    marginBottom: 8,
  },
  historyValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  historyBody: {
    fontSize: 14,
    lineHeight: 21,
    color: '#52525B',
  },
  emptyCard: {
    borderRadius: 22,
    padding: 20,
    backgroundColor: '#F8F9FA',
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  emptyBody: {
    fontSize: 14,
    lineHeight: 21,
    color: '#52525B',
  },
});
