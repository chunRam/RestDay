import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { auth } from '../firebase/config';
import { useAppStore, type CalendarPlanningEvent, type Holiday } from '../store/useAppStore';
import { useGoogleCalendarStore } from '../store/useGoogleCalendarStore';
import {
  baseGoogleScopes,
  calendarScope,
  clearGoogleWebAuthCallbackFromCurrentUrl,
  clearPendingGoogleAuthMode,
  getGoogleWebAuthCallbackFromCurrentUrl,
  getGoogleRedirectUri,
  getPendingGoogleAuthMode,
  getMissingGoogleClientIdMessage,
  googleAndroidClientId,
  googleIosClientId,
  googleWebClientId,
  setPendingGoogleAuthMode,
} from '../utils/googleAuth';
import { Logger } from '../utils/logger';

const maybeCompleteAuthSessionResult = WebBrowser.maybeCompleteAuthSession(
  Platform.OS === 'web' ? { skipRedirectCheck: true } : undefined
);

if (Platform.OS === 'web' && maybeCompleteAuthSessionResult.type === 'failed') {
  Logger.warn('Google auth popup completion check failed', maybeCompleteAuthSessionResult.message);
}

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

type CalendarApiEvent = GoogleCalendarEvent & {
  calendarId: string;
  calendarSummary: string;
  startValue: string;
  endValue: string | null;
  isAllDay: boolean;
  score: number;
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

type HolidayCandidate = CalendarApiEvent & {
  startDate: string;
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

function formatShortDate(value: string, isAllDay: boolean) {
  const date = isAllDay ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.slice(5, 10).replace('-', '/');
  }

  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatShortTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function getEventDateKey(event: Pick<CalendarPlanningEvent, 'start' | 'isAllDay'>) {
  if (event.isAllDay) {
    return event.start.slice(0, 10);
  }

  const date = new Date(event.start);
  if (Number.isNaN(date.getTime())) {
    return event.start.slice(0, 10);
  }

  return formatLocalDateKey(date);
}

function getNextWeekendHoliday(baseDate = new Date()): Holiday {
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
    source: 'weekend',
  };
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

function getEventStartDate(event: GoogleCalendarEvent) {
  return event.start?.date || event.start?.dateTime || '';
}

function getEventEndDate(event: GoogleCalendarEvent) {
  return event.end?.date || event.end?.dateTime || null;
}

function getHolidayScore(event: GoogleCalendarEvent) {
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
}

function buildPlanningEvent(event: CalendarApiEvent): CalendarPlanningEvent {
  return {
    id: `${event.calendarId}:${event.id}`,
    title: event.summary?.trim() || event.calendarSummary,
    start: event.startValue,
    end: event.endValue,
    isAllDay: event.isAllDay,
    calendarId: event.calendarId,
    calendarSummary: event.calendarSummary,
  };
}

function getBusySlotLabels(events: CalendarPlanningEvent[]) {
  const labels = new Set<string>();

  events.forEach((event) => {
    if (event.isAllDay) return;

    const start = new Date(event.start);
    if (Number.isNaN(start.getTime())) return;

    const hour = start.getHours();
    if (hour < 12) {
      labels.add('오전');
      return;
    }
    if (hour < 18) {
      labels.add('오후');
      return;
    }
    labels.add('저녁');
  });

  return Array.from(labels);
}

function buildPlanningSummary(upcomingEvents: CalendarPlanningEvent[], currentHoliday: Holiday | null) {
  if (upcomingEvents.length === 0) {
    return '향후 14일 일정이 비어 있습니다.';
  }

  const relevantHolidayEvents = currentHoliday
    ? upcomingEvents.filter((event) => getEventDateKey(event) === currentHoliday.startDate)
    : [];
  const eventPreview = (relevantHolidayEvents.length > 0 ? relevantHolidayEvents : upcomingEvents)
    .slice(0, 5)
    .map((event) => {
      const dateLabel = formatShortDate(event.start, event.isAllDay);
      return event.isAllDay
        ? `${dateLabel} 종일 ${event.title}`
        : `${dateLabel} ${formatShortTime(event.start)} ${event.title}`;
    })
    .join(' / ');

  if (!currentHoliday) {
    return `가까운 일정 ${Math.min(upcomingEvents.length, 5)}개: ${eventPreview}`;
  }

  if (relevantHolidayEvents.length === 0) {
    return `${currentHoliday.startDate}에는 겹치는 일정이 없습니다. 가까운 일정: ${eventPreview}`;
  }

  const busySlots = getBusySlotLabels(relevantHolidayEvents);
  const busyText =
    busySlots.length > 0
      ? `${busySlots.join(', ')} 시간대 일정 전후는 여유를 두는 편이 좋습니다.`
      : '종일 일정 위주라 세부 시간 충돌은 적습니다.';

  return `${currentHoliday.startDate}에는 ${relevantHolidayEvents.length}개 일정이 있습니다. ${busyText} 가까운 일정: ${eventPreview}`;
}

export function useGoogleCalendarAuth(options: UseGoogleCalendarAuthOptions = {}) {
  const { includeCalendarScope = true } = options;
  const authMode = includeCalendarScope ? 'calendar' : 'login';
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [diagnosticMessage, setDiagnosticMessage] = useState<string | null>(null);
  const handledWebCallbackRef = useRef<string | null>(null);
  const currentHoliday = useAppStore((state) => state.currentHoliday);
  const setHoliday = useAppStore((state) => state.setHoliday);
  const setCalendarContext = useAppStore((state) => state.setCalendarContext);
  const setCalendarSession = useGoogleCalendarStore((state) => state.setSession);
  const clearCalendarSession = useGoogleCalendarStore((state) => state.clearSession);
  const disconnectCalendarSession = useGoogleCalendarStore((state) => state.disconnect);
  const isCalendarConnected = useGoogleCalendarStore((state) => state.isConnected);
  const calendarAccountEmail = useGoogleCalendarStore((state) => state.accountEmail);
  const calendarAccountName = useGoogleCalendarStore((state) => state.accountName);
  const missingClientIdMessage = getMissingGoogleClientIdMessage();
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

  const handleAuthCompletion = async ({
    accessToken,
    expiresIn,
    idToken,
    issuedAt,
    source,
  }: {
    accessToken: string | null;
    expiresIn?: number | null;
    idToken: string | null;
    issuedAt?: number | null;
    source: 'response' | 'web_callback';
  }) => {
    setLoading(true);
    setErrorMessage(null);
    setStatusMessage(null);
    setDiagnosticMessage(null);

    try {
      if (!accessToken && !idToken) {
        throw new Error('Google 인증 토큰을 받지 못했습니다.');
      }

      if (includeCalendarScope) {
        if (!accessToken) {
          throw new Error('Google Calendar 접근 토큰을 받지 못했습니다.');
        }

        let profile: Record<string, unknown> = {};
        try {
          profile = await AuthSession.fetchUserInfoAsync({ accessToken }, Google.discovery);
        } catch (error) {
          Logger.warn('Failed to fetch Google user profile:', error);
        }

        setCalendarSession({
          accessToken,
          refreshToken: null,
          expiresIn: typeof expiresIn === 'number' ? expiresIn : null,
          issuedAt: typeof issuedAt === 'number' ? issuedAt : Math.floor(Date.now() / 1000),
          accountEmail: typeof profile.email === 'string' ? profile.email : null,
          accountName: typeof profile.name === 'string' ? profile.name : null,
          accountPhotoUrl: typeof profile.picture === 'string' ? profile.picture : null,
          connectedAt: Date.now(),
          forceAccountSelectionOnNextConnect: false,
        });
        await fetchCalendarEvents(accessToken);
        clearPendingGoogleAuthMode();
        if (source === 'web_callback') {
          clearGoogleWebAuthCallbackFromCurrentUrl();
        }
        return;
      }

      const credential = GoogleAuthProvider.credential(idToken ?? null, accessToken ?? null);
      await signInWithCredential(auth, credential);
      clearPendingGoogleAuthMode();
      if (source === 'web_callback') {
        clearGoogleWebAuthCallbackFromCurrentUrl();
      }
    } catch (error) {
      Logger.error('Auth or Calendar Fetch failed:', error);
      setDiagnosticMessage(
        includeCalendarScope
          ? `Google Calendar 연동 오류: ${getErrorMessage(error)}`
          : getFirebaseDiagnostic(error)
      );
      setErrorMessage(
        includeCalendarScope
          ? '캘린더 권한이 거부되었거나 동기화에 실패했습니다. 수동으로 휴일을 등록할 수 있습니다.'
          : 'Google 로그인에 실패했습니다.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (response?.type === 'success') {
      void handleAuthCompletion({
        accessToken: response.params?.access_token || response.authentication?.accessToken || null,
        expiresIn: typeof response.authentication?.expiresIn === 'number' ? response.authentication.expiresIn : null,
        idToken: response.params?.id_token || response.authentication?.idToken || null,
        issuedAt: typeof response.authentication?.issuedAt === 'number' ? response.authentication.issuedAt : null,
        source: 'response',
      });
    } else if (response?.type === 'error') {
      Logger.warn('Google auth response error:', response);
      clearPendingGoogleAuthMode();
      setStatusMessage(null);
      setDiagnosticMessage(getGoogleResponseDiagnostic(response));
      setErrorMessage(
        includeCalendarScope
          ? '캘린더 권한이 거부되었습니다. 필요하면 다시 Google 캘린더 동기화를 시도해주세요.'
          : 'Google 로그인이 취소되었거나 실패했습니다.'
      );
    }
  }, [includeCalendarScope, response]);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      return;
    }

    const callback = getGoogleWebAuthCallbackFromCurrentUrl();
    if (!callback) {
      return;
    }

    const pendingMode = getPendingGoogleAuthMode();
    if (pendingMode && pendingMode !== authMode) {
      return;
    }

    if (handledWebCallbackRef.current === callback.rawCallbackUrl) {
      return;
    }

    handledWebCallbackRef.current = callback.rawCallbackUrl;

    if (callback.error) {
      Logger.warn('Google auth callback returned an error on web', callback);
      clearPendingGoogleAuthMode();
      clearGoogleWebAuthCallbackFromCurrentUrl();
      setStatusMessage(null);
      setDiagnosticMessage(getGoogleResponseDiagnostic({
        params: {
          error: callback.error,
          error_description: callback.errorDescription ?? '',
        },
      }));
      setErrorMessage(
        includeCalendarScope
          ? '캘린더 권한이 거부되었습니다. 필요하면 다시 Google 캘린더 동기화를 시도해주세요.'
          : 'Google 로그인이 취소되었거나 실패했습니다.'
      );
      return;
    }

    Logger.log('Recovering Google auth result from web callback URL', {
      authMode,
      callbackUrl: callback.rawCallbackUrl,
      pendingMode,
    });

    void handleAuthCompletion({
      accessToken: callback.accessToken,
      expiresIn: callback.expiresIn,
      idToken: callback.idToken,
      issuedAt: Math.floor(Date.now() / 1000),
      source: 'web_callback',
    });
  }, [authMode, includeCalendarScope]);

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
    const events: CalendarApiEvent[] = [];
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
          .map((event) => {
            const startValue = getEventStartDate(event);
            return {
              ...event,
              calendarId: calendar.id,
              calendarSummary: calendar.summary ?? calendar.id,
              startValue,
              endValue: getEventEndDate(event),
              isAllDay: !!event.start?.date,
              score: getHolidayScore(event),
            };
          })
          .filter((event) => !!event.startValue)
      );

      pageToken = data.nextPageToken;
    } while (pageToken);

    return events;
  };

  const fetchCalendarEvents = async (accessToken: string) => {
    try {
      const timeMin = new Date().toISOString();
      const timeMax = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

      setStatusMessage('캘린더 목록과 일정 요약을 확인하는 중입니다.');
      setDiagnosticMessage(null);
      const calendars = await fetchCalendarList(accessToken);

      if (calendars.length === 0) {
        setCalendarContext({
          source: 'google',
          syncedAt: Date.now(),
          upcomingEvents: [],
          planningSummary: '읽을 수 있는 Google 캘린더가 없습니다.',
        });
        setStatusMessage('읽을 수 있는 Google 캘린더가 없습니다. 캘린더 권한 또는 공유 설정을 확인해주세요.');
        return;
      }

      const eventGroups = await Promise.all(
        calendars.map((calendar) => fetchEventsForCalendar(accessToken, calendar, timeMin, timeMax))
      );
      const allEvents = eventGroups
        .flat()
        .sort((a, b) => new Date(a.startValue).getTime() - new Date(b.startValue).getTime());
      const upcomingEvents = allEvents.map(buildPlanningEvent);
      const planningSummary = buildPlanningSummary(upcomingEvents, currentHoliday);
      const holidayEvents: HolidayCandidate[] = allEvents
        .filter((event) => event.score > 0)
        .map((event) => ({
          ...event,
          startDate: event.isAllDay ? event.startValue.slice(0, 10) : formatLocalDateKey(new Date(event.startValue)),
        }))
        .sort((a, b) => {
          if (b.score !== a.score) {
            return b.score - a.score;
          }

          return new Date(a.startValue).getTime() - new Date(b.startValue).getTime();
        });

      setCalendarContext({
        source: 'google',
        syncedAt: Date.now(),
        upcomingEvents,
        planningSummary,
      });

      const shouldReplaceCurrentHoliday =
        !currentHoliday || currentHoliday.source === 'calendar' || currentHoliday.source === 'weekend';
      const holidayEvent = holidayEvents[0];
      let holidayStatus = '';

      if (holidayEvent) {
        const detectedHoliday: Holiday = {
          id: `${holidayEvent.calendarId}:${holidayEvent.id}`,
          title: holidayEvent.summary ?? `${holidayEvent.calendarSummary} 휴일`,
          startDate: holidayEvent.startDate,
          source: 'calendar',
        };

        if (shouldReplaceCurrentHoliday) {
          setHoliday(detectedHoliday);
          holidayStatus = `휴일 후보 ${holidayEvents.length}개 중 가장 가까운 일정 "${detectedHoliday.title}"을 현재 휴일로 등록했습니다.`;
        } else {
          holidayStatus = `휴일 후보 ${holidayEvents.length}개를 찾았지만 현재 수동 휴일은 유지했습니다.`;
        }
      } else {
        const weekendHoliday = getNextWeekendHoliday();
        if (shouldReplaceCurrentHoliday) {
          setHoliday(weekendHoliday);
          holidayStatus = '휴일 후보가 없어 가장 가까운 주말을 현재 휴일로 등록했습니다.';
        } else {
          holidayStatus = '휴일 후보가 없어도 현재 수동 휴일은 유지했습니다.';
        }
      }

      setStatusMessage(`Google Calendar 일정 ${upcomingEvents.length}개를 동기화했습니다. ${holidayStatus}`);
      Logger.log('Google Calendar sync completed', {
        upcomingEventCount: upcomingEvents.length,
        holidayCandidateCount: holidayEvents.length,
        preservedManualHoliday: !shouldReplaceCurrentHoliday,
      });
    } catch (error) {
      Logger.warn('Calendar API Error:', error);
      if (error instanceof GoogleCalendarApiError && (error.status === 401 || error.status === 403)) {
        clearCalendarSession();
        setCalendarContext(null);
      }
      setStatusMessage(null);
      setDiagnosticMessage(
        error instanceof GoogleCalendarApiError
          ? `Google Calendar API 오류: HTTP ${error.status}${error.apiStatus ? ` (${error.apiStatus})` : ''}${error.reason ? ` / ${error.reason}` : ''} - ${error.message}`
          : `Google Calendar API 호출 예외: ${getErrorMessage(error)}`
      );
      setErrorMessage(
        error instanceof GoogleCalendarApiError && (error.status === 401 || error.status === 403)
          ? 'Google Calendar 권한이 없거나 만료되었습니다. 다시 동기화를 시도해주세요.'
          : 'Google Calendar API 호출에 실패했습니다. 콘솔에서 Calendar API 활성화와 OAuth 설정을 확인해주세요.'
      );
    }
  };

  const disconnectAsync = async () => {
    setLoading(true);
    setErrorMessage(null);
    setDiagnosticMessage(null);
    setStatusMessage(null);

    try {
      const result = await disconnectCalendarSession();
      setCalendarContext(null);

      if (result.revokeErrorMessage) {
        setStatusMessage('Google Calendar 연동이 해제되었습니다. (원격 토큰 해제는 완료되지 않았습니다)');
        setDiagnosticMessage(`토큰 해제 경고: ${result.revokeErrorMessage}`);
      } else {
        setStatusMessage('Google Calendar 계정에서 로그아웃했습니다.');
      }
    } catch (error) {
      Logger.error('Google Calendar disconnect failed:', error);
      // disconnect의 finally에서 clearSession이 호출되므로 세션은 이미 정리됨
      // 하지만 calendarContext도 확실하게 초기화
      setCalendarContext(null);
      setDiagnosticMessage(`Google Calendar 로그아웃 오류: ${getErrorMessage(error)}`);
      setErrorMessage('Google Calendar 로그아웃 중 문제가 발생했습니다.');
    } finally {
      setLoading(false);
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

      if (Platform.OS === 'web') {
        setPendingGoogleAuthMode(authMode);
        return promptAsync({
          windowName: 'restday-google-auth',
          windowFeatures: {
            width: 515,
            height: 680,
          },
        });
      }

      clearPendingGoogleAuthMode();
      return promptAsync();
    },
    loading,
    isReady: !!request && !missingClientIdMessage,
    errorMessage,
    statusMessage,
    diagnosticMessage,
    disconnectAsync,
    isCalendarConnected,
    calendarAccountEmail,
    calendarAccountName,
  };
}
