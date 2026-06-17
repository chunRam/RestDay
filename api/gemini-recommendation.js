const defaultModel = 'gemini-3.1-flash-lite';
const retryableStatuses = new Set([429, 500, 503]);
const retryDelaysMs = [350, 900];

function setCorsHeaders(response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
}

function getGeminiBody(requestBody) {
  return {
    contents: requestBody.contents,
    generationConfig: requestBody.generationConfig,
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getRetryDelay(response, attemptIndex) {
  const retryAfter = Number(response.headers.get('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * 1000, 3000);
  }

  return retryDelaysMs[attemptIndex] ?? 0;
}

async function callGemini({ model, apiKey, body }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  for (let attemptIndex = 0; attemptIndex <= retryDelaysMs.length; attemptIndex += 1) {
    const geminiResponse = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body,
    });

    if (!retryableStatuses.has(geminiResponse.status) || attemptIndex === retryDelaysMs.length) {
      return geminiResponse;
    }

    await sleep(getRetryDelay(geminiResponse, attemptIndex));
  }

  throw new Error('Gemini retry loop exited unexpectedly');
}

module.exports = async function handler(request, response) {
  setCorsHeaders(response);

  if (request.method === 'OPTIONS') {
    response.status(204).end();
    return;
  }

  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    response.status(500).json({ error: 'Gemini API key is not configured' });
    return;
  }

  if (!Array.isArray(request.body?.contents)) {
    response.status(400).json({ error: 'Missing contents' });
    return;
  }

  const model =
    typeof request.body.model === 'string' && request.body.model.trim()
      ? request.body.model.trim()
      : defaultModel;

  try {
    const geminiResponse = await callGemini({
      model,
      apiKey,
      body: JSON.stringify(getGeminiBody(request.body)),
    });

    const responseText = await geminiResponse.text();
    response.status(geminiResponse.status);
    response.setHeader('Content-Type', geminiResponse.headers.get('content-type') || 'application/json');
    response.send(responseText);
  } catch (error) {
    response.status(500).json({ error: 'Gemini recommendation proxy failed' });
  }
};
