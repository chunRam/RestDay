import type { CalendarContext, Holiday } from '../store/useAppStore';

export interface PlanItem {
  id: string;
  timeSlot: string;
  text: string;
  isDone: boolean;
}

export type RecommendationSource =
  | 'gemini'
  | 'rule_based'
  | 'gemini_retry_then_rule_based';

export type EnergyLevel = 'low' | 'normal' | 'high';
export type DesiredMood = 'rest' | 'organize' | 'outside' | 'achieve';
export type SocialMode = 'alone' | 'together' | 'undecided';
export type PlanIntensity = 'light' | 'balanced' | 'full';

export interface DecisionAnswers {
  energy: EnergyLevel;
  desiredMood: DesiredMood;
  socialMode: SocialMode;
  mustDo: string;
  intensity: PlanIntensity;
}

export interface PlanRecommendation {
  direction: string;
  reason: string;
  plans: PlanItem[];
  source: RecommendationSource;
  model: string;
  failureReason: string | null;
  httpStatus: number | null;
  retryCount: number;
}

export interface RecommendationMetadata {
  source: RecommendationSource;
  model?: string | null;
  failureReason?: string | null;
  httpStatus?: number | null;
  retryCount?: number;
}

type PlanSlot = 'morning' | 'afternoon' | 'evening';

interface ParsedMustDo {
  raw: string;
  task: string;
  timeLabel?: string;
  slot?: PlanSlot;
}

const energyLabels: Record<EnergyLevel, string> = {
  low: '컨디션이 낮은 편',
  normal: '컨디션이 보통',
  high: '컨디션이 좋은 편',
};

const moodLabels: Record<DesiredMood, string> = {
  rest: '완전히 쉬고 싶은 날',
  organize: '정리하고 싶은 날',
  outside: '밖으로 나가고 싶은 날',
  achieve: '무언가 해내고 싶은 날',
};

const socialLabels: Record<SocialMode, string> = {
  alone: '혼자 보내는 휴일',
  together: '누군가와 함께 보내는 휴일',
  undecided: '동행 여부가 아직 정해지지 않은 휴일',
};

const intensityLabels: Record<PlanIntensity, string> = {
  light: '아주 가볍게',
  balanced: '적당한 밀도로',
  full: '조금 알차게',
};

const planSlotLabels: Record<PlanSlot, string> = {
  morning: '오전',
  afternoon: '오후',
  evening: '저녁',
};

const DEFAULT_RECOMMENDATION_MODEL = 'rule-based';

function getFailureReasonLabel(failureReason: string | null) {
  switch (failureReason) {
    case 'gemini_proxy_not_configured':
      return 'AI 추천 연결이 설정되지 않았어요';
    case 'invalid_gemini_proxy_protocol':
    case 'invalid_gemini_proxy_url':
      return 'AI 추천 연결 주소가 올바르지 않아요';
    case 'invalid_gemini_response_shape':
      return 'AI 추천 응답 형식이 올바르지 않았어요';
    case 'gemini_request_error':
      return 'AI 추천 요청 중 네트워크 오류가 발생했어요';
    default:
      if (failureReason?.startsWith('gemini_http_')) {
        return `AI 추천 서버 응답 오류 (${failureReason.replace('gemini_http_', '')})`;
      }
      return null;
  }
}

