import React, { useState } from 'react';
import { TextInput, View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Platform, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, shadows } from '../theme/theme';
import { useAppStore } from '../store/useAppStore';
import CalendarPicker from '../components/CalendarPicker';

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

export default function RegisterView() {
  const navigation = useNavigation<any>();
  const { setHoliday } = useAppStore();
  const [date, setDate] = useState(getDefaultHolidayDate());
  const [title, setTitle] = useState('쉬는 날');
  const [note, setNote] = useState('');

  const handleSave = () => {
    setHoliday({
      id: `manual:${date}:${Date.now()}`,
      title: title.trim() || '쉬는 날',
      startDate: date,
      note: note.trim(),
      source: 'manual',
    });

    navigation.navigate('Decision');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>휴일 등록</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} keyboardShouldPersistTaps="handled">
        <Text style={styles.titleLarge}>준비할 휴일을{'\n'}정해주세요.</Text>
        <Text style={styles.textBody}>정확한 캘린더 연동보다, 먼저 준비할 하루를 정하는 것이 중요합니다.</Text>
        
        <View style={styles.formGroup}>
          <Text style={styles.label}>휴일 날짜</Text>
          <CalendarPicker
            selectedDate={date}
            onSelectDate={setDate}
            minDate={getTodayKey()}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>이 날의 이름</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="예: 연차, 쉬는 날, 비어 있는 토요일"
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>신경 쓰이는 것</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={note}
            onChangeText={setNote}
            placeholder="예: 밀린 집안일, 컨디션, 약속, 돈"
            placeholderTextColor={colors.textSecondary}
            multiline
          />
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.btnPrimary} onPress={handleSave}>
          <Text style={styles.btnPrimaryText}>상태 체크로 이동</Text>
        </TouchableOpacity>
      </View>
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
  content: { flex: 1 },
  contentInner: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 },
  titleLarge: { fontSize: 28, fontWeight: '700', color: colors.textPrimary, marginBottom: 12, letterSpacing: -0.5 },
  textBody: { fontSize: 16, color: colors.textSecondary, lineHeight: 24, marginBottom: 28 },
  formGroup: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
  input: {
    width: '100%', paddingVertical: 20, paddingHorizontal: 24, fontSize: 18, fontWeight: '600',
    borderWidth: 2, borderColor: colors.border, borderRadius: 20, backgroundColor: colors.surface,
    color: colors.textPrimary
  },
  textArea: {
    minHeight: 120,
    textAlignVertical: 'top',
    fontSize: 16,
    lineHeight: 22,
  },
  bottomBar: {
    paddingHorizontal: 24, paddingBottom: Platform.OS === 'ios' ? 0 : 24, paddingTop: 16,
    backgroundColor: 'rgba(255,255,255,0.85)', borderTopWidth: 0.5, borderTopColor: colors.border
  },
  btnPrimary: {
    backgroundColor: colors.primaryAction, paddingVertical: 18, borderRadius: 20, alignItems: 'center', ...shadows.sm
  },
  btnPrimaryText: { color: colors.primaryActionText, fontSize: 17, fontWeight: '600' }
});
