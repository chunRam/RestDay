import type { Holiday } from '../store/useAppStore';
import type {
  DecisionAnswers,
  PlanIntensity,
  PlanItem,
  PlanRecommendation,
  PlanRecommendationBundle,
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

const geminiModel = process.env.EXPO_PUBLIC_GEMINI_MODEL || 'gemini-3.1-flash-lite';
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

const planRecommendationBundleSchema = {
  type: 'object',
  properties: {
    light: planRecommendationSchema,
    balanced: planRecommendationSchema,
    full: planRecommendationSchema,
  },
  required: ['light', 'balanced', 'full'],
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

function buildPrompt(answers: DecisionAnswers, holiday: Holiday | null) {
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
    `처음 보여줄 계획 강도: ${answerLabels.intensity[answers.intensity]}`,
    `꼭 해야 하는 일: ${answers.mustDo.trim() || '없음'}`,
    '',
    '규칙:',
    '- light, balanced, full 세 강도 계획을 모두 작성하세요.',
    '- 각 강도마다 계획은 오전, 오후, 저녁 3개만 작성하세요.',
    '- 각 계획은 작고 구체적인 행동이어야 합니다.',
    '- 꼭 해야 하는 일에 시간이 포함되어 있으면 그 시간을 보존하고 맞는 시간대 계획에 넣으세요.',
    '- 세 강도 모두 같은 꼭 해야 하는 일은 유지하되, 주변 계획의 밀도와 여유만 조정하세요.',
    '- 사용자의 컨디션보다 과하게 빡빡한 계획을 만들지 마세요.',
    '- 앱의 핵심은 휴일 전 의사결정이므로, 방향과 이유가 먼저 분명해야 합니다.',
    '- 반드시 JSON 스키마에 맞는 데이터만 반환하세요.',
  ].join('\n');
}

function buildGeminiRequest(answers: DecisionAnswers, holiday: Holiday | null) {
  return {
    model: geminiModel,
    contents: [
      {
        parts: [
          {
            text: buildPrompt(answers, holiday),
          },
        ],
      },
    ],
    generationConfig: {
      responseFormat: {
        text: {
          mimeType: 'APPLICATION_JSON',
          schema: planRecommendationBundleSchema,
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
  };
}

function validateRecommendationBundle(value: unknown): PlanRecommendationBundle | null {
  if (!value || typeof value !== 'object') return null;

  const candidate = value as Partial<Record<PlanIntensity, unknown>>;
  const light = validateRecommendation(candidate.light);
  const balanced = validateRecommendation(candidate.balanced);
  const full = validateRecommendation(candidate.full);

  if (!light || !balanced || !full) return null;

  return { light, balanced, full };
}

function extractRecommendationBundle(payload: unknown): PlanRecommendationBundle | null {
  const direct = validateRecommendationBundle(payload);
  if (direct) return direct;

  const geminiPayload = payload as GeminiResponse;
  const text = geminiPayload.candidates?.[0]?.content?.parts?.find((part) => part.text)?.text;
  if (!text) return null;

  try {
    return validateRecommendationBundle(JSON.parse(text));
  } catch (error) {
    Logger.warn('Failed to parse Gemini recommendation bundle JSON', error);
    return null;
  }
}

function getGeminiEndpoint(): GeminiEndpoint | null {
  const proxyUrl = geminiProxyUrl?.trim();
  if (!proxyUrl) return null;

  if (!proxyUrl.startsWith('/')) {
    try {
      const url = new URL(proxyUrl);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        Logger.warn('Gemini recommendation proxy URL must use http or https.');
        return null;
      }
    } catch {
      Logger.warn('Gemini recommendation proxy URL is invalid; using rule-based fallback.');
      return null;
    }
  }

  return {
    url: proxyUrl,
    headers: {},
    mode: 'proxy',
  };
}

export async function generateGeminiRecommendationBundle(
  answers: DecisionAnswers,
  holiday: Holiday | null
): Promise<PlanRecommendationBundle | null> {
  const endpoint = getGeminiEndpoint();

  if (!endpoint) {
    Logger.log('Gemini recommendation endpoint is not configured; using rule-based fallback bundle.');
    return null;
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
        body: JSON.stringify(buildGeminiRequest(answers, holiday)),
        signal: controller.signal,
      });

      if (!response.ok) {
        const message = await response.text();
        Logger.warn('Gemini recommendation request failed', {
          status: response.status,
          mode: endpoint.mode,
          message,
        });
        return null;
      }

      return extractRecommendationBundle(await response.json());
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    Logger.warn('Gemini recommendation request errored', error);
    return null;
  }
}
