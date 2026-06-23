import React, { useMemo, useState } from 'react';
import {
  Alert,
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
import CalendarPicker from '../components/CalendarPicker';
import { colors, shadows } from '../theme/theme';
import { useAppStore, type ManualScheduleEntry } from '../store/useAppStore';

type RegisterRouteParams = {
  initialKind?: 'schedule' | 'holiday';
  editingEntryId?: string;
  selectAsCurrentHoliday?: boolean;
};

function formatLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDefaultHolidayDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return formatLocalDateKey(date);
}

function getTodayKey() {
  return formatLocalDateKey(new Date());
}

function buildLocalDateTime(dateKey: string, time: string) {
  return `${dateKey}T${time}:00`;
}

function extractTimeValue(value: string | null) {
  if (!value || !value.includes('T')) return '';
  return value.slice(11, 16);
}

function createEntryId(kind: 'schedule' | 'holiday', dateKey: string) {
  return `manual:${kind}:${dateKey}:${Date.now()}`;
}

function showAlert(title: string, message: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}\n\n${message}`);
    return;
  }

  Alert.alert(title, message);
}

export default function RegisterView() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const params = (route.params ?? {}) as RegisterRouteParams;
  const { manualEntries, currentHoliday, upsertManualEntry, setCurrentHolidayFromEntry } = useAppStore();

  const editingEntry = useMemo(
    () => manualEntries.find((entry) => entry.id === params.editingEntryId) ?? null,
    [manualEntries, params.editingEntryId]
  );

  const initialKind = editingEntry?.kind ?? params.initialKind ?? 'holiday';
  const isEditingCurrentHoliday = !!editingEntry && currentHoliday?.id === editingEntry.id;
  const minimumDate = editingEntry?.dateKey && editingEntry.dateKey < getTodayKey() ? editingEntry.dateKey : getTodayKey();
  const initialSelectAsCurrent =
    isEditingCurrentHoliday ||
    params.selectAsCurrentHoliday === true ||
    (!!editingEntry && currentHoliday?.id === editingEntry.id) ||
    (!editingEntry && initialKind === 'holiday' && !currentHoliday);

  const [kind, setKind] = useState<'schedule' | 'holiday'>(initialKind);
  const [date, setDate] = useState(editingEntry?.dateKey ?? getDefaultHolidayDate());
  const [title, setTitle] = useState(editingEntry?.title ?? (initialKind === 'holiday' ? '쉬는 날' : '직접 일정'));
  const [note, setNote] = useState(editingEntry?.note ?? '');
  const [isAllDay, setIsAllDay] = useState(editingEntry?.isAllDay ?? initialKind === 'holiday');
  const [startTime, setStartTime] = useState(extractTimeValue(editingEntry?.start ?? null));
  const [endTime, setEndTime] = useState(extractTimeValue(editingEntry?.end ?? null));
  const [selectAsCurrentHoliday, setSelectAsCurrentHoliday] = useState(initialSelectAsCurrent);

  const isHoliday = kind === 'holiday';

  const buildEntry = (): ManualScheduleEntry | null => {
    const trimmedTitle = title.trim();
    const trimmedNote = note.trim();
    const normalizedStartTime = startTime.trim();
    const normalizedEndTime = endTime.trim();

    if (!trimmedTitle) {
      showAlert('입력이 필요해요', isHoliday ? '휴일 이름을 입력해주세요.' : '일정 이름을 입력해주세요.');
      return null;
    }

    if (!isHoliday && !isAllDay) {
      if (normalizedEndTime && !normalizedStartTime) {
        showAlert('시간을 확인해주세요', '종료 시간을 쓰려면 시작 시간도 입력해주세요.');
        return null;
      }

      if (normalizedStartTime && normalizedEndTime) {
        const start = buildLocalDateTime(date, normalizedStartTime);
        const end = buildLocalDateTime(date, normalizedEndTime);
        if (new Date(end).getTime() <= new Date(start).getTime()) {
          showAlert('시간을 확인해주세요', '종료 시간은 시작 시간보다 뒤여야 합니다.');
          return null;
        }
      }
    }

    return {
      id: editingEntry?.id ?? createEntryId(kind, date),
      kind,
      title: trimmedTitle,
      dateKey: date,
      start: isHoliday || isAllDay || !normalizedStartTime ? null : buildLocalDateTime(date, normalizedStartTime),
      end:
        isHoliday || isAllDay || !normalizedStartTime || !normalizedEndTime
          ? null
          : buildLocalDateTime(date, normalizedEndTime),
      isAllDay: isHoliday ? true : isAllDay,
      note: trimmedNote,
      source: 'manual',
    };
  };

  const saveEntry = (options?: { moveToDecision?: boolean; forceCurrentHoliday?: boolean }) => {
    const nextEntry = buildEntry();
    if (!nextEntry) return;

    upsertManualEntry(nextEntry);

    const shouldSetCurrentHoliday =
      nextEntry.kind === 'holiday' &&
      (options?.forceCurrentHoliday || isEditingCurrentHoliday || selectAsCurrentHoliday);

    if (shouldSetCurrentHoliday) {
      setCurrentHolidayFromEntry(nextEntry.id);
    }

    if (options?.moveToDecision && nextEntry.kind === 'holiday') {
      navigation.navigate('Decision');
      return;
    }

    navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
  };

  const renderSegmentButton = (value: 'schedule' | 'holiday', label: string) => {
    const isSelected = kind === value;
    return (
      <TouchableOpacity
        key={value}
        style={[styles.segmentButton, isSelected && styles.segmentButtonSelected]}
        activeOpacity={0.8}
        onPress={() => {
          setKind(value);
          if (value === 'holiday') {
            setIsAllDay(true);
            if (!title.trim()) {
              setTitle('쉬는 날');
            }
          }
        }}
      >
        <Text style={[styles.segmentButtonText, isSelected && styles.segmentButtonTextSelected]}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{editingEntry ? '항목 수정' : '직접 작성'}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentInner}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <Text style={styles.heroEyebrow}>Calm Command 입력</Text>
          <Text style={styles.heroTitle}>
            {isHoliday ? '준비할 휴일을 또렷하게 남겨둘게요.' : '휴일 전후 일정을 직접 추가하세요.'}
          </Text>
          <Text style={styles.heroBody}>
            {isHoliday
              ? '이 휴일을 현재 준비 대상으로 잡으면 홈에서 남은 시간과 다음 행동을 바로 보여줍니다.'
              : '직접 작성한 일정도 홈 피드에 함께 나타나서 이번 휴일 전후 제약을 한눈에 볼 수 있습니다.'}
          </Text>
        </View>

        <View style={styles.segmentBar}>
          {renderSegmentButton('holiday', '휴일')}
          {renderSegmentButton('schedule', '일정')}
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>{isHoliday ? '휴일 날짜' : '일정 날짜'}</Text>
          <CalendarPicker selectedDate={date} onSelectDate={setDate} minDate={minimumDate} />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>{isHoliday ? '휴일 이름' : '일정 이름'}</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder={isHoliday ? '예: 연차, 쉬는 금요일' : '예: 병원, 저녁 약속'}
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        {!isHoliday ? (
          <>
            <View style={styles.formGroup}>
              <Text style={styles.label}>일정 방식</Text>
              <View style={styles.choiceRow}>
                <TouchableOpacity
                  style={[styles.choiceChip, isAllDay && styles.choiceChipSelected]}
                  activeOpacity={0.8}
                  onPress={() => setIsAllDay(true)}
                >
                  <Text style={[styles.choiceChipText, isAllDay && styles.choiceChipTextSelected]}>종일</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.choiceChip, !isAllDay && styles.choiceChipSelected]}
                  activeOpacity={0.8}
                  onPress={() => setIsAllDay(false)}
                >
                  <Text style={[styles.choiceChipText, !isAllDay && styles.choiceChipTextSelected]}>시간 지정</Text>
                </TouchableOpacity>
              </View>
            </View>

            {!isAllDay ? (
              <View style={styles.timeRow}>
                <View style={[styles.formGroup, styles.timeField]}>
                  <Text style={styles.label}>시작 시간</Text>
                  <TextInput
                    style={styles.input}
                    value={startTime}
                    onChangeText={setStartTime}
                    placeholder="09:00"
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
                <View style={[styles.formGroup, styles.timeField]}>
                  <Text style={styles.label}>종료 시간</Text>
                  <TextInput
                    style={styles.input}
                    value={endTime}
                    onChangeText={setEndTime}
                    placeholder="선택"
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
              </View>
            ) : null}
          </>
        ) : null}

        <View style={styles.formGroup}>
          <Text style={styles.label}>{isHoliday ? '메모' : '신경 쓰이는 것'}</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={note}
            onChangeText={setNote}
            placeholder={isHoliday ? '예: 꼭 쉬고 싶음, 돈 쓰기 조심' : '예: 이동 시간, 준비물, 컨디션'}
            placeholderTextColor={colors.textSecondary}
            multiline
          />
        </View>

        {isHoliday ? (
          isEditingCurrentHoliday ? (
            <View style={styles.helperCard}>
              <Text style={styles.helperCardTitle}>현재 준비 중인 휴일</Text>
              <Text style={styles.helperCardBody}>
                이 휴일은 이미 홈의 기준 휴일로 사용 중입니다. 이름이나 메모를 바꾸면 홈 hero에도 바로 반영됩니다.
              </Text>
            </View>
          ) : (
            <View style={styles.helperCard}>
              <Text style={styles.helperCardTitle}>현재 준비 중인 휴일로 사용할까요?</Text>
              <Text style={styles.helperCardBody}>
                켜 두면 저장 직후 홈 상단 hero와 다음 행동 CTA가 이 휴일 기준으로 바뀝니다.
              </Text>
              <View style={styles.choiceRow}>
                <TouchableOpacity
                  style={[styles.choiceChip, selectAsCurrentHoliday && styles.choiceChipSelected]}
                  activeOpacity={0.8}
                  onPress={() => setSelectAsCurrentHoliday(true)}
                >
                  <Text
                    style={[
                      styles.choiceChipText,
                      selectAsCurrentHoliday && styles.choiceChipTextSelected,
                    ]}
                  >
                    현재 휴일로 사용
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.choiceChip, !selectAsCurrentHoliday && styles.choiceChipSelected]}
                  activeOpacity={0.8}
                  onPress={() => setSelectAsCurrentHoliday(false)}
                >
                  <Text
                    style={[
                      styles.choiceChipText,
                      !selectAsCurrentHoliday && styles.choiceChipTextSelected,
                    ]}
                  >
                    목록에만 저장
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )
        ) : (
          <View style={styles.helperCard}>
            <Text style={styles.helperCardTitle}>직접 작성한 일정도 함께 보여줍니다</Text>
            <Text style={styles.helperCardBody}>
              Google Calendar 없이도 앱 안에서 일정을 추가해 홈 피드에서 휴일 전후 맥락을 바로 확인할 수 있습니다.
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.bottomBar}>
        {isHoliday ? (
          <>
            <TouchableOpacity
              style={styles.btnPrimary}
              onPress={() => saveEntry({ moveToDecision: true, forceCurrentHoliday: true })}
            >
              <Text style={styles.btnPrimaryText}>저장 후 바로 상태 체크하기</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnSecondary} onPress={() => saveEntry()}>
              <Text style={styles.btnSecondaryText}>저장하고 홈으로</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={styles.btnPrimary} onPress={() => saveEntry()}>
            <Text style={styles.btnPrimaryText}>일정 저장하기</Text>
          </TouchableOpacity>
        )}
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
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  backBtn: { padding: 8, marginLeft: -8 },
  backBtnText: { fontSize: 24, color: colors.textPrimary },
  headerTitle: { fontSize: 17, fontWeight: '600', color: colors.textPrimary },
  content: { flex: 1 },
  contentInner: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 32, gap: 20 },
  heroCard: {
    backgroundColor: '#EEF2E8',
    borderRadius: 26,
    padding: 22,
    ...shadows.sm,
  },
  heroEyebrow: {
    fontSize: 13,
    fontWeight: '700',
    color: '#5B6252',
    marginBottom: 10,
  },
  heroTitle: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 10,
    letterSpacing: -0.6,
  },
  heroBody: {
    fontSize: 15,
    lineHeight: 22,
    color: '#52525B',
  },
  segmentBar: {
    flexDirection: 'row',
    padding: 6,
    borderRadius: 20,
    backgroundColor: '#ECEFF1',
    gap: 8,
  },
  segmentButton: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  segmentButtonSelected: {
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  segmentButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#687076',
  },
  segmentButtonTextSelected: {
    color: colors.textPrimary,
  },
  formGroup: { gap: 10 },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  input: {
    width: '100%',
    paddingVertical: 18,
    paddingHorizontal: 20,
    fontSize: 16,
    fontWeight: '600',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 18,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
  },
  textArea: {
    minHeight: 120,
    textAlignVertical: 'top',
    lineHeight: 22,
  },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  choiceChip: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: colors.badgeBg,
  },
  choiceChipSelected: {
    backgroundColor: colors.primaryAction,
  },
  choiceChipText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  choiceChipTextSelected: {
    color: colors.primaryActionText,
  },
  timeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  timeField: {
    flex: 1,
  },
  helperCard: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    ...shadows.sm,
  },
  helperCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  helperCardBody: {
    fontSize: 14,
    lineHeight: 22,
    color: '#52525B',
    marginBottom: 14,
  },
  bottomBar: {
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 0 : 24,
    paddingTop: 16,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.92)',
    gap: 12,
  },
  btnPrimary: {
    backgroundColor: colors.primaryAction,
    paddingVertical: 18,
    borderRadius: 20,
    alignItems: 'center',
    ...shadows.sm,
  },
  btnPrimaryText: {
    color: colors.primaryActionText,
    fontSize: 17,
    fontWeight: '700',
  },
  btnSecondary: {
    backgroundColor: colors.badgeBg,
    paddingVertical: 18,
    borderRadius: 20,
    alignItems: 'center',
  },
  btnSecondaryText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
});
