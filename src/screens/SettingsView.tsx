import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Platform, StatusBar, Alert, Modal, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, shadows } from '../theme/theme';
import { useAppStore } from '../store/useAppStore';
import { useAuthStore } from '../store/useAuthStore';
import { useGoogleCalendarAuth } from '../hooks/useGoogleCalendarAuth';
import Constants from 'expo-constants';

function formatSyncTime(timestamp: number | null) {
  if (!timestamp) return '아직 없음';

  return new Date(timestamp).toLocaleString();
}

function showAlertMessage(title: string, message: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}\n\n${message}`);
    return;
  }

  Alert.alert(title, message);
}

function confirmAlertAction(
  title: string,
  message: string,
  confirmLabel: string,
  onConfirm: () => void | Promise<void>
) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    if (window.confirm(`${title}\n\n${message}`)) {
      void onConfirm();
    }
    return;
  }

  Alert.alert(title, message, [
    { text: '취소', style: 'cancel' },
    {
      text: confirmLabel,
      style: 'destructive',
      onPress: () => {
        void onConfirm();
      },
    },
  ]);
}

export default function SettingsView() {
  const navigation = useNavigation<any>();
  const { clearAllData, pastHolidays, calendarContext, currentHoliday } = useAppStore();
  const { logout, user, logoutInFlight, logoutError } = useAuthStore();
  const {
    promptAsync: calendarSync,
    loading: calendarLoading,
    isReady: calendarReady,
    disconnectAsync: calendarLogout,
    isCalendarConnected,
    calendarAccountEmail,
    calendarAccountName,
    statusMessage: calendarStatusMessage,
    errorMessage: calendarErrorMessage,
    diagnosticMessage: calendarDiagnosticMessage,
  } = useGoogleCalendarAuth();
  
  const [tapCount, setTapCount] = useState(0);
  const [lastTap, setLastTap] = useState(0);
  const [isResetModalVisible, setResetModalVisible] = useState(false);

  const handleVersionTap = () => {
    const now = Date.now();
    if (now - lastTap < 1000) {
      if (tapCount + 1 >= 5) {
        setTapCount(0);
        navigation.navigate('DevLogs');
      } else {
        setTapCount(tapCount + 1);
      }
    } else {
      setTapCount(1);
    }
    setLastTap(now);
  };

  const handleReset = () => {
    setResetModalVisible(true);
  };

  const confirmReset = async () => {
    setResetModalVisible(false);
    await clearAllData();
    showAlertMessage('알림', '데이터가 성공적으로 초기화되었습니다.');
  };

  const handleLogout = () => {
    confirmAlertAction(
      'RestDay 로그아웃',
      'RestDay 계정에서 로그아웃하고 앱에 남아 있던 로컬 상태를 정리합니다.',
      '로그아웃',
      async () => {
        try {
          await logout();
        } catch (error) {
          const message = error instanceof Error ? error.message : '로그아웃 중 문제가 발생했습니다.';
          showAlertMessage('오류', message);
        }
      }
    );
  };

  const handleCalendarLogout = () => {
    confirmAlertAction(
      'Google Calendar 로그아웃',
      'RestDay 로그인은 유지되고 Google Calendar 연동만 해제됩니다.',
      '연결 해제',
      async () => {
        try {
          await calendarLogout();
        } catch (error) {
          showAlertMessage('오류', 'Google Calendar 로그아웃 중 문제가 발생했습니다.');
        }
      }
    );
  };

  const accountLabel = user?.email ?? user?.displayName ?? '로그인된 RestDay 계정';
  const calendarLabel = calendarAccountEmail ?? calendarAccountName ?? '연결된 Google Calendar 계정 없음';
  const calendarActionLabel = isCalendarConnected ? 'Google 캘린더 다시 동기화' : 'Google Calendar 연결';
  const isCalendarActionDisabled = (!isCalendarConnected && !calendarReady) || calendarLoading || logoutInFlight;
  const detectedHolidayLabel =
    currentHoliday?.source === 'calendar' || currentHoliday?.source === 'weekend'
      ? `${currentHoliday.title} (${currentHoliday.startDate})`
      : currentHoliday?.source === 'manual'
        ? '현재 수동 등록 휴일 유지 중'
        : '아직 없음';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={{ fontSize: 24, color: colors.textPrimary }}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>설정</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        
        {/* Account Section */}
        <Text style={styles.sectionTitle}>계정</Text>
        <View style={styles.card}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>RestDay 계정</Text>
            <Text style={styles.infoValue} numberOfLines={1}>{accountLabel}</Text>
          </View>
          <Text style={styles.helperText}>RestDay 로그아웃은 앱 세션 종료와 로컬 상태 정리를 우선합니다.</Text>
          <TouchableOpacity
            style={[styles.menuItem, logoutInFlight && styles.disabledMenuItem]}
            onPress={handleLogout}
            disabled={logoutInFlight}
          >
            <Text style={styles.menuText}>{logoutInFlight ? '로그아웃 중...' : 'RestDay 로그아웃'}</Text>
            {logoutInFlight ? (
              <ActivityIndicator size="small" color={colors.textSecondary} />
            ) : (
              <Text style={styles.arrowIcon}>›</Text>
            )}
          </TouchableOpacity>
          {logoutError ? (
            <View style={styles.messageContainer}>
              <Text style={styles.errorText}>{logoutError}</Text>
            </View>
          ) : null}
        </View>

        {/* Calendar Section */}
        <Text style={styles.sectionTitle}>캘린더</Text>
        <View style={styles.card}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Google Calendar</Text>
            <Text style={styles.infoValue} numberOfLines={1}>{calendarLabel}</Text>
          </View>
          <View style={styles.syncSummaryBox}>
            <Text style={styles.syncSummaryText}>마지막 동기화: {formatSyncTime(calendarContext?.syncedAt ?? null)}</Text>
            <Text style={styles.syncSummaryText}>가져온 일정 수: {calendarContext?.upcomingEvents.length ?? 0}개</Text>
            <Text style={styles.syncSummaryText}>최근 감지 결과: {detectedHolidayLabel}</Text>
            {calendarContext?.planningSummary ? (
              <Text style={styles.syncSummaryBody}>{calendarContext.planningSummary}</Text>
            ) : null}
          </View>
          <Text style={styles.helperText}>Google Calendar 연동은 RestDay 로그인과 분리되어 동작합니다.</Text>
          <TouchableOpacity
            style={[styles.menuItem, isCalendarActionDisabled && styles.disabledMenuItem]}
            onPress={() => calendarSync()}
            disabled={isCalendarActionDisabled}
          >
            <Text style={styles.menuText}>{calendarLoading ? '처리 중...' : calendarActionLabel}</Text>
            {calendarLoading ? (
              <ActivityIndicator size="small" color={colors.textSecondary} />
            ) : (
              <Text style={styles.arrowIcon}>›</Text>
            )}
          </TouchableOpacity>
          {isCalendarConnected ? (
            <TouchableOpacity
              style={[styles.menuItem, logoutInFlight && styles.disabledMenuItem]}
              onPress={handleCalendarLogout}
              disabled={calendarLoading || logoutInFlight}
            >
              <Text style={styles.menuText}>Google Calendar 연결 해제</Text>
              <Text style={styles.arrowIcon}>›</Text>
            </TouchableOpacity>
          ) : null}
          {calendarStatusMessage ? (
            <View style={styles.messageContainer}>
              <Text style={styles.statusText}>{calendarStatusMessage}</Text>
            </View>
          ) : null}
          {calendarErrorMessage ? (
            <View style={styles.messageContainer}>
              <Text style={styles.errorText}>{calendarErrorMessage}</Text>
            </View>
          ) : null}
          {calendarDiagnosticMessage ? (
            <View style={styles.messageContainer}>
              <Text style={styles.diagnosticText}>{calendarDiagnosticMessage}</Text>
            </View>
          ) : null}
        </View>

        {/* Data Section */}
        <Text style={styles.sectionTitle}>데이터 관리</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('History')}>
            <Text style={styles.menuText}>휴일 기록 보기</Text>
            <Text style={styles.infoValue}>{pastHolidays.length}개</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={handleReset}>
            <Text style={[styles.menuText, { color: '#B42318' }]}>모든 데이터 초기화</Text>
            <Text style={styles.arrowIcon}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Info Section */}
        <Text style={styles.sectionTitle}>앱 정보</Text>
        <View style={styles.card}>
          <TouchableOpacity 
            style={[styles.menuItem, { borderBottomWidth: 0 }]} 
            activeOpacity={1}
            onPress={handleVersionTap}
          >
            <Text style={styles.menuText}>버전 정보</Text>
            <Text style={styles.versionText}>{Constants.expoConfig?.version ? `${Constants.expoConfig.version}-Beta` : '1.0.0-Beta'}</Text>
          </TouchableOpacity>
        </View>

      </View>

      {/* Reset Confirmation Modal */}
      <Modal
        visible={isResetModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setResetModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>데이터 초기화</Text>
            <Text style={styles.modalDescription}>설정된 휴일과 계획 데이터가 모두 삭제됩니다.{'\n'}계속하시겠습니까?</Text>
            <View style={styles.modalButtonContainer}>
              <TouchableOpacity style={styles.modalCancelButton} onPress={() => setResetModalVisible(false)}>
                <Text style={styles.modalCancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirmButton} onPress={confirmReset}>
                <Text style={styles.modalConfirmText}>초기화</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
  },
  backBtn: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    marginBottom: 24,
    ...shadows.sm,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.03)',
    overflow: 'hidden',
  },
  infoRow: {
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: 8,
    backgroundColor: colors.surface,
  },
  helperText: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  syncSummaryBox: {
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
  },
  syncSummaryText: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  syncSummaryBody: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.03)',
  },
  menuText: {
    fontSize: 16,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  disabledMenuItem: {
    opacity: 0.6,
  },
  disabledText: {
    color: colors.textSecondary,
  },
  arrowIcon: {
    fontSize: 20,
    color: colors.textSecondary,
  },
  messageContainer: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: colors.surface,
  },
  statusText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#075985',
    fontWeight: '600',
  },
  errorText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#B42318',
    fontWeight: '600',
  },
  diagnosticText: {
    fontSize: 12,
    lineHeight: 18,
    color: '#7A271A',
  },
  versionText: {
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    ...shadows.md,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 12,
    textAlign: 'center',
  },
  modalDescription: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  modalButtonContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 14,
    backgroundColor: colors.background,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalConfirmButton: {
    flex: 1,
    paddingVertical: 14,
    backgroundColor: '#FEE4E2',
    borderRadius: 12,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  modalConfirmText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#B42318',
  },
});
