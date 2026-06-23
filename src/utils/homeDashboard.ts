import { getHolidayDayDiff, isReviewDeferredActive } from './holidayDates';
import type {
  CalendarContext,
  Holiday,
  ManualScheduleEntry,
} from '../store/useAppStore';

export type HomeCommandKey =
  | 'register'
  | 'decision'
  | 'retry-plan'
  | 'plan-preview'
  | 'execution'
  | 'review';

export interface HomeCommandState {
  key: HomeCommandKey;
  title: string;
  description: string;
  buttonText: string;
}

export interface AgendaItem {
  id: string;
  title: string;
  kind: 'schedule' | 'holiday';
  source: 'google' | 'manual' | 'calendar' | 'weekend' | 'test';
  dateKey: string;
  start: string | null;
  end: string | null;
  isAllDay: boolean;
  note?: string;
  calendarSummary?: string;
  isCurrentHoliday: boolean;
  sortAt: number;
}

type BuildHomeCommandStateArgs = {
  currentHoliday: Holiday | null;
  decisionAnswers: unknown;
  planGenerationError: string | null;
  plans: { id: string }[];
  isPlanConfirmed: boolean;
  reviewDeferredUntil: string | null;
};

type BuildAgendaItemsArgs = {
  calendarContext: CalendarContext | null;
  currentHoliday: Holiday | null;
  manualEntries: ManualScheduleEntry[];
};

function getDateKeyFromIso(value: string | null) {
  if (!value) return '';
  return value.slice(0, 10);
}

function getLocalDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

function getDayStartTimestamp(dateKey: string) {
  return new Date(`${dateKey}T00:00:00`).getTime();
}

function getAgendaSortTimestamp(item: Pick<AgendaItem, 'start' | 'dateKey'>) {
  return item.start ? new Date(item.start).getTime() : getDayStartTimestamp(item.dateKey);
}

function matchesCurrentHoliday(item: AgendaItem, currentHoliday: Holiday) {
  if (item.id === currentHoliday.id) {
    return true;
  }

  return item.title === currentHoliday.title && item.dateKey === currentHoliday.startDate;
}

export function buildHomeCommandState({
  currentHoliday,
  decisionAnswers,
  planGenerationError,
  plans,
  isPlanConfirmed,
  reviewDeferredUntil,
}: BuildHomeCommandStateArgs): HomeCommandState {
  const hasHoliday = !!currentHoliday;
  const hasAnswers = !!decisionAnswers;
  const hasPlans = plans.length > 0;
  const daysDiff = currentHoliday ? getHolidayDayDiff(currentHoliday.startDate) : 0;
  const isMissedHoliday = !!currentHoliday && daysDiff < 0;
  const isTodayHoliday = !!currentHoliday && daysDiff === 0;
  const isDeferred = isReviewDeferredActive(reviewDeferredUntil);

  if (!hasHoliday) {
    return {
      key: 'register',
      title: '먼저 준비할 휴일을 정하세요',
      description: '휴일 하나만 정하면 RestDay가 그 하루를 기준으로 다음 행동을 바로 정리합니다.',
      buttonText: '휴일 정하기',
    };
  }

  if (isMissedHoliday) {
    return {
      key: 'review',
      title: isDeferred ? '지난 휴일 정리를 내일로 미뤄둔 상태예요' : '지난 휴일을 정리할 차례예요',
      description: hasPlans
        ? '체크한 실행 내역을 확인하고 짧은 회고만 남기면 다음 휴일 준비로 넘어갈 수 있어요.'
        : '계획 없이 지나갔더라도 한 줄 회고만 남기면 충분합니다.',
      buttonText: hasPlans ? '실행 체크와 회고하기' : '회고만 남기기',
    };
  }

  if (isTodayHoliday) {
    return {
      key: 'execution',
      title: '오늘은 준비보다 실행이 중요해요',
      description: '확정한 계획을 체크하면서 오늘 하루를 마무리하세요.',
      buttonText: '오늘 계획 체크하기',
    };
  }

  if (hasAnswers && !hasPlans) {
    return {
      key: 'retry-plan',
      title: '추천 계획이 중간에 멈췄어요',
      description:
        planGenerationError ??
        '답변은 저장돼 있어요. 같은 휴일 기준으로 계획 초안을 다시 만들 수 있습니다.',
      buttonText: '계획 다시 만들기',
    };
  }

  if (!hasAnswers) {
    return {
      key: 'decision',
      title: '이번 휴일 방향을 정할 차례예요',
      description: '컨디션과 원하는 느낌을 짧게 정리하면 실행 가능한 하루 초안으로 이어집니다.',
      buttonText: '이번 휴일 상태 체크하기',
    };
  }

  return {
    key: 'plan-preview',
    title: isPlanConfirmed ? '휴일 준비가 거의 끝났어요' : '추천 계획이 준비됐어요',
    description: isPlanConfirmed
      ? '확정한 계획을 다시 보고 필요한 부분만 다듬으면 됩니다.'
      : '이제 계획을 확인하고 확정하면 이번 휴일 준비가 완료됩니다.',
    buttonText: isPlanConfirmed ? '계획 다시 보기' : '계획 확정하기',
  };
}

