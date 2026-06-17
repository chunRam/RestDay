import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Platform, Modal, TextInput, Alert, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, shadows } from '../theme/theme';
import { useAppStore } from '../store/useAppStore';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Logger } from '../utils/logger';

export default function ExecutionView() {
  const navigation = useNavigation<any>();
  const { plans, togglePlanCheck, currentHoliday, saveReview } = useAppStore();
  const [isReviewModalVisible, setReviewModalVisible] = useState(false);
  const [rating, setRating] = useState(0);
  const [memo, setMemo] = useState('');
  const [reviewStep, setReviewStep] = useState<'input' | 'complete'>('input');

  const doneCount = plans.filter(p => p.isDone).length;
  const progressPercent = plans.length > 0 ? (doneCount / plans.length) * 100 : 0;

  const handleFinish = () => {
    Alert.alert(
      "회고로 마무리",
      "실행한 만큼만 기록하고 오늘의 휴일을 마무리할까요?",
      [
        { text: "취소", style: "cancel" },
        {
          text: "확인",
          onPress: () => {
            setReviewStep('input');
            setReviewModalVisible(true);
          }
        }
      ]
    );
  };

  const handleCloseReview = async () => {
    try {
      await addDoc(collection(db, 'reviews'), {
        holidayId: currentHoliday?.id || 'unknown',
        rating,
        memo,
        createdAt: new Date().toISOString()
      });
    } catch (e) {
      Logger.warn("Failed to save review:", e);
    }

    saveReview({ rating, memo });
    setReviewStep('complete');
  };

  const handleGoHome = () => {
    setReviewModalVisible(false);
    navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
  };

  const getCompletionSubtitle = () => {
    if (rating <= 2) return '다음 휴일은 더 좋은 하루가 될 거예요.';
    if (rating === 3) return '적당한 하루였네요. 다음에도 화이팅!';
    return '만족스러운 휴일이었네요! 🎉';
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={{ width: 44 }} />
        <Text style={styles.headerTitle}>오늘의 휴일</Text>
        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.popToTop()}>
          <Text style={{ fontSize: 20 }}>🏠</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {plans.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }}>📋</Text>
            <Text style={styles.titleLarge}>확정된 계획이 없어요</Text>
            <Text style={{ fontSize: 16, color: colors.textSecondary, textAlign: 'center', lineHeight: 24 }}>
              먼저 상태 체크와 계획 추천을 완료해주세요.
            </Text>
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

            <ScrollView style={styles.checklist} showsVerticalScrollIndicator={false}>
              {plans.map(item => {
                const isDone = item.isDone;
                return (
                  <TouchableOpacity 
                    key={item.id} 
                    style={[styles.checkItem, isDone && styles.checkItemDone]}
                    activeOpacity={0.7}
                    onPress={() => togglePlanCheck(item.id)}
                  >
                    <View style={[styles.checkCircle, isDone && styles.checkCircleDone]}>
                      {isDone && <Text style={{ color: 'white', fontWeight: 'bold' }}>✓</Text>}
                    </View>
                    <Text style={[styles.checkText, isDone && styles.checkTextDone]}>{item.text}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        )}
      </View>

      {plans.length > 0 && (
        <View style={styles.bottomBar}>
          <TouchableOpacity 
            style={styles.btnPrimary}
            onPress={handleFinish}
          >
            <Text style={styles.btnPrimaryText}>회고로 마무리하기</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Review Modal (BottomSheet Simulation) */}
      <Modal
        visible={isReviewModalVisible}
        animationType="slide"
        transparent={true}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />

            {reviewStep === 'input' ? (
              <>
                <Text style={styles.modalTitle}>휴일은 어떠셨나요?</Text>
                
                <View style={styles.starContainer}>
                  {[1, 2, 3, 4, 5].map(star => (
                    <TouchableOpacity key={star} onPress={() => setRating(star)}>
                      <Text style={[styles.star, rating >= star && styles.starActive]}>★</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.modalSubtitle}>다음 휴일을 위해 간단한 회고를 남겨주세요.</Text>
                <TextInput 
                  style={styles.textInput}
                  multiline
                  placeholder="예: 오후에 산책을 다녀온 것이 좋았다..."
                  placeholderTextColor={colors.textSecondary}
                  value={memo}
                  onChangeText={setMemo}
                />

                <TouchableOpacity
                  style={[styles.btnPrimary, { marginTop: 20 }, rating === 0 && { opacity: 0.5 }]}
                  onPress={handleCloseReview}
                  disabled={rating === 0}
                >
                  <Text style={styles.btnPrimaryText}>{rating === 0 ? '별점을 선택해주세요' : '저장하기'}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <View style={styles.completionContainer}>
                <Text style={styles.completionTitle}>오늘 하루도 수고했어요</Text>
                <Text style={styles.completionSubtitle}>{getCompletionSubtitle()}</Text>

                <View style={styles.completionStars}>
                  {[1, 2, 3, 4, 5].map(star => (
                    <Text key={star} style={[styles.star, rating >= star && styles.starActive]}>★</Text>
                  ))}
                </View>

                {memo.trim().length > 0 && (
                  <View style={styles.memoQuote}>
                    <Text style={styles.memoQuoteText}>{memo}</Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.btnPrimary, { marginTop: 20, width: '100%' }]}
                  onPress={handleGoHome}
                >
                  <Text style={styles.btnPrimaryText}>홈으로 돌아가기</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: Platform.OS === 'android' ? 20 : 0, paddingBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.85)', borderBottomWidth: 0.5, borderBottomColor: colors.border
  },
  iconBtn: { padding: 8, marginRight: -8 },
  headerTitle: { fontSize: 17, fontWeight: '600', color: colors.textPrimary },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 20 },
  titleLarge: { fontSize: 28, fontWeight: '700', color: colors.textPrimary, marginBottom: 24, letterSpacing: -0.5 },
  
  progressContainer: { marginBottom: 32 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressLabel: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  progressValue: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  progressBarBg: { height: 12, backgroundColor: colors.border, borderRadius: 6, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: colors.accent, borderRadius: 6 },
  
  checklist: { gap: 14 },
  checkItem: {
    flexDirection: 'row', alignItems: 'center', padding: 20, backgroundColor: colors.surface,
    borderRadius: 20, ...shadows.sm
  },
  checkItemDone: { opacity: 0.6 },
  checkCircle: {
    width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: colors.border,
    marginRight: 16, alignItems: 'center', justifyContent: 'center'
  },
  checkCircleDone: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkText: { fontSize: 17, fontWeight: '500', color: colors.textPrimary },
  checkTextDone: { color: colors.textSecondary, textDecorationLine: 'line-through' },
  
  bottomBar: {
    paddingHorizontal: 24, paddingBottom: Platform.OS === 'ios' ? 0 : 24, paddingTop: 16,
    backgroundColor: 'rgba(255,255,255,0.85)', borderTopWidth: 0.5, borderTopColor: colors.border
  },
  btnPrimary: {
    backgroundColor: colors.primaryAction, paddingVertical: 18, borderRadius: 20, alignItems: 'center', ...shadows.sm
  },
  btnPrimaryText: { color: colors.primaryActionText, fontSize: 17, fontWeight: '600' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 24, paddingBottom: 40, paddingTop: 12, minHeight: '60%'
  },
  modalHandle: { width: 40, height: 5, backgroundColor: '#D1D1D6', borderRadius: 3, alignSelf: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 24, fontWeight: '700', textAlign: 'center', color: colors.textPrimary },
  starContainer: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginVertical: 32 },
  star: { fontSize: 44, color: colors.border },
  starActive: { color: '#FFCC00' },
  modalSubtitle: { fontSize: 17, fontWeight: '600', marginBottom: 12, color: colors.textPrimary },
  textInput: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: 20, padding: 20,
    fontSize: 16, backgroundColor: colors.surface, textAlignVertical: 'top', minHeight: 120
  },

  completionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 40,
  },
  completionTitle: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  completionSubtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
  },
  completionStars: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 32,
  },
  memoQuote: {
    borderLeftWidth: 3,
    borderLeftColor: '#34C759',
    paddingLeft: 16,
    marginTop: 24,
    marginBottom: 32,
    width: '100%',
  },
  memoQuoteText: {
    fontSize: 15,
    fontStyle: 'italic',
    color: colors.textSecondary,
    lineHeight: 22,
  },
});
