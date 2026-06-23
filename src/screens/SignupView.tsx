import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, shadows } from '../theme/theme';
import { useAuthStore } from '../store/useAuthStore';
import { useGoogleCalendarAuth } from '../hooks/useGoogleCalendarAuth';

type AuthMode = 'signup' | 'login';

export default function SignupView() {
  const navigation = useNavigation<any>();
  const { signupWithEmail, loginWithEmail, authActionLoading } = useAuthStore();
  useGoogleCalendarAuth({ includeCalendarScope: false });
  const [mode, setMode] = useState<AuthMode>('signup');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isSignup = mode === 'signup';
  const canSubmit = useMemo(() => {
    const hasRequiredFields = email.trim().length > 0 && password.length > 0;
    return isSignup ? hasRequiredFields && passwordConfirm.length > 0 : hasRequiredFields;
  }, [email, isSignup, password, passwordConfirm]);

  const switchMode = () => {
    setErrorMessage(null);
    setMode(isSignup ? 'login' : 'signup');
  };

  const validateForm = () => {
    if (!email.trim() || !password) {
      return '이메일과 비밀번호를 입력해주세요.';
    }

    if (!email.includes('@')) {
      return '이메일 형식을 확인해주세요.';
    }

    if (password.length < 6) {
      return '비밀번호는 6자 이상으로 입력해주세요.';
    }

    if (isSignup && password !== passwordConfirm) {
      return '비밀번호 확인이 일치하지 않습니다.';
    }

    return null;
  };

  const handleSubmit = async () => {
    const validationMessage = validateForm();
    if (validationMessage) {
      setErrorMessage(validationMessage);
      return;
    }

    setErrorMessage(null);

    try {
      if (isSignup) {
        await signupWithEmail(email, password, displayName);
      } else {
        await loginWithEmail(email, password);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '인증 처리 중 문제가 발생했습니다.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardView}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backBtnText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{isSignup ? '회원가입' : '이메일 로그인'}</Text>
          <View style={{ width: 44 }} />
        </View>

        <View style={styles.content}>
          <View>
            <Text style={styles.title}>{isSignup ? '이메일로 시작하기' : '이메일로 계속하기'}</Text>
            <Text style={styles.subtitle}>
              Google 계정 없이도 RestDay 계정을 만들고 휴일 계획을 저장할 수 있습니다.
            </Text>
          </View>

          <View style={styles.form}>
            {isSignup && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>이름</Text>
                <TextInput
                  style={styles.input}
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="표시할 이름"
                  placeholderTextColor={colors.textSecondary}
                  autoCapitalize="words"
                  editable={!authActionLoading}
                />
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>이메일</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="name@example.com"
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                keyboardType="email-address"
                editable={!authActionLoading}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>비밀번호</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="6자 이상"
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete={isSignup ? 'new-password' : 'password'}
                secureTextEntry
                editable={!authActionLoading}
              />
            </View>

            {isSignup && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>비밀번호 확인</Text>
                <TextInput
                  style={styles.input}
                  value={passwordConfirm}
                  onChangeText={setPasswordConfirm}
                  placeholder="비밀번호 재입력"
                  placeholderTextColor={colors.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  secureTextEntry
                  editable={!authActionLoading}
                />
              </View>
            )}

            {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
          </View>
        </View>

        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[styles.primaryBtn, (!canSubmit || authActionLoading) && styles.disabledBtn]}
            activeOpacity={0.85}
            onPress={handleSubmit}
            disabled={!canSubmit || authActionLoading}
          >
            {authActionLoading ? (
              <ActivityIndicator color={colors.primaryActionText} />
            ) : (
              <Text style={styles.primaryBtnText}>{isSignup ? '회원가입 완료' : '로그인'}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.switchBtn} onPress={switchMode} disabled={authActionLoading}>
            <Text style={styles.switchText}>
              {isSignup ? '이미 계정이 있다면 로그인' : '새 계정 만들기'}
            </Text>
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
  keyboardView: {
    flex: 1,
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
  backBtnText: {
    fontSize: 24,
    color: colors.textPrimary,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 40,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  form: {
    marginTop: 36,
    gap: 18,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.surface,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 16,
    color: colors.textPrimary,
  },
  errorText: {
    color: '#B42318',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  bottomBar: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 20 : 28,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
  },
  primaryBtn: {
    backgroundColor: colors.primaryAction,
    paddingVertical: 18,
    borderRadius: 20,
    alignItems: 'center',
    ...shadows.sm,
  },
  disabledBtn: {
    opacity: 0.55,
  },
  primaryBtnText: {
    color: colors.primaryActionText,
    fontSize: 17,
    fontWeight: '700',
  },
  switchBtn: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  switchText: {
    fontSize: 14,
    color: colors.textPrimary,
    fontWeight: '700',
  },
});