export function buildAgendaItems({
  calendarContext,
  currentHoliday,
  manualEntries,
}: BuildAgendaItemsArgs): AgendaItem[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startAt = today.getTime();
  const endAt = startAt + 14 * 24 * 60 * 60 * 1000;

  const items: AgendaItem[] = [];

  manualEntries.forEach((entry) => {
    const sortAt = entry.start ? new Date(entry.start).getTime() : getDayStartTimestamp(entry.dateKey);
    if (Number.isNaN(sortAt) || sortAt < startAt || sortAt > endAt) {
      return;
    }

    items.push({
      id: entry.id,
      title: entry.title,
      kind: entry.kind,
      source: 'manual',
      dateKey: entry.dateKey,
      start: entry.start,
      end: entry.end,
      isAllDay: entry.isAllDay,
      note: entry.note,
      isCurrentHoliday: false,
      sortAt,
    });
  });

  calendarContext?.upcomingEvents.forEach((event) => {
    const dateKey = event.isAllDay ? getDateKeyFromIso(event.start) : getLocalDateKey(new Date(event.start));
    const sortAt = getAgendaSortTimestamp({ dateKey, start: event.start });
    if (Number.isNaN(sortAt) || sortAt < startAt || sortAt > endAt) {
      return;
    }

    items.push({
      id: `google:${event.calendarId}:${event.id}`,
      title: event.title,
      kind: 'schedule',
      source: 'google',
      dateKey,
      start: event.start,
      end: event.end,
      isAllDay: event.isAllDay,
      calendarSummary: event.calendarSummary,
      isCurrentHoliday: false,
      sortAt,
    });
  });

  if (currentHoliday) {
    const matchedItem = items.find((item) => matchesCurrentHoliday(item, currentHoliday));

    if (matchedItem) {
      matchedItem.kind = 'holiday';
      matchedItem.isCurrentHoliday = true;
    } else {
      items.push({
        id: currentHoliday.id,
        title: currentHoliday.title,
        kind: 'holiday',
        source: currentHoliday.source === 'manual' ? 'manual' : currentHoliday.source ?? 'manual',
        dateKey: currentHoliday.startDate,
        start: `${currentHoliday.startDate}T00:00:00`,
        end: null,
        isAllDay: true,
        note: currentHoliday.note,
        isCurrentHoliday: true,
        sortAt: getDayStartTimestamp(currentHoliday.startDate),
      });
    }
  }

  return items.sort((left, right) => {
    if (left.dateKey !== right.dateKey) {
      return left.sortAt - right.sortAt;
    }

    if (left.isCurrentHoliday !== right.isCurrentHoliday) {
      return Number(right.isCurrentHoliday) - Number(left.isCurrentHoliday);
    }

    if (left.kind !== right.kind) {
      return left.kind === 'holiday' ? -1 : 1;
    }

    return left.sortAt - right.sortAt;
  });
}
