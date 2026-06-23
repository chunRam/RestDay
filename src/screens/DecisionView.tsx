import React, { useState } from 'react';
import {
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { collection, addDoc } from 'firebase/firestore';
import { colors, shadows } from '../theme/theme';
import { useAppStore } from '../store/useAppStore';
import { db } from '../firebase/config';
import {
  DecisionAnswers,
  DesiredMood,
  EnergyLevel,
  PlanIntensity,
  SocialMode,
} from '../utils/planGenerator';

type Choice<T extends string> = {
  id: T;
  label: string;
  description: string;
};

const ENERGY_OPTIONS: Choice<EnergyLevel>[] = [
  { id: 'low', label: '낮음', description: '많이 움직이고 싶지 않아요' },
  { id: 'normal', label: '보통', description: '무리하지 않으면 괜찮아요' },
  { id: 'high', label: '좋음', description: '조금 알차게 보내고 싶어요' },
];

const MOOD_OPTIONS: Choice<DesiredMood>[] = [
  { id: 'rest', label: '완전히 쉬기', description: '회복감이 남는 하루' },
  { id: 'organize', label: '정리하기', description: '밀린 것을 조금 덜어내기' },
  { id: 'outside', label: '밖으로 나가기', description: '장소를 바꿔 기분 전환' },
  { id: 'achieve', label: '해내기', description: '하나라도 끝낸 만족감' },
];

const SOCIAL_OPTIONS: Choice<SocialMode>[] = [
  { id: 'alone', label: '혼자', description: '내 리듬대로 보내기' },
  { id: 'together', label: '함께', description: '누군가와 맞춰 보내기' },
  { id: 'undecided', label: '아직 모름', description: '유동적으로 열어두기' },
];

const INTENSITY_OPTIONS: Choice<PlanIntensity>[] = [
  { id: 'light', label: '아주 가볍게', description: '해야 할 일을 최소화' },
  { id: 'balanced', label: '적당히', description: '휴식과 행동을 반반' },
  { id: 'full', label: '알차게', description: '계획 밀도를 조금 높게' },
];

function formatCalendarEventPreview(start: string, isAllDay: boolean, title: string) {
  if (isAllDay) {
    return `${start.slice(5, 10).replace('-', '/')} 종일 · ${title}`;
  }

  const date = new Date(start);
  if (Number.isNaN(date.getTime())) {
    return `${title}`;
  }

  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')} · ${title}`;
}

export default function DecisionView() {
  const navigation = useNavigation<any>();
  const {
    currentHoliday,
    calendarContext,
    setDecisionAndGeneratePlans,
    decisionAnswers: savedAnswers,
  } = useAppStore();
  const [energy, setEnergy] = useState<EnergyLevel>(savedAnswers?.energy ?? 'normal');
  const [desiredMood, setDesiredMood] = useState<DesiredMood>(savedAnswers?.desiredMood ?? 'rest');
  const [socialMode, setSocialMode] = useState<SocialMode>(savedAnswers?.socialMode ?? 'alone');
  const [intensity, setIntensity] = useState<PlanIntensity>(savedAnswers?.intensity ?? 'balanced');
  const [mustDo, setMustDo] = useState(savedAnswers?.mustDo ?? currentHoliday?.note ?? '');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const handleNext = async () => {
    if (isGenerating) return;

    const answers: DecisionAnswers = {
      energy,
      desiredMood,
      socialMode,
      mustDo: mustDo.trim(),
      intensity,
    };

    setIsGenerating(true);
    setGenerationError(null);

    try {
      await setDecisionAndGeneratePlans(answers);
      navigation.reset({ index: 1, routes: [{ name: 'Home' }, { name: 'PlanPreview' }] });
    } catch (error) {
      console.warn('Failed to generate recommendation:', error);
      setGenerationError('추천 계획을 만드는 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.');
      return;
    } finally {
      setIsGenerating(false);
    }

    void addDoc(collection(db, 'decisions'), {
      holidayId: currentHoliday?.id || 'unknown',
      answers,
      createdAt: new Date().toISOString(),
    }).catch((e) => {
      console.warn('Failed to save decision to Firebase:', e);
    });
  };

  const renderChoices = <T extends string>(
    choices: Choice<T>[],
    selected: T,
    onSelect: (value: T) => void
  ) => (
    <View style={styles.choiceGrid}>
      {choices.map((choice) => {
        const isSelected = selected === choice.id;

        return (
          <TouchableOpacity
            key={choice.id}
            style={[styles.choiceItem, isSelected && styles.choiceItemSelected]}
            activeOpacity={0.75}
            onPress={() => onSelect(choice.id)}
          >
            <Text style={[styles.choiceLabel, isSelected && styles.choiceLabelSelected]}>
              {choice.label}
            </Text>
            <Text style={styles.choiceDescription}>{choice.description}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>상태 체크</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentInner}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.badge}>
          <Text style={styles.badgeText}>계획 전 질문</Text>
        </View>
        <Text style={styles.titleLarge}>이번 휴일의 상태를{'\n'}먼저 정리해볼게요.</Text>
        <Text style={styles.textBody}>선택한 답변을 바탕으로 실행 가능한 하루 초안을 만듭니다.</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>컨디션</Text>
          {renderChoices(ENERGY_OPTIONS, energy, setEnergy)}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>원하는 휴일 느낌</Text>
          {renderChoices(MOOD_OPTIONS, desiredMood, setDesiredMood)}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>함께 보내나요?</Text>
          {renderChoices(SOCIAL_OPTIONS, socialMode, setSocialMode)}
        </View>

        {calendarContext ? (
          <View style={styles.calendarCard}>
            <Text style={styles.calendarCardTitle}>Google Calendar 일정 요약</Text>
            <Text style={styles.calendarCardBody}>
              {calendarContext.planningSummary ?? '연동된 일정 요약이 아직 없습니다.'}
            </Text>
            {calendarContext.upcomingEvents.slice(0, 3).map((event) => (
              <Text key={event.id} style={styles.calendarEventText}>
                {formatCalendarEventPreview(event.start, event.isAllDay, event.title)}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>꼭 해야 하는 일</Text>
          <TextInput
            style={styles.input}
            value={mustDo}
            onChangeText={setMustDo}
            placeholder="없으면 비워두세요"
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>계획 강도</Text>
          {renderChoices(INTENSITY_OPTIONS, intensity, setIntensity)}
        </View>

        {generationError && <Text style={styles.errorText}>{generationError}</Text>}
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.btnPrimary, isGenerating && styles.btnPrimaryDisabled]}
          onPress={handleNext}
          disabled={isGenerating}
        >
          <Text style={styles.btnPrimaryText}>
            {isGenerating ? '맞춤 계획 만드는 중...' : '추천 계획 만들기'}
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
  backBtn: { padding: 8, marginLeft: -8 },
  backBtnText: { fontSize: 24, color: colors.textPrimary },
  headerTitle: { fontSize: 17, fontWeight: '600', color: colors.textPrimary },
  content: { flex: 1 },
  contentInner: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 24 },
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
  badgeText: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  titleLarge: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  textBody: { fontSize: 16, color: colors.textSecondary, lineHeight: 24, marginBottom: 28 },
  section: { marginBottom: 28 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary, marginBottom: 12 },
  choiceGrid: { gap: 10 },
  choiceItem: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 18,
    ...shadows.sm,
  },
  choiceItemSelected: {
    borderColor: colors.primaryAction,
    backgroundColor: '#F3F4F6',
  },
  choiceLabel: { fontSize: 17, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  choiceLabelSelected: { color: colors.primaryAction },
  choiceDescription: { fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  calendarCard: {
    backgroundColor: '#ECFDF3',
    borderRadius: 20,
    padding: 18,
    marginBottom: 28,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.14)',
  },
  calendarCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  calendarCardBody: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
  },
  calendarEventText: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    color: '#166534',
    fontWeight: '600',
  },
  input: {
    width: '100%',
    paddingVertical: 18,
    paddingHorizontal: 20,
    fontSize: 16,
    fontWeight: '600',
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 18,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
  },
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
  btnPrimaryDisabled: {
    opacity: 0.65,
  },
  btnPrimaryText: { color: colors.primaryActionText, fontSize: 17, fontWeight: '600' },
  errorText: {
    color: '#B42318',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    marginTop: -8,
    marginBottom: 16,
  },
});
