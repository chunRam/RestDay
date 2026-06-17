import AsyncStorage from '@react-native-async-storage/async-storage';

export type LogLevel = 'INFO' | 'ERROR' | 'WARN';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
  details?: string;
}

const LOG_STORAGE_KEY = '@app_internal_logs';
const MAX_LOGS = 500;

class LoggerService {
  private async getStoredLogs(): Promise<LogEntry[]> {
    try {
      const stored = await AsyncStorage.getItem(LOG_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      console.warn('Failed to parse logs from AsyncStorage', e);
      return [];
    }
  }

  private async saveLogs(logs: LogEntry[]) {
    try {
      // 500개가 넘으면 가장 앞쪽(오래된 것)을 자릅니다.
      if (logs.length > MAX_LOGS) {
        logs = logs.slice(logs.length - MAX_LOGS);
      }
      await AsyncStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(logs));
    } catch (e) {
      console.warn('Failed to save logs to AsyncStorage', e);
    }
  }

  private async addLog(level: LogLevel, message: string, details?: any) {
    const newLog: LogEntry = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      level,
      message,
      details: details ? (typeof details === 'object' ? JSON.stringify(details, null, 2) : String(details)) : undefined,
    };

    // 개발 중에는 콘솔에도 찍어줍니다.
    if (level === 'ERROR') {
      console.error(`[${level}] ${message}`, details || '');
    } else if (level === 'WARN') {
      console.warn(`[${level}] ${message}`, details || '');
    } else {
      console.log(`[${level}] ${message}`, details || '');
    }

    const currentLogs = await this.getStoredLogs();
    currentLogs.push(newLog);
    await this.saveLogs(currentLogs);
  }

  log(message: string, details?: any) {
    this.addLog('INFO', message, details);
  }

  error(message: string, details?: any) {
    this.addLog('ERROR', message, details);
  }

  warn(message: string, details?: any) {
    this.addLog('WARN', message, details);
  }

  async getLogs(): Promise<LogEntry[]> {
    return await this.getStoredLogs();
  }

  async clearLogs(): Promise<void> {
    await AsyncStorage.removeItem(LOG_STORAGE_KEY);
  }
}

export const Logger = new LoggerService();
