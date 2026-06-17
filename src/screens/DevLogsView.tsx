import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, FlatList, Platform, StatusBar, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, shadows } from '../theme/theme';
import { Logger, LogEntry } from '../utils/logger';

export default function DevLogsView() {
  const navigation = useNavigation<any>();
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const fetchLogs = async () => {
    const fetchedLogs = await Logger.getLogs();
    // 최신 로그가 맨 위에 오도록 역순으로 정렬
    setLogs(fetchedLogs.reverse());
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const handleClear = () => {
    Alert.alert(
      '로그 초기화',
      '모든 내부 로그를 삭제하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        { 
          text: '초기화', 
          style: 'destructive',
          onPress: async () => {
            await Logger.clearLogs();
            setLogs([]);
          }
        }
      ]
    );
  };

  const renderLogItem = ({ item }: { item: LogEntry }) => {
    const isError = item.level === 'ERROR';
    const isWarn = item.level === 'WARN';

    return (
      <View style={[styles.logItem, isError && styles.logItemError, isWarn && styles.logItemWarn]}>
        <View style={styles.logHeader}>
          <Text style={[styles.logLevel, isError && { color: '#B42318' }, isWarn && { color: '#F79009' }]}>
            [{item.level}]
          </Text>
          <Text style={styles.logTime}>{new Date(item.timestamp).toLocaleString()}</Text>
        </View>
        <Text style={styles.logMessage}>{item.message}</Text>
        {item.details && (
          <Text style={styles.logDetails}>{item.details}</Text>
        )}
      </View>
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
        <Text style={styles.headerTitle}>개발자 로그 (최대 500개)</Text>
        <TouchableOpacity onPress={handleClear} style={styles.clearBtn}>
          <Text style={styles.clearBtnText}>초기화</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={logs}
        keyExtractor={(item) => item.id}
        renderItem={renderLogItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>기록된 로그가 없습니다.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F4F7', // 좀 더 개발자 도구스러운 배경색
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 20 : 0,
    paddingBottom: 12,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  clearBtn: {
    padding: 8,
    marginRight: -8,
  },
  clearBtnText: {
    fontSize: 14,
    color: '#B42318',
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  logItem: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    ...shadows.sm,
    borderLeftWidth: 4,
    borderLeftColor: '#4285F4',
  },
  logItemError: {
    borderLeftColor: '#B42318',
    backgroundColor: '#FEF3F2',
  },
  logItemWarn: {
    borderLeftColor: '#F79009',
    backgroundColor: '#FFFAEB',
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  logLevel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#4285F4',
  },
  logTime: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  logMessage: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  logDetails: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#475467',
    backgroundColor: 'rgba(0,0,0,0.03)',
    padding: 8,
    borderRadius: 6,
    marginTop: 4,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: colors.textSecondary,
  }
});
