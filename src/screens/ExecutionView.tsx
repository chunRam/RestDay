import React from 'react';
import {
  Alert,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, shadows } from '../theme/theme';
import { useAppStore } from '../store/useAppStore';

export default function ExecutionView() {
  const navigation = useNavigation<any>();
  const { plans, togglePlanCheck, reviewDraft } = useAppStore();

  const doneCount = plans.filter((plan) => plan.isDone).length;
  const progressPercent = plans.length > 0 ? (doneCount / plans.length) * 100 : 0;

  const handleFinish = () => {
    Alert.alert(
      '회고로 넘어갈까요?',
      '실행한 만큼만 체크한 뒤, 독립 화면에서 차분히 회고를 남길 수 있어요.',
      [
        { text: '취소', style: 'cancel' },
        { text: '회고 쓰기', onPress: () => navigation.navigate('Review') },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={{ width: 44 }} />
        <Text style={styles.headerTitle}>오늘의 휴일</Text>
        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.popToTop()}>
          <Text style={styles.homeIcon}>🏠</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {plans.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.titleLarge}>확정된 계획이 없어요</Text>
            <Text style={styles.emptyBody}>
              계획이 없어도 회고는 남길 수 있어요. 홈에서 바로 회고 화면으로 이동해 기록을 남겨보세요.
            </Text>
            <TouchableOpacity style={styles.emptyButton} onPress={() => navigation.navigate('Review')}>
              <Text style={styles.emptyButtonText}>회고만 남기기</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.titleLarge}>오늘 계획을{'\n'}실행한 만큼 체크하세요.</Text>

            <View style={styles.progressContainer}>
              <View style={styles.progressHeader}>
                <Text style={styles.progressLabel}>진행률</Text>
                <Text style={styles.progressValue}>{doneCount}/{plans.length}</Text>
              </View>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
              </View>
            </View>

            {reviewDraft && (reviewDraft.rating > 0 || reviewDraft.memo.trim().length > 0) ? (
              <View style={styles.draftNotice}>
                <Text style={styles.draftNoticeTitle}>작성 중인 회고가 있어요</Text>
                <Text style={styles.draftNoticeBody}>이전에 쓰던 내용을 이어서 마무리할 수 있어요.</Text>
              </View>
            ) : null}

            <ScrollView style={styles.checklist} showsVerticalScrollIndicator={false}>
              {plans.map((item) => {
                const isDone = item.isDone;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.checkItem, isDone && styles.checkItemDone]}
                    activeOpacity={0.7}
                    onPress={() => togglePlanCheck(item.id)}
                  >
                    <View style={[styles.checkCircle, isDone && styles.checkCircleDone]}>
                      {isDone ? <Text style={styles.checkMark}>✓</Text> : null}
                    </View>
                    <View style={styles.checkTextBlock}>
                      <Text style={[styles.checkTimeSlot, isDone && styles.checkTimeSlotDone]}>
                        {item.timeSlot}
                      </Text>
                      <Text style={[styles.checkText, isDone && styles.checkTextDone]}>{item.text}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        )}
      </View>

      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.btnPrimary, plans.length === 0 && styles.btnPrimaryMuted]}
          onPress={handleFinish}
        >
          <Text style={styles.btnPrimaryText}>
            {reviewDraft && (reviewDraft.rating > 0 || reviewDraft.memo.trim().length > 0)
              ? '작성 중인 회고 이어쓰기'
              : '회고로 마무리하기'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
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
  iconBtn: { padding: 8, marginRight: -8 },
  homeIcon: { fontSize: 20 },
  headerTitle: { fontSize: 17, fontWeight: '600', color: colors.textPrimary },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 20 },
  titleLarge: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 24,
    letterSpacing: -0.5,
  },
  progressContainer: { marginBottom: 24 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressLabel: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  progressValue: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  progressBarBg: { height: 12, backgroundColor: colors.border, borderRadius: 6, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: colors.accent, borderRadius: 6 },
  draftNotice: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    ...shadows.sm,
  },
  draftNoticeTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  draftNoticeBody: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  checklist: { gap: 14 },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    backgroundColor: colors.surface,
    borderRadius: 20,
    ...shadows.sm,
  },
  checkItemDone: { opacity: 0.6 },
  checkCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.border,
    marginRight: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleDone: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkMark: { color: '#FFFFFF', fontWeight: 'bold' },
  checkTextBlock: { flex: 1 },
  checkTimeSlot: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 4,
  },
  checkTimeSlotDone: {
    color: colors.textSecondary,
  },
  checkText: { fontSize: 17, fontWeight: '500', color: colors.textPrimary },
  checkTextDone: { color: colors.textSecondary, textDecorationLine: 'line-through' },
  bottomBar: {
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 0 : 24,
    paddingTop: 16,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
  },
  btnPrimary: {
    backgroundColor: colors.primaryAction,
    paddingVertical: 18,
    borderRadius: 20,
    alignItems: 'center',
    ...shadows.sm,
  },
  btnPrimaryMuted: {
    backgroundColor: '#3A3A3C',
  },
  btnPrimaryText: { color: colors.primaryActionText, fontSize: 17, fontWeight: '600' },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
    opacity: 0.6,
  },
  emptyBody: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyButton: {
    backgroundColor: colors.surface,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 18,
    ...shadows.sm,
  },
  emptyButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
});
