import type { CalendarContext, Holiday } from '../store/useAppStore';
import {
  normalizeRecommendationMetadata,
} from '../utils/planGenerator';
import type {
  DecisionAnswers,
  PlanIntensity,
  PlanItem,
  PlanRecommendation,
  RecommendationSource,
} from '../utils/planGenerator';
import { Logger } from '../utils/logger';

type GeminiTextPart = {
  text?: string;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: GeminiTextPart[];
    };
  }>;
};

type GeminiEndpoint = {
  url: string;
  headers: Record<string, string>;
  mode: 'proxy';
};

type GeminiEndpointResolution = {
  endpoint: GeminiEndpoint | null;
  failureReason: string | null;
};

type RecommendationPromptOptions = {
  previousIntensity?: PlanIntensity;
  previousRecommendation?: PlanRecommendation | null;
  forceDistinctFromPrevious?: boolean;
};

export type GeminiRecommendationResult = {
  success: boolean;
  recommendation: PlanRecommendation | null;
  source: RecommendationSource;
  model: string;
  httpStatus: number | null;
  failureReason: string | null;
};

const geminiModel = process.env.EXPO_PUBLIC_GEMINI_MODEL || 'gemini-1.5-flash';
const geminiProxyUrl =
  process.env.EXPO_PUBLIC_GEMINI_PROXY_URL ||
  process.env.EXPO_PUBLIC_GEMINI_RECOMMENDATION_PROXY_URL;
const geminiRequestTimeoutMs = 12000;

const planRecommendationSchema = {
  type: 'object',
  properties: {
    direction: {
      type: 'string',
      description: '사용자의 휴일 상태를 요약한 짧은 추천 방향',
    },
    reason: {
      type: 'string',
      description: '추천 방향을 선택한 이유. 사용자의 답변을 근거로 한두 문장으로 작성',
    },
    plans: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'morning, afternoon, evening 중 하나',
          },
          timeSlot: {
            type: 'string',
            description: '오전, 오후, 저녁 중 하나',
          },
          text: {
            type: 'string',
            description: '사용자가 바로 실행할 수 있는 구체적인 행동',
          },
        },
        required: ['id', 'timeSlot', 'text'],
      },
    },
  },
  required: ['direction', 'reason', 'plans'],
};

const answerLabels = {
  energy: {
    low: '컨디션이 낮음',
    normal: '컨디션이 보통',
    high: '컨디션이 좋음',
  },
  desiredMood: {
    rest: '완전히 쉬기',
    organize: '정리하기',
    outside: '밖으로 나가기',
    achieve: '무언가 해내기',
  },
  socialMode: {
    alone: '혼자',
    together: '함께',
    undecided: '아직 정하지 않음',
  },
  intensity: {
    light: '아주 가볍게',
    balanced: '적당히',
    full: '알차게',
  },
};

