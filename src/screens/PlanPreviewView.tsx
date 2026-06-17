import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Platform, ScrollView, Animated } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, shadows } from '../theme/theme';
import { useAppStore } from '../store/useAppStore';
import type { PlanIntensity } from '../utils/planGenerator';

export default function PlanPreviewView() {
  const navigation = useNavigation<any>();
  const { plans, recommendation, decisionAnswers, adjustPlanIntensity } = useAppStore();
  const [adjustmentError, setAdjustmentError] = useState<string | null>(null);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const direction = recommendation?.direction ?? '추천 휴일 계획';
  const reason = recommendation?.reason ?? '선택한 답변을 바탕으로 계획을 구성했습니다.';

  useEffect(() => {
    if (isConfirmed) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();

      timerRef.current = setTimeout(() => {
        navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
      }, 1800);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isConfirmed]);

  const handleAdjustIntensity = async (intensity: PlanIntensity) => {
    if (!decisionAnswers) return;
    if (decisionAnswers.intensity === intensity) return;

    setAdjustmentError(null);
    try {
      await adjustPlanIntensity(intensity, decisionAnswers);
    } catch (error) {
      console.warn('Failed to adjust plan intensity:', error);
      setAdjustmentError('계획을 바꾸지 못했습니다. 기존 계획은 그대로 두었어요.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>추천 계획</Text>
        <View style={{ width: 44 }} />
      </View>

      <View style={styles.content}>
        <Text style={styles.titleLarge}>{direction}</Text>
        <Text style={styles.textBody}>{reason}</Text>

        {decisionAnswers && (
          <>
            <View style={styles.adjustBar}>
              <TouchableOpacity
                style={[
                  styles.adjustBtn,
                  decisionAnswers.intensity === 'light' && styles.adjustBtnSelected,
                ]}
                onPress={() => handleAdjustIntensity('light')}
              >
                <Text style={styles.adjustBtnText}>더 가볍게</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.adjustBtn,
                  decisionAnswers.intensity === 'balanced' && styles.adjustBtnSelected,
                ]}
                onPress={() => handleAdjustIntensity('balanced')}
              >
                <Text style={styles.adjustBtnText}>적당히</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.adjustBtn,
                  decisionAnswers.intensity === 'full' && styles.adjustBtnSelected,
                ]}
                onPress={() => handleAdjustIntensity('full')}
              >
                <Text style={styles.adjustBtnText}>더 알차게</Text>
              </TouchableOpacity>
            </View>
            {adjustmentError && <Text style={styles.adjustmentError}>{adjustmentError}</Text>}
          </>
        )}

        <ScrollView style={styles.timeline} showsVerticalScrollIndicator={false}>
          <View style={styles.timelineLine} />
          
          {plans.map((plan) => (
            <View key={plan.id} style={styles.timelineItem}>
              <View style={styles.timelineDot} />
              <Text style={styles.timelineTime}>{plan.timeSlot}</Text>
              <View style={styles.timelineContentBox}>
                <Text style={styles.timelineContentText}>{plan.text}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>

      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.btnPrimary}
          onPress={() => setIsConfirmed(true)}
          disabled={isConfirmed}
        >
          <Text style={styles.btnPrimaryText}>계획 확정하기</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.btnSecondary}
          onPress={() => navigation.navigate('Decision')}
          disabled={isConfirmed}
        >
          <Text style={styles.btnSecondaryText}>답변 다시 조정하기</Text>
        </TouchableOpacity>
      </View>

      {isConfirmed && (
        <Animated.View style={[styles.confirmOverlay, { opacity: fadeAnim }]}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmCheckmark}>✓</Text>
            <Text style={styles.confirmTitle}>계획이 확정됐어요!</Text>
            <Text style={styles.confirmSubtitle}>휴일이 되면 계획을 체크할 수 있어요.</Text>
            <TouchableOpacity
              style={styles.confirmHomeBtn}
              onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Home' }] })}
            >
              <Text style={styles.confirmHomeBtnText}>홈으로</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}
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
  backBtn: { padding: 8, marginLeft: -8 },
  backBtnText: { fontSize: 24, color: colors.textPrimary },
  headerTitle: { fontSize: 17, fontWeight: '600', color: colors.textPrimary },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 20 },
  titleLarge: { fontSize: 28, fontWeight: '700', color: colors.textPrimary, marginBottom: 8, letterSpacing: -0.5 },
  textBody: { fontSize: 16, color: colors.textSecondary, lineHeight: 24 },
  adjustBar: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 24,
  },
  adjustBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  adjustBtnSelected: {
    borderColor: colors.primaryAction,
    backgroundColor: '#F3F4F6',
  },
  adjustBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  adjustmentError: {
    marginTop: 12,
    color: '#B42318',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },

  timeline: { marginTop: 32, paddingLeft: 24, position: 'relative' },
  timelineLine: { position: 'absolute', left: 6, top: 12, bottom: 12, width: 2, backgroundColor: colors.border },
  timelineItem: { marginBottom: 28, position: 'relative' },
  timelineDot: { 
    position: 'absolute', left: -24, top: 8, width: 14, height: 14, 
    borderRadius: 7, backgroundColor: colors.surface, borderWidth: 3, borderColor: colors.textPrimary 
  },
  timelineTime: { fontSize: 14, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 },
  timelineContentBox: { 
    backgroundColor: colors.surface, padding: 18, borderRadius: 16, 
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.02)', ...shadows.sm 
  },
  timelineContentText: { fontSize: 17, fontWeight: '600', color: colors.textPrimary },
  
  bottomBar: {
    paddingHorizontal: 24, paddingBottom: Platform.OS === 'ios' ? 0 : 24, paddingTop: 16,
    backgroundColor: 'rgba(255,255,255,0.85)', borderTopWidth: 0.5, borderTopColor: colors.border,
    gap: 12
  },
  btnPrimary: {
    backgroundColor: colors.primaryAction, paddingVertical: 18, borderRadius: 20, alignItems: 'center', ...shadows.sm
  },
  btnPrimaryText: { color: colors.primaryActionText, fontSize: 17, fontWeight: '600' },
  btnSecondary: {
    backgroundColor: colors.badgeBg, paddingVertical: 18, borderRadius: 20, alignItems: 'center'
  },
  btnSecondaryText: { color: colors.textPrimary, fontSize: 17, fontWeight: '600' },

  confirmOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  confirmCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    paddingVertical: 40,
    paddingHorizontal: 32,
    alignItems: 'center',
    width: '80%',
    ...shadows.md,
  },
  confirmCheckmark: {
    fontSize: 60,
    color: colors.accent,
    fontWeight: '700',
    marginBottom: 16,
  },
  confirmTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  confirmSubtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  confirmHomeBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  confirmHomeBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});
