import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Platform, StatusBar, ActivityIndicator } from 'react-native';
import { colors, shadows } from '../theme/theme';
import { useGoogleCalendarAuth } from '../hooks/useGoogleCalendarAuth';

import { useNavigation } from '@react-navigation/native';

export default function LoginView() {
  const navigation = useNavigation<any>();
  const { promptAsync, loading, isReady, errorMessage, diagnosticMessage } = useGoogleCalendarAuth({
    includeCalendarScope: false,
  });
  
  const [tapCount, setTapCount] = useState(0);
  const [lastTap, setLastTap] = useState(0);

  const handleLogoTap = () => {
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

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      
      <View style={styles.content}>
        <View style={styles.heroSection}>
          <TouchableOpacity activeOpacity={1} onPress={handleLogoTap}>
            <Text style={styles.logo}>RestDay</Text>
          </TouchableOpacity>
          <Text style={styles.title}>
            나만의 완벽한{'\n'}휴일 계획
          </Text>
          <Text style={styles.subtitle}>
            구글 캘린더와 연동하여 다가오는 휴일을 파악하고,{'\n'}알차게 쉴 수 있도록 계획을 세워보세요.
          </Text>
        </View>

        <View style={styles.bottomSection}>
          {errorMessage && (
            <Text style={styles.errorText}>{errorMessage}</Text>
          )}
          {diagnosticMessage && (
            <Text style={styles.diagnosticText}>{diagnosticMessage}</Text>
          )}
          
          <TouchableOpacity 
            style={[styles.googleBtn, (!isReady || loading) && { opacity: 0.7 }]} 
            activeOpacity={0.8}
            onPress={() => promptAsync()}
            disabled={!isReady || loading}
          >
            {loading ? (
              <ActivityIndicator color="#000000" />
            ) : (
              <Text style={styles.googleBtnText}>G  Google계정으로 시작하기</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.emailBtn}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('Signup')}
          >
            <Text style={styles.emailBtnText}>이메일로 회원가입</Text>
          </TouchableOpacity>
          
          <Text style={styles.termsText}>
            로그인함으로써 이용약관 및 개인정보처리방침에 동의합니다.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
    paddingTop: 80,
    paddingBottom: Platform.OS === 'ios' ? 20 : 40,
  },
  heroSection: {
    flex: 1,
  },
  logo: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.primaryAction,
    marginBottom: 40,
    letterSpacing: -0.5,
  },
  title: {
    fontSize: 40,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 48,
    letterSpacing: -1,
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 24,
    letterSpacing: -0.3,
  },
  bottomSection: {
    width: '100%',
  },
  googleBtn: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 18,
    borderRadius: 20,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    ...shadows.sm,
  },
  googleBtnText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '600',
  },
  emailBtn: {
    backgroundColor: colors.primaryAction,
    paddingVertical: 18,
    borderRadius: 20,
    alignItems: 'center',
    marginBottom: 16,
    ...shadows.sm,
  },
  emailBtnText: {
    color: colors.primaryActionText,
    fontSize: 16,
    fontWeight: '700',
  },
  termsText: {
    textAlign: 'center',
    fontSize: 12,
    color: colors.textSecondary,
    opacity: 0.8,
  },
  errorText: {
    color: '#B42318',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
  },
  diagnosticText: {
    color: '#7A271A',
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 12,
  }
});
