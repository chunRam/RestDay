import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { auth } from '../firebase/config';
import { useAppStore } from '../store/useAppStore';
import { Logger } from '../utils/logger';

WebBrowser.maybeCompleteAuthSession();

type GoogleCalendarEvent = {
  id: string;
  summary?: string;
  status?: string;
  eventType?: string;
  htmlLink?: string;
  start?: {
    date?: string;
    dateTime?: string;
  };
  end?: {
    date?: string;
    dateTime?: string;
  };
};

type UseGoogleCalendarAuthOptions = {
  includeCalendarScope?: boolean;
};

type GoogleCalendarListEntry = {
  id: string;
  summary?: string;
  hidden?: boolean;
  selected?: boolean;
  accessRole?: string;
};

type GoogleCalendarListResponse = {
  items?: GoogleCalendarListEntry[];
  nextPageToken?: string;
  error?: {
    code?: number;
    message?: string;
    status?: string;
    errors?: {
      domain?: string;
      reason?: string;
      message?: string;
    }[];
  };
};

type GoogleCalendarEventsResponse = {
  items?: GoogleCalendarEvent[];
  nextPageToken?: string;
  error?: {
    code?: number;
    message?: string;
    status?: string;
    errors?: {
      domain?: string;
      reason?: string;
      message?: string;
    }[];
  };
};

type HolidayCandidate = GoogleCalendarEvent & {
  calendarId: string;
  calendarSummary: string;
  startDate: string;
  score: number;
};

type GoogleCalendarErrorResponse = {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    errors?: {
      domain?: string;
      reason?: string;
      message?: string;
    }[];
  };
};

class GoogleCalendarApiError extends Error {
  status: number;
  reason?: string;
  apiStatus?: string;

  constructor(status: number, message: string, reason?: string, apiStatus?: string) {
    super(message);
    this.name = 'GoogleCalendarApiError';
    this.status = status;
    this.reason = reason;
    this.apiStatus = apiStatus;
  }
}

const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const googleAndroidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
const googleWebRedirectUri = process.env.EXPO_PUBLIC_GOOGLE_WEB_REDIRECT_URI ?? '';
const baseGoogleScopes = ['profile', 'email'];
const calendarScope = 'https://www.googleapis.com/auth/calendar.readonly';
const googleCalendarApiBaseUrl = 'https://www.googleapis.com/calendar/v3';
const holidayKeywords = [
  '휴가',
  '연차',
  '휴일',
  '공휴일',
  '대체휴일',
  '쉬는 날',
  '반차',
  'day off',
  'vacation',
  'holiday',
  'pto',
  'leave',
  'out of office',
  'ooo',
];

function formatLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getNextWeekendHoliday(baseDate = new Date()) {
  const holidayDate = new Date(baseDate);
  const day = holidayDate.getDay();
  const daysUntilWeekend = day === 0 || day === 6 ? 0 : 6 - day;

  holidayDate.setDate(holidayDate.getDate() + daysUntilWeekend);
  holidayDate.setHours(0, 0, 0, 0);

  const dateKey = formatLocalDateKey(holidayDate);
  const title = holidayDate.getDay() === 0 ? '다가오는 일요일' : '다가오는 토요일';

  return {
    id: `weekend:${dateKey}`,
    title,
    startDate: dateKey,
  };
}

function getMissingClientIdMessage() {
  if (Platform.OS === 'web' && !googleWebClientId) {
    return '웹 Google OAuth 클라이언트 ID가 필요합니다.';
  }

  if (Platform.OS === 'ios' && !googleIosClientId) {
    return 'iOS Google OAuth 클라이언트 ID가 필요합니다.';
  }

  if (Platform.OS === 'android' && !googleAndroidClientId) {
    return 'Android Google OAuth 클라이언트 ID가 필요합니다.';
  }

  return null;
}

function getGoogleRedirectUri() {
  if (Platform.OS !== 'web') {
    return undefined;
  }

  if (googleWebRedirectUri) {
    return googleWebRedirectUri;
  }

  if (typeof window !== 'undefined' && window.location.origin) {
    return window.location.origin;
  }

  return undefined;
}