function formatLocalDateKey(date: Date) {
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function buildPreviousRecommendationContext(options?: RecommendationPromptOptions) {
  if (!options?.previousRecommendation) {
    return [];
  }

  const previousPlansText = options.previousRecommendation.plans
    .map((plan) => `${plan.timeSlot}: ${plan.text}`)
    .join(' / ');

  return [
    '',
    '직전 카테고리 계획 참고:',
    `- 직전 강도: ${
      options.previousIntensity ? answerLabels.intensity[options.previousIntensity] : '알 수 없음'
    }`,
    `- 직전 추천 방향: ${options.previousRecommendation.direction}`,
    `- 직전 이유: ${options.previousRecommendation.reason}`,
    `- 직전 계획: ${previousPlansText}`,
    '- 이번 응답에서는 직전 계획의 문장과 순서를 재사용하지 마세요.',
    '- 이번 강도에 맞게 행동량, 이동량, 휴식 비중, 작업 밀도, 외출 강도가 분명히 달라져야 합니다.',
    '- 직전 계획과 비교했을 때 사용자가 바로 다른 카테고리라고 느낄 정도로 차이를 내세요.',
  ];
}

function buildCalendarContextPrompt(
  holiday: Holiday | null,
  calendarContext: CalendarContext | null
) {
  if (!calendarContext) {
    return [];
  }

  const relevantEvents = holiday
    ? calendarContext.upcomingEvents.filter((event) => {
        const eventDate = event.isAllDay
          ? event.start.slice(0, 10)
          : formatLocalDateKey(new Date(event.start)) || event.start.slice(0, 10);
        return eventDate === holiday.startDate;
      })
    : [];
  const eventLines = relevantEvents.slice(0, 5).map((event) => {
    const when = event.isAllDay ? '종일' : event.start;
    return `- ${when}: ${event.title}`;
  });

  return [
    '',
    `다가오는 일정 요약: ${calendarContext.planningSummary ?? '가져온 일정은 있지만 요약이 비어 있습니다.'}`,
    ...(eventLines.length > 0 ? ['휴일 당일 관련 일정:', ...eventLines] : []),
  ];
}

function buildPrompt(
  answers: DecisionAnswers,
  holiday: Holiday | null,
  calendarContext: CalendarContext | null,
  options?: RecommendationPromptOptions
) {
  const holidayText = holiday
    ? `${holiday.title} (${holiday.startDate})`
    : '아직 특정 휴일이 정해지지 않음';

  return [
    'RestDay는 사용자가 다가오는 휴일 전에 방향을 결정하고 실행 가능한 하루 계획을 만드는 앱입니다.',
    '아래 답변을 바탕으로 한국어 추천 계획을 작성하세요.',
    '',
    `휴일: ${holidayText}`,
    `컨디션: ${answerLabels.energy[answers.energy]}`,
    `원하는 휴일 느낌: ${answerLabels.desiredMood[answers.desiredMood]}`,
    `동행 여부: ${answerLabels.socialMode[answers.socialMode]}`,
    `선택한 계획 강도: ${answerLabels.intensity[answers.intensity]}`,
    `꼭 해야 하는 일: ${answers.mustDo.trim() || '없음'}`,
    ...buildCalendarContextPrompt(holiday, calendarContext),
    '',
    '규칙:',
    '- 선택한 계획 강도 하나에 대해서만 추천을 작성하세요.',
    '- [light]: 최소한의 움직임, 완전한 휴식 위주의 가장 여유로운 계획',
    '- [balanced]: 휴식과 활동이 적절히 섞인 균형 잡힌 계획',
    '- [full]: 시간을 알차게 쓰는 밀도 있고 활동적인 계획',
    '- 각 강도 차이는 휴식 비중, 외출 여부, 작업 블록 길이, 일정 밀도에서 실제로 드러나야 합니다.',
    '- direction(추천 방향)과 reason(이유)은 현재 선택된 강도의 특성이 분명히 드러나야 합니다.',
    '- 계획은 오전, 오후, 저녁 3개만 작성하세요.',
    '- 각 계획은 작고 구체적인 행동이어야 합니다.',
    '- 꼭 해야 하는 일에 시간이 포함되어 있으면 그 시간을 보존하고 맞는 시간대 계획에 넣으세요.',
    '- Google Calendar에서 이미 잡혀 있는 일정과 충돌하지 않게 계획하세요.',
    '- 고정 일정이 있는 시간대는 전후 30분 정도 완충 시간을 두세요.',
    '- 사용자의 컨디션보다 과하게 빡빡한 계획을 만들지 마세요 (full 강도라도 컨디션이 낮다면 무리하지 않게 조절).',
    '- 앱의 핵심은 휴일 전 의사결정이므로, 방향과 이유가 먼저 분명해야 합니다.',
    ...(options?.forceDistinctFromPrevious
      ? [
          '- 직전 카테고리와 비슷한 표현이나 행동 구성을 반복하면 안 됩니다.',
          '- 이전 계획과 구분되지 않는 답변은 잘못된 답변입니다.',
        ]
      : []),
    '- 반드시 JSON 스키마에 맞는 데이터만 반환하세요.',
    ...buildPreviousRecommendationContext(options),
  ].join('\n');
}

function buildGeminiRequest(
  answers: DecisionAnswers,
  holiday: Holiday | null,
  calendarContext: CalendarContext | null,
  options?: RecommendationPromptOptions
) {
  return {
    model: geminiModel,
    contents: [
      {
        parts: [
          {
            text: buildPrompt(answers, holiday, calendarContext, options),
          },
        ],
      },
    ],
    generationConfig: {
      responseFormat: {
        text: {
          mimeType: 'APPLICATION_JSON',
          schema: planRecommendationSchema,
        },
      },
    },
  };
}

function normalizePlan(plan: Partial<PlanItem>, index: number): PlanItem {
  const fallback = [
    { id: 'morning', timeSlot: '오전' },
    { id: 'afternoon', timeSlot: '오후' },
    { id: 'evening', timeSlot: '저녁' },
  ][index];

  return {
    id: typeof plan.id === 'string' && plan.id.trim() ? plan.id.trim() : fallback.id,
    timeSlot:
      typeof plan.timeSlot === 'string' && plan.timeSlot.trim()
        ? plan.timeSlot.trim()
        : fallback.timeSlot,
    text: typeof plan.text === 'string' && plan.text.trim() ? plan.text.trim() : '',
    isDone: false,
  };
}

function validateRecommendation(value: unknown): PlanRecommendation | null {
  if (!value || typeof value !== 'object') return null;

  const candidate = value as Partial<PlanRecommendation>;
  if (typeof candidate.direction !== 'string' || !candidate.direction.trim()) return null;
  if (typeof candidate.reason !== 'string' || !candidate.reason.trim()) return null;
  if (!Array.isArray(candidate.plans) || candidate.plans.length < 3) return null;

  const plans = candidate.plans.slice(0, 3).map((plan, index) => normalizePlan(plan, index));
  if (plans.some((plan) => !plan.text)) return null;

  return {
    direction: candidate.direction.trim(),
    reason: candidate.reason.trim(),
    plans,
    source: 'gemini',
    model: geminiModel,
    failureReason: null,
    httpStatus: null,
    retryCount: 0,
  };
}

function extractRecommendation(payload: unknown): PlanRecommendation | null {
  const direct = validateRecommendation(payload);
  if (direct) return direct;

  const geminiPayload = payload as GeminiResponse;
  const text = geminiPayload.candidates?.[0]?.content?.parts?.find((part) => part.text)?.text;
  if (!text) return null;

  try {
    return validateRecommendation(JSON.parse(text));
  } catch (error) {
    Logger.warn('Failed to parse Gemini recommendation JSON', error);
    return null;
  }
}

function getGeminiEndpoint(): GeminiEndpointResolution {
  const proxyUrl = geminiProxyUrl?.trim();
  if (!proxyUrl) {
    return {
      endpoint: null,
      failureReason: 'gemini_proxy_not_configured',
    };
  }

  if (!proxyUrl.startsWith('/')) {
    try {
      const url = new URL(proxyUrl);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        Logger.warn('Gemini recommendation proxy URL must use http or https.');
        return {
          endpoint: null,
          failureReason: 'invalid_gemini_proxy_protocol',
        };
      }
    } catch {
      Logger.warn('Gemini recommendation proxy URL is invalid; using rule-based fallback.');
      return {
        endpoint: null,
        failureReason: 'invalid_gemini_proxy_url',
      };
    }
  }

  return {
    endpoint: {
      url: proxyUrl,
      headers: {},
      mode: 'proxy',
    },
    failureReason: null,
  };
}

