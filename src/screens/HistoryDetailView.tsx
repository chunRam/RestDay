import React, { useMemo } from 'react';
import {
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAppStore } from '../store/useAppStore';
import { colors, shadows } from '../theme/theme';
import {
  getRecommendationSourceDescription,
  getRecommendationSourceLabel,
} from '../utils/planGenerator';

type HistoryDetailRouteParams = {
  recordId?: string;
};

const ARCHIVE_LABELS = {
  reviewed: '회고를 마친 휴일',
  skipped: '건너뛴 휴일',
  expired: '자동 보관된 휴일',
  replaced: '다음 휴일 준비 전 보관된 기록',
} as const;

export default function HistoryDetailView() {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const { recordId } = (route.params as HistoryDetailRouteParams | undefined) ?? {};
  const { pastHolidays } = useAppStore();
  const record = useMemo(
    () => pastHolidays.find((item) => item.recordId === recordId) ?? null,
    [pastHolidays, recordId]
  );

  if (!record) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backBtnText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>기록 상세</Text>
          <View style={{ width: 44 }} />
        </View>

        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🕳️</Text>
          <Text style={styles.emptyTitle}>기록을 찾지 못했어요</Text>
          <TouchableOpacity style={styles.emptyButton} onPress={() => navigation.navigate('History')}>
            <Text style={styles.emptyButtonText}>히스토리로 돌아가기</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const doneCount = record.plans.filter((plan) => plan.isDone).length;
  const recommendationSourceLabel = record.recommendation
    ? getRecommendationSourceLabel(record.recommendation.source)
    : null;
  const recommendationSourceDescription = getRecommendationSourceDescription(record.recommendation);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>기록 상세</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentInner}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>{ARCHIVE_LABELS[record.archiveReason]}</Text>
          <Text style={styles.heroTitle}>{record.holiday.title}</Text>
          <Text style={styles.heroDate}>{record.holiday.startDate.slice(0, 10)}</Text>
          {recommendationSourceLabel ? (
            <View style={styles.sourceBadge}>
              <Text style={styles.sourceBadgeText}>{recommendationSourceLabel}</Text>
            </View>
          ) : null}
          <Text style={styles.heroBody}>
            {record.recommendation?.direction ?? '추천 방향 없이 지나간 휴일이에요.'}
          </Text>
          {recommendationSourceDescription ? (
            <Text style={styles.heroMeta}>{recommendationSourceDescription}</Text>
          ) : null}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>회고</Text>
          {record.review ? (
            <>
              <Text style={styles.ratingText}>만족도 {record.review.rating}/5</Text>
              <Text style={styles.memoText}>
                {record.review.memo.trim().length > 0 ? record.review.memo : '메모는 비어 있어요.'}
              </Text>
            </>
          ) : (
            <Text style={styles.placeholderText}>아직 회고가 없어요. 필요하면 지금 추가할 수 있어요.</Text>
          )}

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => navigation.navigate('Review', { recordId: record.recordId })}
          >
            <Text style={styles.secondaryButtonText}>
              {record.review ? '회고 수정하기' : '회고 남기기'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>실행 기록</Text>
          <Text style={styles.metaText}>
            {record.plans.length > 0
              ? `${doneCount}/${record.plans.length}개 체크 완료`
              : '저장된 계획이 없어요'}
          </Text>

          {record.plans.length > 0 ? (
            <View style={styles.planList}>
              {record.plans.map((plan) => (
                <View key={plan.id} style={styles.planItem}>
                  <View style={[styles.planDot, plan.isDone && styles.planDotDone]} />
                  <View style={styles.planTextWrap}>
                    <Text style={styles.planTime}>{plan.timeSlot}</Text>
                    <Text style={[styles.planText, plan.isDone && styles.planTextDone]}>{plan.text}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : null}
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 20 : 0,
    paddingBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  backBtn: {
    padding: 8,
    marginLeft: -8,
  },
  backBtnText: {
    fontSize: 24,
    color: colors.textPrimary,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  content: {
    flex: 1,
  },
  contentInner: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 32,
    gap: 16,
  },
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 24,
    ...shadows.md,
  },
  heroLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 10,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  heroDate: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 14,
  },
  sourceBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.badgeBg,
    marginBottom: 12,
  },
  sourceBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  heroBody: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  heroMeta: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 22,
    ...shadows.sm,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 12,
  },
  ratingText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  memoText: {
    fontSize: 15,
    lineHeight: 24,
    color: colors.textPrimary,
    marginBottom: 18,
  },
  placeholderText: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
    marginBottom: 18,
  },
  secondaryButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.badgeBg,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  metaText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 16,
  },
  planList: {
    gap: 14,
  },
  planItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  planDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginTop: 4,
    borderWidth: 2,
    borderColor: colors.border,
  },
  planDotDone: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  planTextWrap: {
    flex: 1,
  },
  planTime: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 4,
  },
  planText: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  planTextDone: {
    color: colors.textSecondary,
    textDecorationLine: 'line-through',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 16,
  },
  emptyButton: {
    backgroundColor: colors.primaryAction,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 18,
  },
  emptyButtonText: {
    color: colors.primaryActionText,
    fontSize: 16,
    fontWeight: '700',
  },
});
