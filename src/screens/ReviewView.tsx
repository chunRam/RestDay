import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Logger } from '../utils/logger';
import { useAppStore } from '../store/useAppStore';
import { colors, shadows } from '../theme/theme';

type ReviewRouteParams = {
  recordId?: string;
};

export default function ReviewView() {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const { recordId } = (route.params as ReviewRouteParams | undefined) ?? {};
  const {
    currentHoliday,
    plans,
    reviewDraft,
    pastHolidays,
    setReviewDraft,
    saveReview,
    updatePastHolidayReview,
  } = useAppStore();
  const isHistoryMode = typeof recordId === 'string';
  const targetRecord = useMemo(
    () => (isHistoryMode ? pastHolidays.find((record) => record.recordId === recordId) ?? null : null),
    [isHistoryMode, pastHolidays, recordId]
  );
  const isEditingHistory = isHistoryMode;
  const holiday = isHistoryMode ? targetRecord?.holiday ?? null : currentHoliday;
  const targetPlans = targetRecord?.plans ?? plans;
  const initialReview = targetRecord?.review ?? null;
  const initialDraft = isEditingHistory ? null : reviewDraft;
  const initialValues = useMemo(
    () => ({
      rating: initialReview?.rating ?? initialDraft?.rating ?? 0,
      memo: initialReview?.memo ?? initialDraft?.memo ?? '',
    }),
    [initialDraft?.memo, initialDraft?.rating, initialReview?.memo, initialReview?.rating]
  );
  const [rating, setRating] = useState(initialValues.rating);
  const [memo, setMemo] = useState(initialValues.memo);
  const allowLeaveRef = useRef(false);

  useEffect(() => {
    setRating(initialValues.rating);
    setMemo(initialValues.memo);
  }, [initialValues.memo, initialValues.rating]);

  useEffect(() => {
    if (isEditingHistory) return;
    setReviewDraft({ rating, memo });
  }, [isEditingHistory, memo, rating, setReviewDraft]);

  const isDirty = rating !== initialValues.rating || memo !== initialValues.memo;

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event: any) => {
      if (!isDirty || allowLeaveRef.current) return;

      event.preventDefault();
      Alert.alert(
        '작성 중인 회고가 있어요',
        '저장하지 않고 나가면 지금 입력한 내용이 사라질 수 있어요.',
        [
          { text: '계속 작성', style: 'cancel' },
          {
            text: '나가기',
            style: 'destructive',
            onPress: () => {
              allowLeaveRef.current = true;
              navigation.dispatch(event.data.action);
            },
          },
        ]
      );
    });

    return unsubscribe;
  }, [isDirty, navigation]);

  const handleSave = async () => {
    if (rating === 0) {
      Alert.alert('별점을 선택해주세요', '휴일 만족도를 먼저 남겨주세요.');
      return;
    }

    const nextReview = { rating, memo: memo.trim() };

    if (targetRecord) {
      updatePastHolidayReview(targetRecord.recordId, nextReview);
      allowLeaveRef.current = true;
      Alert.alert('회고를 수정했어요', '히스토리에서 바로 다시 확인할 수 있어요.', [
        { text: '확인', onPress: () => navigation.goBack() },
      ]);
      return;
    }

    const savedRecordId = saveReview(nextReview);
    try {
      await addDoc(collection(db, 'reviews'), {
        holidayId: holiday?.id || 'unknown',
        rating: nextReview.rating,
        memo: nextReview.memo,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      Logger.warn('Failed to save review analytics:', error);
    }

    allowLeaveRef.current = true;
    Alert.alert('회고가 저장됐어요', '기록은 히스토리에서 다시 볼 수 있어요.', [
      {
        text: '홈으로',
        onPress: () =>
          navigation.reset({
            index: 0,
            routes: [{ name: 'Home' }],
          }),
      },
      ...(savedRecordId
        ? [
            {
              text: '히스토리 보기',
              onPress: () =>
                navigation.reset({
                  index: 1,
                  routes: [
                    { name: 'Home' },
                    { name: 'HistoryDetail', params: { recordId: savedRecordId } },
                  ],
                }),
            },
          ]
        : []),
    ]);
  };

  if (isHistoryMode && !targetRecord) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backBtnText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>회고 수정</Text>
          <View style={{ width: 44 }} />
        </View>

        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🕳️</Text>
          <Text style={styles.emptyTitle}>수정할 기록을 찾지 못했어요</Text>
          <TouchableOpacity style={styles.emptyButton} onPress={() => navigation.navigate('History')}>
            <Text style={styles.emptyButtonText}>히스토리로 돌아가기</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!holiday) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backBtnText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>회고</Text>
          <View style={{ width: 44 }} />
        </View>

        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📝</Text>
          <Text style={styles.emptyTitle}>회고할 휴일이 없어요</Text>
          <TouchableOpacity style={styles.emptyButton} onPress={() => navigation.navigate('Home')}>
            <Text style={styles.emptyButtonText}>홈으로 돌아가기</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{targetRecord ? '회고 수정' : '회고'}</Text>
        <View style={{ width: 44 }} />
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardArea}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentInner}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroCard}>
            <Text style={styles.heroLabel}>{targetRecord ? '기록된 휴일' : '마무리 단계'}</Text>
            <Text style={styles.heroTitle}>{holiday.title}</Text>
            <Text style={styles.heroDate}>{holiday.startDate.slice(0, 10)}</Text>
            <Text style={styles.heroDescription}>
              {targetRecord
                ? '지난 휴일의 만족도와 메모를 다시 다듬을 수 있어요.'
                : '실행한 만큼만 적어도 충분해요. 다음 휴일에 참고할 한 줄만 남겨주세요.'}
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>만족도</Text>
            <View style={styles.starContainer}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity key={star} onPress={() => setRating(star)} activeOpacity={0.8}>
                  <Text style={[styles.star, rating >= star && styles.starActive]}>★</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.sectionHint}>체크를 모두 끝내지 않았어도, 하루의 느낌대로 남겨주세요.</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>한 줄 회고</Text>
            <TextInput
              style={styles.input}
              multiline
              value={memo}
              onChangeText={setMemo}
              placeholder="예: 오후에 산책을 다녀온 덕분에 생각보다 기분 전환이 됐어요."
              placeholderTextColor={colors.textSecondary}
              textAlignVertical="top"
            />
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>이번 기록에 함께 저장되는 내용</Text>
            <Text style={styles.summaryBody}>
              {targetPlans.length > 0
                ? `체크한 계획 ${targetPlans.filter((plan) => plan.isDone).length}/${targetPlans.length}개와 함께 저장됩니다.`
                : '계획 체크 없이 회고만 남겨도 기록으로 보관됩니다.'}
            </Text>
          </View>
        </ScrollView>

        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[styles.primaryButton, rating === 0 && styles.primaryButtonDisabled]}
            onPress={handleSave}
            disabled={rating === 0}
          >
            <Text style={styles.primaryButtonText}>{targetRecord ? '회고 수정 저장' : '회고 저장하기'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardArea: {
    flex: 1,
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
    paddingBottom: 24,
    gap: 20,
  },
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
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
    marginBottom: 16,
  },
  heroDescription: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  section: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    ...shadows.sm,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 14,
  },
  sectionHint: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  starContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 14,
  },
  star: {
    fontSize: 44,
    color: colors.border,
  },
  starActive: {
    color: '#FFCC00',
  },
  input: {
    minHeight: 180,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
    padding: 18,
    fontSize: 16,
    color: colors.textPrimary,
    lineHeight: 24,
  },
  summaryCard: {
    backgroundColor: colors.badgeBg,
    borderRadius: 20,
    padding: 20,
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  summaryBody: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.textSecondary,
  },
  bottomBar: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 0 : 24,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
  },
  primaryButton: {
    backgroundColor: colors.primaryAction,
    paddingVertical: 18,
    borderRadius: 20,
    alignItems: 'center',
    ...shadows.sm,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.primaryActionText,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 20,
  },
  emptyButton: {
    backgroundColor: colors.primaryAction,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 18,
  },
  emptyButtonText: {
    color: colors.primaryActionText,
    fontSize: 16,
    fontWeight: '700',
  },
});
