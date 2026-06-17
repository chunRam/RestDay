export interface PlanItem {
  id: string;
  timeSlot: string;
  text: string;
  isDone: boolean;
}

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
}

export type PlanRecommendationBundle = Record<PlanIntensity, PlanRecommendation>;

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
    return answers.desiredMood === 'organize'
      ? '부담을 줄인 최소 정리 휴일'
      : '회복 중심의 조용한 휴일';
  }

  if (answers.desiredMood === 'outside') {
    return answers.socialMode === 'together'
      ? '가볍게 밖에서 기분을 바꾸는 휴일'
      : '혼자 리듬을 되찾는 외출 휴일';
  }

  if (answers.desiredMood === 'achieve') {
    return answers.intensity === 'full'
      ? '성취감을 남기는 집중 휴일'
      : '하나만 확실히 끝내는 휴일';
  }

  if (answers.desiredMood === 'organize') {
    return '밀린 것을 가볍게 덜어내는 휴일';
  }

  return '회복과 여유를 남기는 휴일';
}

function buildReason(answers: DecisionAnswers) {
  const parsedMustDo = parseMustDo(answers.mustDo);
  const parts = [
    energyLabels[answers.energy],
    moodLabels[answers.desiredMood],
    socialLabels[answers.socialMode],
    `${intensityLabels[answers.intensity]} 보내고 싶은 상태`,
  ];

  if (parsedMustDo) {
    return `${parts.join(', ')}를 바탕으로, ${formatMustDoForReason(parsedMustDo)} 일정은 고정했습니다.`;
  }

  return `${parts.join(', ')}를 반영했습니다.`;
}

function getMorningPlan(answers: DecisionAnswers) {
  const parsedMustDo = parseMustDo(answers.mustDo);

  if (answers.energy === 'low') {
    return '알람 없이 일어나 물 한 잔 마시고 가벼운 아침 먹기';
  }

  if (answers.desiredMood === 'achieve' || answers.desiredMood === 'organize') {
    return parsedMustDo
      ? `꼭 해야 하는 일부터 30분만 시작하기: ${parsedMustDo.task}`
      : '오늘 끝내고 싶은 일 하나를 정하고 30분만 시작하기';
  }

  if (answers.desiredMood === 'outside') {
    return '외출 준비를 서두르지 않고 동선 하나만 정하기';
  }

  return '늦지 않게 일어나 가벼운 식사와 환기로 하루 열기';
}

function getAfternoonPlan(answers: DecisionAnswers) {
  const parsedMustDo = parseMustDo(answers.mustDo);

  if (answers.desiredMood === 'outside') {
    return answers.socialMode === 'together'
      ? '무리 없는 장소에서 2시간 정도 함께 보내기'
      : '집 근처 공원이나 카페에 들러 기분 전환하기';
  }

  if (answers.desiredMood === 'organize') {
    return parsedMustDo
      ? `꼭 해야 하는 일 마무리하거나 다음 단계 정하기: ${parsedMustDo.task}`
      : '방 한 곳이나 할 일 한 묶음만 정해서 정리하기';
  }

  if (answers.desiredMood === 'achieve') {
    if (parsedMustDo) {
      return answers.intensity === 'full'
        ? `꼭 해야 하는 일에 집중 블록 2개 쓰기: ${parsedMustDo.task}`
        : `꼭 해야 하는 일 하나를 60분 동안 처리하기: ${parsedMustDo.task}`;
    }

    return answers.intensity === 'full'
      ? '집중 블록 2개로 핵심 작업을 진행하기'
      : '가장 중요한 일 하나를 60분 동안 처리하기';
  }

  return answers.energy === 'low'
    ? '휴대폰을 잠시 내려두고 20분 산책하거나 누워서 쉬기'
    : '가벼운 취미나 산책으로 쉬는 느낌을 분명히 만들기';
}

function getEveningPlan(answers: DecisionAnswers) {
  const parsedMustDo = parseMustDo(answers.mustDo);

  if (parsedMustDo && !parsedMustDo.timeLabel && answers.desiredMood === 'rest') {
    return `꼭 해야 하는 일만 짧게 처리하고 쉬기: ${parsedMustDo.task}`;
  }

  if (answers.intensity === 'full' && answers.energy === 'high') {
    return '오늘 한 일을 정리하고 내일 준비를 15분만 해두기';
  }

  if (answers.desiredMood === 'organize') {
    return '정리한 공간이나 결과를 확인하고 편하게 저녁 먹기';
  }

  if (answers.desiredMood === 'outside') {
    return '귀가 후 샤워하고 내일을 방해하지 않는 시간에 쉬기';
  }

  return '따뜻한 저녁을 먹고 화면 사용을 줄이며 일찍 마무리하기';
}

export function generateRecommendationFromAnswers(answers: DecisionAnswers): PlanRecommendation {
  const parsedMustDo = parseMustDo(answers.mustDo);
  const plans: PlanItem[] = [
    { id: 'morning', timeSlot: '오전', text: getMorningPlan(answers), isDone: false },
    { id: 'afternoon', timeSlot: '오후', text: getAfternoonPlan(answers), isDone: false },
    { id: 'evening', timeSlot: '저녁', text: getEveningPlan(answers), isDone: false },
  ];

  if (parsedMustDo?.timeLabel && parsedMustDo.slot) {
    const planIndex = parsedMustDo.slot === 'morning' ? 0 : parsedMustDo.slot === 'afternoon' ? 1 : 2;
    plans[planIndex] = {
      id: parsedMustDo.slot,
      timeSlot: planSlotLabels[parsedMustDo.slot],
      text: getScheduledMustDoPlan(parsedMustDo, answers.intensity),
      isDone: false,
    };
  }

  return {
    direction: getDirection(answers),
    reason: buildReason(answers),
    plans,
  };
}

export function generateRecommendationBundleFromAnswers(
  answers: DecisionAnswers
): PlanRecommendationBundle {
  return {
    light: generateRecommendationFromAnswers({ ...answers, intensity: 'light' }),
    balanced: generateRecommendationFromAnswers({ ...answers, intensity: 'balanced' }),
    full: generateRecommendationFromAnswers({ ...answers, intensity: 'full' }),
  };
}

export function generateAdjustedRecommendation(
  answers: DecisionAnswers,
  intensity: PlanIntensity
): PlanRecommendation {
  return generateRecommendationFromAnswers({ ...answers, intensity });
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