function getErrorCode(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : null;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function getFirebaseDiagnostic(error: unknown) {
  const code = getErrorCode(error);
  const message = getErrorMessage(error);

  return code ? `Firebase Auth 오류: ${code} - ${message}` : `인증 오류: ${message}`;
}

function getGoogleResponseDiagnostic(response: {
  error?: { code?: string | null; message?: string | null } | null;
  errorCode?: string | null;
  params?: Record<string, string>;
}) {
  const code = response.error?.code ?? response.errorCode ?? response.params?.error ?? 'unknown_oauth_error';
  const description =
    response.error?.message ?? response.params?.error_description ?? response.params?.error_subtype ?? '상세 메시지 없음';

  return `Google OAuth 오류: ${code} - ${description}`;
}

function getGoogleApiErrorMessage(status: number, data: GoogleCalendarErrorResponse) {
  const apiError = data.error;
  const firstError = apiError?.errors?.[0];
  const reason = firstError?.reason;
  const apiStatus = apiError?.status;
  const message = apiError?.message ?? firstError?.message ?? 'Google Calendar API 호출에 실패했습니다.';
  const detail = [apiStatus, reason].filter(Boolean).join(' / ');

  return {
    message,
    reason,
    apiStatus,
    diagnostic: `Google Calendar API 오류: HTTP ${status}${detail ? ` (${detail})` : ''} - ${message}`,
  };
}

export function useGoogleCalendarAuth(options: UseGoogleCalendarAuthOptions = {}) {
  const { includeCalendarScope = true } = options;
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [diagnosticMessage, setDiagnosticMessage] = useState<string | null>(null);
  const { setHoliday } = useAppStore();
  const missingClientIdMessage = getMissingClientIdMessage();
  const scopes = includeCalendarScope ? [...baseGoogleScopes, calendarScope] : baseGoogleScopes;
  const redirectUri = getGoogleRedirectUri();

  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: googleWebClientId,
    iosClientId: googleIosClientId ?? googleWebClientId,
    androidClientId: googleAndroidClientId ?? googleWebClientId,
    redirectUri,
    scopes,
    selectAccount: true,
  });

  useEffect(() => {
    if (!request?.redirectUri) {
      return;
    }

    Logger.log('Google OAuth Redirect URI', {
      platform: Platform.OS,
      redirectUri: request.redirectUri,
    });
  }, [request?.redirectUri]);

  useEffect(() => {
    if (response?.type === 'success') {
      const id_token = response.params?.id_token || response.authentication?.idToken;
      const access_token = response.params?.access_token || response.authentication?.accessToken;
      
      const handleAuth = async () => {
        setLoading(true);
        setErrorMessage(null);
        setStatusMessage(null);
        setDiagnosticMessage(null);
        try {
          if (!id_token && !access_token) {
            throw new Error('Google 인증 토큰을 받지 못했습니다.');
          }

          const credential = GoogleAuthProvider.credential(id_token ?? null, access_token ?? null);
          await signInWithCredential(auth, credential);

          if (includeCalendarScope && access_token) {
            await fetchCalendarEvents(access_token);
          }
        } catch (error) {
          Logger.error("Auth or Calendar Fetch failed:", error);
          setDiagnosticMessage(getFirebaseDiagnostic(error));
          setErrorMessage(
            includeCalendarScope
              ? '캘린더 권한이 거부되었거나 동기화에 실패했습니다. 수동으로 휴일을 등록할 수 있습니다.'
              : 'Google 로그인에 실패했습니다.'
          );
        } finally {
          setLoading(false);
        }
      };

      handleAuth();
    } else if (response?.type === 'error') {
      Logger.warn('Google auth response error:', response);
      setStatusMessage(null);
      setDiagnosticMessage(getGoogleResponseDiagnostic(response));
      setErrorMessage(
        includeCalendarScope
          ? '캘린더 권한이 거부되었습니다. 필요하면 다시 Google 캘린더 동기화를 시도해주세요.'
          : 'Google 로그인이 취소되었거나 실패했습니다.'
      );
    }
  }, [includeCalendarScope, response]);

  const fetchGoogleJson = async <T,>(url: string, accessToken: string): Promise<T> => {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();

    if (!res.ok) {
      const { message, reason, apiStatus } = getGoogleApiErrorMessage(res.status, data);
      throw new GoogleCalendarApiError(res.status, message, reason, apiStatus);
    }

    return data;
  };

  const fetchCalendarList = async (accessToken: string) => {
    const calendars: GoogleCalendarListEntry[] = [];
    let pageToken: string | undefined;

    do {
      const params = new URLSearchParams({
        maxResults: '250',
        minAccessRole: 'reader',
        showHidden: 'false',
      });

      if (pageToken) {
        params.set('pageToken', pageToken);
      }

      const data = await fetchGoogleJson<GoogleCalendarListResponse>(
        `${googleCalendarApiBaseUrl}/users/me/calendarList?${params.toString()}`,
        accessToken
      );

      calendars.push(...(data.items ?? []));
      pageToken = data.nextPageToken;
    } while (pageToken);

    return calendars.filter((calendar) => calendar.id && calendar.accessRole !== 'freeBusyReader');
  };

  const fetchEventsForCalendar = async (
    accessToken: string,
    calendar: GoogleCalendarListEntry,
    timeMin: string,
    timeMax: string
  ) => {
    const events: HolidayCandidate[] = [];
    let pageToken: string | undefined;

    do {
      const params = new URLSearchParams({
        timeMin,
        timeMax,
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '2500',
      });

      if (pageToken) {
        params.set('pageToken', pageToken);
      }

      const data = await fetchGoogleJson<GoogleCalendarEventsResponse>(
        `${googleCalendarApiBaseUrl}/calendars/${encodeURIComponent(calendar.id)}/events?${params.toString()}`,
        accessToken
      );

      events.push(
        ...(data.items ?? [])
          .filter((event) => event.status !== 'cancelled')
          .map((event) => ({
            ...event,
            calendarId: calendar.id,
            calendarSummary: calendar.summary ?? calendar.id,
            startDate: getEventStartDate(event),
            score: getHolidayScore(event),
          }))
          .filter((event) => event.startDate && event.score > 0)
      );

      pageToken = data.nextPageToken;
    } while (pageToken);

    return events;
  };

  const getEventStartDate = (event: GoogleCalendarEvent) => {
    return event.start?.date || event.start?.dateTime || '';
  };

  const getHolidayScore = (event: GoogleCalendarEvent) => {
    const title = event.summary?.toLowerCase() ?? '';
    const keywordMatch = holidayKeywords.some((keyword) => title.includes(keyword));
    let score = 0;

    if (keywordMatch) {
      score += 10;
    }

    if (event.eventType === 'outOfOffice') {
      score += 8;
    }

    if (event.start?.date && event.end?.date) {
      score += 3;
    }

    return score;
  };

  const fetchCalendarEvents = async (accessToken: string) => {
    try {
      const timeMin = new Date().toISOString();
      const timeMax = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30일

      setStatusMessage('캘린더 목록을 확인하는 중입니다.');
      setDiagnosticMessage(null);
      const calendars = await fetchCalendarList(accessToken);

      if (calendars.length === 0) {
        setStatusMessage('읽을 수 있는 Google 캘린더가 없습니다. 캘린더 권한 또는 공유 설정을 확인해주세요.');
        return;
      }

      setStatusMessage(`${calendars.length}개 캘린더에서 휴일 후보를 찾는 중입니다.`);
      const eventGroups = await Promise.all(
        calendars.map((calendar) => fetchEventsForCalendar(accessToken, calendar, timeMin, timeMax))
      );
      const holidayEvents = eventGroups
        .flat()
        .sort((a, b) => {
          if (b.score !== a.score) {
            return b.score - a.score;
          }

          return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
        });
      
      const holidayEvent = holidayEvents[0];

      if (holidayEvent) {
        setHoliday({
          id: `${holidayEvent.calendarId}:${holidayEvent.id}`,
          title: holidayEvent.summary ?? `${holidayEvent.calendarSummary} 휴일`,
          startDate: holidayEvent.startDate,
        });
        setStatusMessage(`${holidayEvents.length}개 휴일 후보 중 가장 가까운 일정을 등록했습니다.`);
        return;
      }

      const weekendHoliday = getNextWeekendHoliday();
      setHoliday(weekendHoliday);
      setStatusMessage(
        `${calendars.length}개 캘린더를 확인했지만 후보가 없어 가장 가까운 주말을 등록했습니다.`
      );
    } catch (e) {
      Logger.warn("Calendar API Error:", e);
      setStatusMessage(null);
      setDiagnosticMessage(
        e instanceof GoogleCalendarApiError
          ? `Google Calendar API 오류: HTTP ${e.status}${e.apiStatus ? ` (${e.apiStatus})` : ''}${e.reason ? ` / ${e.reason}` : ''} - ${e.message}`
          : `Google Calendar API 호출 예외: ${getErrorMessage(e)}`
      );
      setErrorMessage(
        e instanceof GoogleCalendarApiError && (e.status === 401 || e.status === 403)
          ? 'Google Calendar 권한이 없거나 만료되었습니다. 다시 동기화를 시도해주세요.'
          : 'Google Calendar API 호출에 실패했습니다. 콘솔에서 Calendar API 활성화와 OAuth 설정을 확인해주세요.'
      );
    }
  };

  return {
    promptAsync: () => {
      if (missingClientIdMessage) {
        setStatusMessage(null);
        setDiagnosticMessage(`환경 변수 누락: ${missingClientIdMessage}`);
        setErrorMessage(missingClientIdMessage);
        return Promise.resolve({ type: 'dismiss' } as const);
      }

      return promptAsync();
    },
    loading,
    isReady: !!request && !missingClientIdMessage,
    errorMessage,
    statusMessage,
    diagnosticMessage,
  };
}
