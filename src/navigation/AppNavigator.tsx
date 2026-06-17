import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, ActivityIndicator } from 'react-native';
import HomeView from '../screens/HomeView';
import RegisterView from '../screens/RegisterView';
import DecisionView from '../screens/DecisionView';
import PlanPreviewView from '../screens/PlanPreviewView';
import ExecutionView from '../screens/ExecutionView';
import SettingsView from '../screens/SettingsView';
import LoginView from '../screens/LoginView';
import SignupView from '../screens/SignupView';
import DevLogsView from '../screens/DevLogsView';
import { useAuthStore } from '../store/useAuthStore';
import { colors } from '../theme/theme';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const { isAuthenticated, loading } = useAuthStore();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primaryAction} />
      </View>
    );
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: '#F8F9FA' },
      }}
    >
      {!isAuthenticated ? (
        <>
          <Stack.Screen name="Login" component={LoginView} />
          <Stack.Screen name="Signup" component={SignupView} />
          <Stack.Screen name="DevLogs" component={DevLogsView} />
        </>
      ) : (
        <>
          <Stack.Screen name="Home" component={HomeView} />
          <Stack.Screen name="Register" component={RegisterView} />
          <Stack.Screen name="Decision" component={DecisionView} />
          <Stack.Screen name="PlanPreview" component={PlanPreviewView} />
          <Stack.Screen name="Execution" component={ExecutionView} />
          <Stack.Screen name="Settings" component={SettingsView} />
          <Stack.Screen name="DevLogs" component={DevLogsView} />
        </>
      )}
    </Stack.Navigator>
  );
}
