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
import { useNavigation } from '@react-navigation/native';
import { useAppStore } from '../store/useAppStore';
import { colors, shadows } from '../theme/theme';

const ARCHIVE_LABELS = {
  reviewed: '회고 완료',
  skipped: '건너뜀',
  expired: '자동 보관',
  replaced: '이전 기록',
} as const;

export default function HistoryView() {
  const navigation = useNavigation<any>();
  const { pastHolidays } = useAppStore();
  const history = useMemo(
    () => [...pastHolidays].sort((a, b) => b.archivedAt - a.archivedAt),
    [pastHolidays]
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>기록 히스토리</Text>
        <View style={{ width: 44 }} />
      </View>

      {history.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🗂️</Text>
          <Text style={styles.emptyTitle}>아직 저장된 휴일 기록이 없어요</Text>
          <Text style={styles.emptyBody}>회고를 남기거나 건너뛴 휴일이 여기 모입니다.</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentInner}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>지금까지 {history.length}번의 휴일을 기록했어요</Text>
            <Text style={styles.summaryBody}>휴일마다 남긴 계획, 만족도, 메모를 다시 확인할 수 있어요.</Text>
          </View>

          {history.map((record) => {
            const doneCount = record.plans.filter((plan) => plan.isDone).length;
            return (
              <TouchableOpacity
                key={record.recordId}
                style={styles.recordCard}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('HistoryDetail', { recordId: record.recordId })}
              >
                <View style={styles.recordHeader}>
                  <View style={styles.recordMeta}>
                    <Text style={styles.recordTitle}>{record.holiday.title}</Text>
                    <Text style={styles.recordDate}>{record.holiday.startDate.slice(0, 10)}</Text>
                  </View>
                  <View style={styles.recordBadge}>
                    <Text style={styles.recordBadgeText}>{ARCHIVE_LABELS[record.archiveReason]}</Text>
                  </View>
                </View>

                <Text style={styles.recordBody} numberOfLines={2}>
                  {record.review?.memo?.trim() || '회고 메모가 없어요. 상세 화면에서 추가할 수 있어요.'}
                </Text>

                <View style={styles.recordFooter}>
                  <Text style={styles.recordFooterText}>
                    {record.review ? `만족도 ${record.review.rating}/5` : '만족도 미기록'}
                  </Text>
                  <Text style={styles.recordFooterText}>
                    {record.plans.length > 0 ? `체크 ${doneCount}/${record.plans.length}` : '계획 없음'}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
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
    gap: 14,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 22,
    ...shadows.md,
  },
  summaryTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
    letterSpacing: -0.4,
  },
  summaryBody: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
  },
  recordCard: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 20,
    ...shadows.sm,
  },
  recordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  recordMeta: {
    flex: 1,
  },
  recordTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  recordDate: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  recordBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.badgeBg,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  recordBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  recordBody: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textPrimary,
    marginBottom: 16,
  },
  recordFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  recordFooterText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
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
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
