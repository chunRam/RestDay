import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Platform, StatusBar, Alert, Modal, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, shadows } from '../theme/theme';
import { useAppStore } from '../store/useAppStore';
import { useAuthStore } from '../store/useAuthStore';
import { useGoogleCalendarAuth } from '../hooks/useGoogleCalendarAuth';
import { auth } from '../firebase/config';
import Constants from 'expo-constants';

export default function SettingsView() {
  const navigation = useNavigation<any>();
  const { reset, clearAllData } = useAppStore();
  const { logout } = useAuthStore();
  const { promptAsync: calendarSync, loading: calendarLoading, isReady: calendarReady } = useGoogleCalendarAuth();
  
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
    Alert.alert('알림', '데이터가 성공적으로 초기화되었습니다.');
  };

  const handleLogout = () => {
    Alert.alert(
      '로그아웃',
      '로그아웃하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        { 
          text: '로그아웃', 
          style: 'destructive',
          onPress: async () => {
            try {
              await logout();
              // Alert.alert('알림', '로그아웃 되었습니다.');
            } catch (error) {
              Alert.alert('오류', '로그아웃 중 문제가 발생했습니다.');
            }
          }
        }
      ]
    );
  };

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
          <TouchableOpacity style={styles.menuItem} onPress={handleLogout}>
            <Text style={styles.menuText}>로그아웃</Text>
            <Text style={styles.arrowIcon}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Calendar Section */}
        <Text style={styles.sectionTitle}>캘린더</Text>
        <View style={styles.card}>
          <TouchableOpacity
            style={[styles.menuItem, { borderBottomWidth: 0 }]}
            onPress={() => calendarSync()}
            disabled={!calendarReady || calendarLoading}
          >
            <Text style={styles.menuText}>{calendarLoading ? '동기화 중...' : 'Google 캘린더 다시 동기화'}</Text>
            {calendarLoading ? (
              <ActivityIndicator size="small" color={colors.textSecondary} />
            ) : (
              <Text style={styles.arrowIcon}>›</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Data Section */}
        <Text style={styles.sectionTitle}>데이터 관리</Text>
        <View style={styles.card}>
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
  arrowIcon: {
    fontSize: 20,
    color: colors.textSecondary,
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
