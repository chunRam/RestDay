import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Platform, StatusBar, ActivityIndicator, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, shadows } from '../theme/theme';
import { useGoogleCalendarAuth } from '../hooks/useGoogleCalendarAuth';
import { useAppStore } from '../store/useAppStore';

function getDateDiff(startDate: string) {
  const targetDate = new Date(`${startDate.slice(0, 10)}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 3600 * 24));
}

export default function HomeView() {
  const navigation = useNavigation<any>();
  const { promptAsync, loading, isReady, errorMessage, statusMessage, diagnosticMessage } = useGoogleCalendarAuth();
  const { currentHoliday, decisionAnswers, recommendation, plans, review, pastHolidays } = useAppStore();
  const hasHoliday = !!currentHoliday;
  const hasAnswers = !!decisionAnswers;
  const hasPlans = plans.length > 0;
  const isReviewed = !!review;

  // 가장 가까운 휴일 정보 포맷팅
  const daysDiff = currentHoliday ? getDateDiff(currentHoliday.startDate) : 0;
  const dDayText = daysDiff === 0 ? 'D-Day' : daysDiff > 0 ? `D-${daysDiff}` : `D+${Math.abs(daysDiff)}`;
  const isHolidayTodayOrPast = daysDiff <= 0;
  const hasPreparedPlan = hasPlans && !isReviewed && daysDiff > 0;
  const recommendationDirection = recommendation?.direction ?? '오늘의 계획';
  const recommendationReason = recommendation?.reason ?? '컨디션과 원하는 분위기에 맞춰 실행 가능한 계획을 준비했어요.';
  const donePlanCount = plans.filter((plan) => plan.isDone).length;
  const totalPlanCount = plans.length;
  const progressPercent = totalPlanCount > 0 ? Math.round((donePlanCount / totalPlanCount) * 100) : 0;

  const getNextAction = () => {
    if (!hasHoliday) {
      return {
        title: '준비할 휴일이 필요해요',
        description: '먼저 쉬는 날을 정하면, 그날에 맞춰 상태 체크와 계획 추천을 이어갈 수 있어요.',
        buttonText: '쉴 날 정하기',
        onPress: () => navigation.navigate('Register'),
      };
    }

    if (isReviewed) {
      return {
        title: '휴일 기록이 저장됐어요',
        description: '이제 다음에 준비할 휴일을 새로 정할 수 있어요.',
        buttonText: '다음 휴일 준비하기',
        onPress: () => navigation.navigate('Register'),
      };
    }

    if (!hasAnswers) {
      return {
        title: '상태 체크가 필요해요',
        description: '컨디션과 원하는 휴일 느낌을 정리하면 실행 가능한 계획 초안을 만들 수 있어요.',
        buttonText: '이번 휴일 상태 체크하기',
        onPress: () => navigation.navigate('Decision'),
      };
    }

    if (!hasPlans) {
      return {
        title: '상태 체크가 필요해요',
        description: '컨디션과 원하는 휴일 느낌을 정리하면 실행 가능한 계획 초안을 만들 수 있어요.',
        buttonText: '이번 휴일 상태 체크하기',
        onPress: () => navigation.navigate('Decision'),
      };
    }

    if (daysDiff === 0) {
      return {
        title: '오늘 계획을 체크할 시간이에요',
        description: '계획을 모두 끝내지 않아도 괜찮아요. 실행한 만큼 표시하고 회고로 마무리하세요.',
        buttonText: '오늘 계획 체크하기',
        onPress: () => navigation.navigate('Execution'),
      };
    }

    if (daysDiff < 0) {
      return {
        title: '지난 휴일을 마무리해요',
        description: `${Math.abs(daysDiff)}일 전 휴일이에요. 실행 체크와 회고를 남기고 마무리하세요.`,
        buttonText: '체크 및 회고하기',
        onPress: () => navigation.navigate('Execution'),
      };
    }

    return {
      title: daysDiff >= 3
        ? `${daysDiff}일 뒤, 준비된 하루가 기다리고 있어요`
        : '곧 다가올 휴일, 계획이 준비되어 있어요',
      description: `${recommendationDirection} · ${recommendationReason}`,
      buttonText: '계획 확인하기',
      onPress: () => navigation.navigate('PlanPreview'),
    };
  };

  const nextAction = getNextAction();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>RestDay</Text>
        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('Settings')}>
          <Text style={{ fontSize: 20 }}>⚙️</Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {loading ? (
          <View style={[styles.noPlanContainer, { justifyContent: 'center', flex: 1 }]}>
            <ActivityIndicator size="large" color={colors.primaryAction} />
            <Text style={[styles.textBody, { marginTop: 16 }]}>캘린더 동기화 중...</Text>
          </View>
        ) : !hasHoliday ? (
          <View style={styles.noPlanContainer}>
            <Text style={styles.emptyIcon}>🗓️</Text>
            <Text style={styles.titleLarge}>준비할 휴일 없음</Text>
            <Text style={styles.textBody}>
              쉬는 날을 먼저 정하면{'\n'}상태 체크와 계획 추천을 이어갈 수 있어요.
            </Text>
            {errorMessage && (
              <Text style={styles.errorText}>{errorMessage}</Text>
            )}
            {diagnosticMessage && (
              <Text style={styles.diagnosticText}>{diagnosticMessage}</Text>
            )}
            {!errorMessage && statusMessage && (
              <Text style={styles.infoText}>{statusMessage}</Text>
            )}
          </View>
        ) : (
          <ScrollView style={styles.readyContainer} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
            <View style={styles.hero}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{isReviewed ? '최근 휴일' : '준비 중인 휴일'}</Text>
              </View>
              <Text style={styles.dDayTitle}>{dDayText}</Text>
              <Text style={styles.holidayDate}>
                <Text style={styles.holidayDateBold}>{currentHoliday?.title || '쉬는 날'}</Text>
                {'  '}
                {currentHoliday?.startDate.slice(0, 10)}
              </Text>
            </View>

            <View style={styles.questionCard}>
              <Text style={styles.questionTitle}>{nextAction.title}</Text>
              {hasPreparedPlan ? (
                <View style={styles.recommendationBlock}>
                  <View style={styles.recommendationHeader}>
                    <Text style={styles.recommendationIcon}>💡</Text>
                    <Text style={styles.recommendationDirection}>{recommendationDirection}</Text>
                  </View>
                  <Text style={styles.recommendationReason}>{recommendationReason}</Text>
                </View>
              ) : (
                <Text style={styles.cardBody}>{nextAction.description}</Text>
              )}
            </View>

            {/* Plan Summary */}
            {hasPlans && !isReviewed && (
              <View style={styles.planSummary}>
                <View style={styles.planSummaryHeader}>
                  <Text style={styles.planSummaryTitle}>{recommendationDirection}</Text>
                  <Text style={styles.planProgressCount}>{donePlanCount}/{totalPlanCount} 완료</Text>
                </View>
                <View style={styles.planProgressRow}>
                  <View style={styles.planProgressTrack}>
                    <View style={[styles.planProgressFill, { width: `${progressPercent}%` }]} />
                  </View>
                  <Text style={styles.planProgressPercent}>{progressPercent}%</Text>
                </View>
                {plans.map((plan) => (
                  <View key={plan.id} style={styles.planSummaryItem}>
                    <View style={[styles.planDot, plan.isDone && styles.planDotDone]} />
                    <Text style={styles.planTimeSlot}>{plan.timeSlot}</Text>
                    <Text style={[styles.planText, plan.isDone && styles.planTextDone]} numberOfLines={1}>
                      {plan.text}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Past Holiday Count */}
            {pastHolidays && pastHolidays.length > 0 && (
              <View style={styles.pastBadge}>
                <Text style={styles.pastBadgeText}>지금까지 {pastHolidays.length}번의 휴일을 기록했어요</Text>
              </View>
            )}
          </ScrollView>
        )}
      </View>

      {/* Bottom Bar */}
      <View style={styles.bottomBar}>
        {!hasHoliday && (
          <TouchableOpacity 
            style={[styles.btnSecondary, (!isReady || loading) && { opacity: 0.7 }]} 
            activeOpacity={0.8}
            onPress={() => promptAsync()}
            disabled={!isReady || loading}
          >
            <Text style={styles.btnSecondaryText}>
              {loading ? '캘린더 동기화 중...' : 'Google 캘린더 동기화'}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity 
          style={styles.btnPrimary} 
          activeOpacity={0.8}
          onPress={nextAction.onPress}
        >
          <Text style={styles.btnPrimaryText}>{nextAction.buttonText}</Text>
        </TouchableOpacity>

        {hasPreparedPlan && (
          <TouchableOpacity
            style={styles.btnAdjustSecondary}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('Decision')}
          >
            <Text style={styles.btnAdjustSecondaryText}>답변 다시 조정하기</Text>
          </TouchableOpacity>
        )}
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
  iconBtn: {
    padding: 8,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 10,
  },
  noPlanContainer: {
    alignItems: 'center',
    marginTop: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
    opacity: 0.5,
  },
  titleLarge: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  textBody: {
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 24,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  cardBody: {
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 24,
    letterSpacing: -0.2,
  },
  errorText: {
    color: '#B42318',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    marginTop: 16,
    textAlign: 'center',
  },
  infoText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    marginTop: 16,
    textAlign: 'center',
  },
  diagnosticText: {
    color: '#7A271A',
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 18,
    marginTop: 8,
    textAlign: 'center',
  },
  readyContainer: {
    flex: 1,
  },
  hero: {
    marginTop: 20,
    marginBottom: 40,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 20,
    ...shadows.sm,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.02)',
  },
  badgeText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  dDayTitle: {
    fontSize: 80,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -3,
    marginBottom: 12,
    lineHeight: 80,
  },
  holidayDate: {
    fontSize: 18,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  holidayDateBold: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  questionCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    paddingVertical: 28,
    paddingHorizontal: 24,
    marginBottom: 20,
    ...shadows.md,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.03)',
  },
  questionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  recommendationBlock: {
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  recommendationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  recommendationIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  recommendationDirection: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  recommendationReason: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textSecondary,
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  bottomBar: {
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 0 : 24,
    paddingTop: 16,
    backgroundColor: colors.background,
  },
  btnPrimary: {
    backgroundColor: colors.primaryAction,
    paddingVertical: 18,
    borderRadius: 20,
    alignItems: 'center',
    ...shadows.sm,
  },
  btnSecondary: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    marginBottom: 12,
    ...shadows.sm,
  },
  btnPrimaryText: {
    color: colors.primaryActionText,
    fontSize: 17,
    fontWeight: '600',
  },
  btnSecondaryText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  btnAdjustSecondary: {
    backgroundColor: colors.badgeBg,
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center',
    marginTop: 12,
  },
  btnAdjustSecondaryText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  planSummary: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 16,
    ...shadows.sm,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.03)',
  },
  planSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  planSummaryTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    marginRight: 12,
  },
  planProgressCount: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  planProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  planProgressTrack: {
    flex: 1,
    height: 8,
    backgroundColor: colors.border,
    borderRadius: 999,
    overflow: 'hidden',
    marginRight: 10,
  },
  planProgressFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 999,
  },
  planProgressPercent: {
    width: 36,
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textAlign: 'right',
  },
  planSummaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  planDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primaryAction,
    marginRight: 10,
  },
  planDotDone: {
    backgroundColor: colors.accent,
  },
  planTimeSlot: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    width: 36,
    marginRight: 8,
  },
  planText: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textPrimary,
    flex: 1,
  },
  planTextDone: {
    color: colors.textSecondary,
    textDecorationLine: 'line-through',
  },
  pastBadge: {
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 8,
  },
  pastBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});