export async function generateGeminiRecommendation(
  answers: DecisionAnswers,
  holiday: Holiday | null,
  calendarContext: CalendarContext | null,
  options?: RecommendationPromptOptions
): Promise<GeminiRecommendationResult> {
  const { endpoint, failureReason: endpointFailureReason } = getGeminiEndpoint();

  if (!endpoint) {
    Logger.warn('Gemini recommendation endpoint is not configured; using rule-based fallback.', {
      failureReason: endpointFailureReason,
      model: geminiModel,
    });
    return {
      success: false,
      recommendation: null,
      source: 'rule_based',
      model: geminiModel,
      httpStatus: null,
      failureReason: endpointFailureReason,
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), geminiRequestTimeoutMs);

    try {
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...endpoint.headers,
        },
        body: JSON.stringify(buildGeminiRequest(answers, holiday, calendarContext, options)),
        signal: controller.signal,
      });

      if (!response.ok) {
        const message = await response.text();
        Logger.warn('Gemini recommendation request failed', {
          status: response.status,
          mode: endpoint.mode,
          message,
        });
        return {
          success: false,
          recommendation: null,
          source: 'rule_based',
          model: geminiModel,
          httpStatus: response.status,
          failureReason: `gemini_http_${response.status}`,
        };
      }

      const recommendation = extractRecommendation(await response.json());
      if (!recommendation) {
        Logger.warn('Gemini recommendation response could not be normalized.', {
          model: geminiModel,
          status: response.status,
        });
        return {
          success: false,
          recommendation: null,
          source: 'rule_based',
          model: geminiModel,
          httpStatus: response.status,
          failureReason: 'invalid_gemini_response_shape',
        };
      }

      Logger.log('Gemini recommendation generated successfully.', {
        model: geminiModel,
        status: response.status,
      });
      return {
        success: true,
        recommendation: normalizeRecommendationMetadata({
          ...recommendation,
          source: 'gemini',
          model: geminiModel,
          failureReason: null,
          httpStatus: response.status,
          retryCount: 0,
        }),
        source: 'gemini',
        model: geminiModel,
        httpStatus: response.status,
        failureReason: null,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    Logger.warn('Gemini recommendation request errored', error);
    return {
      success: false,
      recommendation: null,
      source: 'rule_based',
      model: geminiModel,
      httpStatus: null,
      failureReason: 'gemini_request_error',
    };
  }
}
