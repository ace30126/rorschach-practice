// Claude Messages API 호출 (BYOK). 빌드 도구 없는 PWA라 SDK 대신 fetch로 직접 호출한다.
// 키는 이 브라우저에만 저장되고 api.anthropic.com 으로만 전송된다.

const API_URL = 'https://api.anthropic.com/v1/messages';

export const MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (기본)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (저렴, 빠름)' },
];

// 안전 분류기가 거절하면 서버가 다른 모델로 이어서 답하게 한다. Haiku는 지원하지 않는다.
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5']);

export async function callClaude({ apiKey, model, system, messages, schema, effort, maxTokens = 16000 }) {
  const headers = {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  };
  const body = {
    model,
    max_tokens: maxTokens,
    system,
    messages,
    cache_control: { type: 'ephemeral' },
    output_config: { effort, format: { type: 'json_schema', schema } },
  };
  if (FALLBACK_MODELS.has(model)) {
    headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
    body.fallbacks = 'default';
  }

  let res;
  try {
    res = await fetch(API_URL, { method: 'POST', headers, body: JSON.stringify(body) });
  } catch {
    throw new Error('네트워크 오류입니다. 인터넷 연결을 확인해 주세요.');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || res.statusText;
    if (res.status === 401) throw new Error('API 키가 올바르지 않습니다. 설정에서 키를 확인해 주세요.');
    if (res.status === 429) throw new Error('요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.');
    if (res.status >= 500) throw new Error(`Anthropic 서버 오류(${res.status})입니다. 잠시 후 다시 시도해 주세요.`);
    throw new Error(`API 오류(${res.status}): ${msg}`);
  }

  if (data.stop_reason === 'refusal') {
    throw new Error('모델이 이 요청에 답하지 않았습니다. 표현을 바꿔 다시 시도해 주세요.');
  }
  if (data.stop_reason === 'max_tokens') {
    throw new Error('응답이 길이 제한에 걸려 잘렸습니다. 다시 시도해 주세요.');
  }

  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('응답 형식을 읽지 못했습니다. 다시 시도해 주세요.');
  }
}