function getPlanSlotFromHour(hour: number): PlanSlot {
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

function normalizeHour(hour: number, meridiem?: string) {
  if (meridiem === '오전' || meridiem === '아침') {
    return hour === 12 ? 0 : hour;
  }

  if (meridiem === '오후' || meridiem === '저녁' || meridiem === '밤') {
    return hour < 12 ? hour + 12 : hour;
  }

  return hour;
}

function normalizeTaskText(value: string) {
  const normalized = value
    .replace(/\s+/g, ' ')
    .replace(/^(에|에는|부터|까지)\s*/, '')
    .trim();

  if (!normalized) return '꼭 해야 하는 일';

  return normalized
    .replace(/할\s*거(예요|에요|야)$/, '하기')
    .replace(/할\s*예정(이에요|입니다)?$/, '하기')
    .replace(/하려고요$/, '하기')
    .replace(/할게요$/, '하기')
    .trim();
}

function parseMustDo(rawMustDo: string): ParsedMustDo | null {
  const raw = rawMustDo.trim();
  if (!raw) return null;

  const clockMatch = raw.match(/(오전|오후|아침|낮|저녁|밤)?\s*(\d{1,2})(?::(\d{2}))?\s*시(?:\s*(\d{1,2})분)?(?:에|쯤|경)?/);
  const colonMatch = raw.match(/(^|\s)(\d{1,2}):(\d{2})(?:에|쯤|경)?/);

  if (clockMatch) {
    const meridiem = clockMatch[1];
    const hour = Number(clockMatch[2]);
    const minute = clockMatch[3] ?? clockMatch[4];
    const normalizedHour = normalizeHour(hour, meridiem);

    if (Number.isFinite(normalizedHour) && normalizedHour >= 0 && normalizedHour <= 23) {
      const timeLabel = `${meridiem ? `${meridiem} ` : ''}${hour}시${minute ? ` ${minute}분` : ''}`;
      const task = normalizeTaskText(raw.replace(clockMatch[0], ' '));

      return {
        raw,
        task,
        timeLabel,
        slot: getPlanSlotFromHour(normalizedHour),
      };
    }
  }

  if (colonMatch) {
    const hour = Number(colonMatch[2]);
    const minute = colonMatch[3];

    if (Number.isFinite(hour) && hour >= 0 && hour <= 23) {
      const timeLabel = `${hour}:${minute}`;
      const task = normalizeTaskText(raw.replace(colonMatch[0], ' '));

      return {
        raw,
        task,
        timeLabel,
        slot: getPlanSlotFromHour(hour),
      };
    }
  }

  return {
    raw,
    task: normalizeTaskText(raw),
  };
}

function formatMustDoForReason(parsedMustDo: ParsedMustDo) {
  return parsedMustDo.timeLabel
    ? `${parsedMustDo.timeLabel}에 ${parsedMustDo.task}`
    : parsedMustDo.task;
}

function formatLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getEventDateKey(start: string, isAllDay: boolean) {
  if (isAllDay) {
    return start.slice(0, 10);
  }

  const date = new Date(start);
  if (Number.isNaN(date.getTime())) {
    return start.slice(0, 10);
  }

  return formatLocalDateKey(date);
}

function getRelevantHolidayEvents(
  holiday: Holiday | null,
  calendarContext: CalendarContext | null
) {
  if (!holiday || !calendarContext) return [];

  return calendarContext.upcomingEvents.filter(
    (event) => getEventDateKey(event.start, event.isAllDay) === holiday.startDate
  );
}

function getEventSlotRange(start: string, end: string | null) {
  const startDate = new Date(start);
  if (Number.isNaN(startDate.getTime())) return [] as PlanSlot[];

  const endDate = end ? new Date(end) : null;
  const slots: PlanSlot[] = [];
  const startHour = startDate.getHours();
  const endHour = endDate && !Number.isNaN(endDate.getTime()) ? endDate.getHours() : startHour;
  const slotOrder: PlanSlot[] = ['morning', 'afternoon', 'evening'];
  const startSlot = getPlanSlotFromHour(startHour);
  const endSlot = getPlanSlotFromHour(endHour);
  const startIndex = slotOrder.indexOf(startSlot);
  const endIndex = slotOrder.indexOf(endSlot);

  for (let index = startIndex; index <= endIndex; index += 1) {
    slots.push(slotOrder[index]);
  }

  return slots;
}

function getBusySlots(events: CalendarContext['upcomingEvents']) {
  const busySlots = new Set<PlanSlot>();

  events.forEach((event) => {
    if (event.isAllDay) return;

    getEventSlotRange(event.start, event.end).forEach((slot) => busySlots.add(slot));
  });

  return busySlots;
}

function buildCalendarReason(holiday: Holiday | null, calendarContext: CalendarContext | null) {
  const holidayEvents = getRelevantHolidayEvents(holiday, calendarContext);
  if (holidayEvents.length === 0) return null;

  const busySlots = Array.from(getBusySlots(holidayEvents)).map((slot) => planSlotLabels[slot]);
  const titles = holidayEvents.slice(0, 2).map((event) => event.title).join(', ');

  if (busySlots.length === 0) {
    return `${titles} 일정이 있어 전체 흐름을 무리하지 않게 잡았습니다.`;
  }

  return `${titles} 일정이 있어 ${busySlots.join(', ')} 시간대 전후는 여유를 두었습니다.`;
}

function applyCalendarContextToPlans(
  plans: PlanItem[],
  holiday: Holiday | null,
  calendarContext: CalendarContext | null,
  parsedMustDo: ParsedMustDo | null
) {
  const holidayEvents = getRelevantHolidayEvents(holiday, calendarContext);
  if (holidayEvents.length === 0) return plans;

  const slotTitles = new Map<PlanSlot, string>();
  holidayEvents.forEach((event) => {
    if (event.isAllDay) return;

    getEventSlotRange(event.start, event.end).forEach((slot) => {
      if (!slotTitles.has(slot)) {
        slotTitles.set(slot, event.title);
      }
    });
  });

  return plans.map((plan, index) => {
    const slot = (['morning', 'afternoon', 'evening'][index] ?? plan.id) as PlanSlot;
    const eventTitle = slotTitles.get(slot);

    if (!eventTitle) {
      return plan;
    }

    const bufferText = `${eventTitle} 일정 전후로 30분 여유를 두고`;
    if (parsedMustDo?.slot === slot) {
      return {
        ...plan,
        text: `${plan.text} (${eventTitle} 일정 전후 30분은 비워두기)`,
      };
    }

    return {
      ...plan,
      text: `${bufferText} ${plan.text}`,
    };
  });
}

function getScheduledMustDoPlan(parsedMustDo: ParsedMustDo, intensity: PlanIntensity) {
  const timedTask = `${parsedMustDo.timeLabel}에 ${parsedMustDo.task}`;

  if (intensity === 'light') {
    return `${timedTask}만 고정하고 나머지는 가볍게 비워두기`;
  }

  if (intensity === 'full') {
    return `${timedTask} 일정에 맞춰 전후 준비와 마무리까지 챙기기`;
  }

  return `${timedTask} 일정으로 고정하고 전후 30분은 여유 있게 두기`;
}

function getDirection(answers: DecisionAnswers) {
  if (answers.energy === 'low') {
    if (answers.desiredMood === 'organize') {
      if (answers.intensity === 'light') return '최소한만 정리하고 쉬는 휴일';
      if (answers.intensity === 'full') return '컨디션 안에서 밀린 것을 정리하는 휴일';
      return '부담을 줄인 최소 정리 휴일';
    }
    if (answers.intensity === 'light') return '아무것도 안 해도 괜찮은 완전 회복 휴일';
    if (answers.intensity === 'full') return '조용하지만 리듬을 되찾는 회복 휴일';
    return '회복 중심의 조용한 휴일';
  }

  if (answers.desiredMood === 'outside') {
    if (answers.socialMode === 'together') {
      if (answers.intensity === 'light') return '부담 없이 잠깐 밖에서 만나는 휴일';
      if (answers.intensity === 'full') return '함께 여러 곳을 돌아보는 알찬 외출 휴일';
      return '가볍게 밖에서 기분을 바꾸는 휴일';
    }
    if (answers.intensity === 'light') return '동네 한 바퀴만 돌고 오는 가벼운 외출 휴일';
    if (answers.intensity === 'full') return '혼자 새로운 장소를 탐험하는 외출 휴일';
    return '혼자 리듬을 되찾는 외출 휴일';
  }

  if (answers.desiredMood === 'achieve') {
    if (answers.intensity === 'light') return '하나만 가볍게 끝내는 휴일';
    if (answers.intensity === 'full') return '성취감을 남기는 집중 휴일';
    return '하나만 확실히 끝내는 휴일';
  }

  if (answers.desiredMood === 'organize') {
    if (answers.intensity === 'light') return '딱 하나만 정리하고 마는 휴일';
    if (answers.intensity === 'full') return '밀린 것을 확실히 덜어내는 정리 휴일';
    return '밀린 것을 가볍게 덜어내는 휴일';
  }

  // rest
  if (answers.intensity === 'light') return '완전히 비우고 쉬는 휴일';
  if (answers.intensity === 'full') return '여유 속에서 작은 충전까지 챙기는 휴일';
  return '회복과 여유를 남기는 휴일';
}

function buildReason(
  answers: DecisionAnswers,
  holiday: Holiday | null,
  calendarContext: CalendarContext | null
) {
  const parsedMustDo = parseMustDo(answers.mustDo);
  const parts = [
    energyLabels[answers.energy],
    moodLabels[answers.desiredMood],
    socialLabels[answers.socialMode],
    `${intensityLabels[answers.intensity]} 보내고 싶은 상태`,
  ];

  if (parsedMustDo) {
    const calendarReason = buildCalendarReason(holiday, calendarContext);
    return [
      `${parts.join(', ')}를 바탕으로, ${formatMustDoForReason(parsedMustDo)} 일정은 고정했습니다.`,
      calendarReason,
    ]
      .filter(Boolean)
      .join(' ');
  }

  const calendarReason = buildCalendarReason(holiday, calendarContext);
  return [`${parts.join(', ')}를 반영했습니다.`, calendarReason].filter(Boolean).join(' ');
}

function getMorningPlan(answers: DecisionAnswers) {
  const parsedMustDo = parseMustDo(answers.mustDo);
  const { intensity } = answers;

  if (answers.energy === 'low') {
    if (intensity === 'light') return '알람 없이 원하는 만큼 자고 일어나기';
    if (intensity === 'full') return '알람 없이 일어나 물 한 잔, 가벼운 스트레칭 후 아침 먹기';
    return '알람 없이 일어나 물 한 잔 마시고 가벼운 아침 먹기';
  }

  if (answers.desiredMood === 'achieve' || answers.desiredMood === 'organize') {
    if (parsedMustDo) {
      if (intensity === 'light') return `할 일을 눈으로 확인만 해두기: ${parsedMustDo.task}`;
      if (intensity === 'full') return `꼭 해야 하는 일을 바로 시작해 오전 중에 절반 끝내기: ${parsedMustDo.task}`;
      return `꼭 해야 하는 일부터 30분만 시작하기: ${parsedMustDo.task}`;
    }
    if (intensity === 'light') return '오늘 할 일을 하나만 정하고 메모해두기';
    if (intensity === 'full') return '할 일 목록을 정리하고 가장 중요한 것부터 바로 시작하기';
    return '오늘 끝내고 싶은 일 하나를 정하고 30분만 시작하기';
  }

  if (answers.desiredMood === 'outside') {
    if (intensity === 'light') return '서두르지 않고 나갈 준비만 천천히 하기';
    if (intensity === 'full') return '가고 싶은 장소와 동선을 정하고 일찍 출발하기';
    return '외출 준비를 서두르지 않고 동선 하나만 정하기';
  }

  // rest
  if (intensity === 'light') return '알람 없이 일어나 아무것도 안 하고 천천히 시작하기';
  if (intensity === 'full') return '평소보다 30분 일찍 일어나 좋아하는 아침 루틴 즐기기';
  return '늦지 않게 일어나 가벼운 식사와 환기로 하루 열기';
}

function getAfternoonPlan(answers: DecisionAnswers) {
  const parsedMustDo = parseMustDo(answers.mustDo);
  const { intensity } = answers;

  if (answers.desiredMood === 'outside') {
    if (answers.socialMode === 'together') {
      if (intensity === 'light') return '가까운 카페에서 1시간 정도 가볍게 만나기';
      if (intensity === 'full') return '함께 2~3곳을 돌며 반나절 코스로 보내기';
      return '무리 없는 장소에서 2시간 정도 함께 보내기';
    }
    if (intensity === 'light') return '집 근처 편의점이나 공원까지만 가볍게 다녀오기';
    if (intensity === 'full') return '안 가본 카페나 서점을 찾아 2시간 정도 머물기';
    return '집 근처 공원이나 카페에 들러 기분 전환하기';
  }

  if (answers.desiredMood === 'organize') {
    if (parsedMustDo) {
      if (intensity === 'light') return `할 일 중 가장 작은 것 하나만 처리하기: ${parsedMustDo.task}`;
      if (intensity === 'full') return `꼭 해야 하는 일을 끝까지 마무리하기: ${parsedMustDo.task}`;
      return `꼭 해야 하는 일 마무리하거나 다음 단계 정하기: ${parsedMustDo.task}`;
    }
    if (intensity === 'light') return '서랍 하나 또는 앱 알림 정리처럼 5분짜리 일 하나만 하기';
    if (intensity === 'full') return '방 한 곳을 완전히 정리하고 불필요한 것 정리하기';
    return '방 한 곳이나 할 일 한 묶음만 정해서 정리하기';
  }

  if (answers.desiredMood === 'achieve') {
    if (parsedMustDo) {
      if (intensity === 'light') return `꼭 해야 하는 일을 30분만 집중해서 진행하기: ${parsedMustDo.task}`;
      if (intensity === 'full') return `꼭 해야 하는 일에 집중 블록 2개(총 90분) 쓰기: ${parsedMustDo.task}`;
      return `꼭 해야 하는 일 하나를 60분 동안 처리하기: ${parsedMustDo.task}`;
    }
    if (intensity === 'light') return '가장 중요한 일 하나를 30분만 집중해서 진행하기';
    if (intensity === 'full') return '집중 블록 2개(총 90분)로 핵심 작업을 진행하기';
    return '가장 중요한 일 하나를 60분 동안 처리하기';
  }

  // rest
  if (answers.energy === 'low') {
    if (intensity === 'light') return '침대나 소파에서 아무것도 안 하고 쉬기';
    if (intensity === 'full') return '20분 산책 후 좋아하는 음료 한 잔 사 오기';
    return '휴대폰을 잠시 내려두고 20분 산책하거나 누워서 쉬기';
  }
  if (intensity === 'light') return '좋아하는 음악이나 영상을 틀어두고 편하게 쉬기';
  if (intensity === 'full') return '취미 활동이나 산책을 1시간 이상 넉넉하게 즐기기';
  return '가벼운 취미나 산책으로 쉬는 느낌을 분명히 만들기';
}

function getEveningPlan(answers: DecisionAnswers) {
  const parsedMustDo = parseMustDo(answers.mustDo);
  const { intensity } = answers;

  if (parsedMustDo && !parsedMustDo.timeLabel && answers.desiredMood === 'rest') {
    if (intensity === 'light') return `할 일은 내일로 미루고 오늘은 쉬기`;
    if (intensity === 'full') return `꼭 해야 하는 일을 처리하고 여유 있게 저녁 마무리: ${parsedMustDo.task}`;
    return `꼭 해야 하는 일만 짧게 처리하고 쉬기: ${parsedMustDo.task}`;
  }

  if (answers.desiredMood === 'organize') {
    if (intensity === 'light') return '정리는 여기까지만 하고 편하게 저녁 먹기';
    if (intensity === 'full') return '정리 결과를 확인하고 내일 할 일 목록까지 정리해두기';
    return '정리한 공간이나 결과를 확인하고 편하게 저녁 먹기';
  }

  if (answers.desiredMood === 'outside') {
    if (intensity === 'light') return '일찍 귀가해서 샤워하고 바로 쉬기';
    if (intensity === 'full') return '귀가 후 오늘 다녀온 곳 사진 정리하고 여유 있게 마무리';
    return '귀가 후 샤워하고 내일을 방해하지 않는 시간에 쉬기';
  }

  if (answers.desiredMood === 'achieve') {
    if (intensity === 'light') return '더 하고 싶어도 여기서 멈추고 편하게 저녁 보내기';
    if (intensity === 'full') return '오늘 한 일을 정리하고 내일 준비를 15분만 해두기';
    return '해낸 것을 확인하고 따뜻한 저녁으로 보상하기';
  }

  // rest
  if (intensity === 'light') return '아무 계획 없이 하고 싶은 대로 저녁 보내기';
  if (intensity === 'full') return '따뜻한 저녁을 차려 먹고 내일 루틴을 간단히 준비해두기';
  return '따뜻한 저녁을 먹고 화면 사용을 줄이며 일찍 마무리하기';
}

export function generateRecommendationFromAnswers(
  answers: DecisionAnswers,
  holiday: Holiday | null = null,
  calendarContext: CalendarContext | null = null
): PlanRecommendation {
  return generateRecommendationFromAnswersWithMetadata(answers, {
    source: 'rule_based',
  }, holiday, calendarContext);
}

export function generateRecommendationFromAnswersWithMetadata(
  answers: DecisionAnswers,
  metadata: RecommendationMetadata,
  holiday: Holiday | null = null,
  calendarContext: CalendarContext | null = null
): PlanRecommendation {
  const parsedMustDo = parseMustDo(answers.mustDo);
  const basePlans: PlanItem[] = [
    { id: 'morning', timeSlot: '오전', text: getMorningPlan(answers), isDone: false },
    { id: 'afternoon', timeSlot: '오후', text: getAfternoonPlan(answers), isDone: false },
    { id: 'evening', timeSlot: '저녁', text: getEveningPlan(answers), isDone: false },
  ];
  const plans = [...basePlans];

  if (parsedMustDo?.timeLabel && parsedMustDo.slot) {
    const planIndex = parsedMustDo.slot === 'morning' ? 0 : parsedMustDo.slot === 'afternoon' ? 1 : 2;
    plans[planIndex] = {
      id: parsedMustDo.slot,
      timeSlot: planSlotLabels[parsedMustDo.slot],
      text: getScheduledMustDoPlan(parsedMustDo, answers.intensity),
      isDone: false,
    };
  }

  const adjustedPlans = applyCalendarContextToPlans(plans, holiday, calendarContext, parsedMustDo);

  return {
    direction: getDirection(answers),
    reason: buildReason(answers, holiday, calendarContext),
    plans: adjustedPlans,
    source: metadata.source,
    model: metadata.model?.trim() || DEFAULT_RECOMMENDATION_MODEL,
    failureReason: metadata.failureReason ?? null,
    httpStatus: metadata.httpStatus ?? null,
    retryCount: metadata.retryCount ?? 0,
  };
}

export function normalizeRecommendationMetadata(
  recommendation: PlanRecommendation
): PlanRecommendation {
  return {
    ...recommendation,
    source: recommendation.source ?? 'rule_based',
    model: recommendation.model?.trim() || DEFAULT_RECOMMENDATION_MODEL,
    failureReason: recommendation.failureReason ?? null,
    httpStatus: recommendation.httpStatus ?? null,
    retryCount: typeof recommendation.retryCount === 'number' ? recommendation.retryCount : 0,
  };
}

export function getRecommendationSourceLabel(source: RecommendationSource) {
  switch (source) {
    case 'gemini':
      return 'AI 추천';
    case 'gemini_retry_then_rule_based':
      return 'AI 실패 후 기본 추천';
    case 'rule_based':
    default:
      return '기본 추천';
  }
}

export function getRecommendationSourceDescription(recommendation: PlanRecommendation | null) {
  if (!recommendation) return null;

  if (recommendation.source === 'gemini') {
    return `Gemini 모델 ${recommendation.model}로 생성된 추천이에요.`;
  }

  if (recommendation.source === 'gemini_retry_then_rule_based') {
    return 'AI 추천이 직전 계획과 충분히 다르게 생성되지 않아 기본 추천으로 대체했어요.';
  }

  const failureLabel = getFailureReasonLabel(recommendation.failureReason);
  return failureLabel
    ? `${failureLabel}. 기본 추천을 사용 중이에요.`
    : 'AI 추천을 만들지 못해 기본 추천을 사용 중이에요.';
}

export function generatePlansFromDecision(goalType: string): PlanItem[] {
  // 규칙 기반 플랜 생성 (백엔드 로직 이관)
  if (goalType === '1') {
    return [
      { id: '1_m', timeSlot: '오전', text: '늦잠 자기 및 가벼운 아침 식사', isDone: false },
      { id: '1_a', timeSlot: '오후', text: '스마트폰 멀리하기 및 가벼운 동네 산책', isDone: false },
      { id: '1_e', timeSlot: '저녁', text: '저녁 식사 및 영화 감상', isDone: false },
    ];
  } else if (goalType === '2') {
    return [
      { id: '2_m', timeSlot: '오전', text: '가벼운 브런치 먹기', isDone: false },
      { id: '2_a', timeSlot: '오후', text: '새로운 동네나 공원 구경하기', isDone: false },
      { id: '2_e', timeSlot: '저녁', text: '돌아와서 따뜻한 샤워하기', isDone: false },
    ];
  } else if (goalType === '3') {
    return [
      { id: '3_m', timeSlot: '오전', text: '해야 할 일 리스트업 및 환기', isDone: false },
      { id: '3_a', timeSlot: '오후', text: '집중해서 밀린 업무/집안일 처리', isDone: false },
      { id: '3_e', timeSlot: '저녁', text: '성취감 느끼며 맛있는 배달음식 먹기', isDone: false },
    ];
  } else {
    return [
      { id: '4_m', timeSlot: '오전', text: '평소 읽고 싶었던 책 읽기', isDone: false },
      { id: '4_a', timeSlot: '오후', text: '새로운 기술/취미 2시간 집중하기', isDone: false },
      { id: '4_e', timeSlot: '저녁', text: '배운 내용 정리하고 휴식하기', isDone: false },
    ];
  }
}
